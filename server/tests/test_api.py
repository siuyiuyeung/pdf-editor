import json
import time

import fakeredis
import pytest
from fastapi.testclient import TestClient

from pdftools import config
from pdftools.api import create_app
from pdftools.ratelimit import RateLimiter
from pdftools.storage import JobStore
from pdftools.sweeper import sweep

PDF = b"%PDF-1.7\n%test\n"
DOCX = b"PK\x03\x04" + b"\0" * 20


class FakeQueue:
    def __init__(self):
        self.jobs: dict[str, tuple[str, dict | None]] = {}
        self.size = 0
        self.deleted: list[str] = []

    def enqueue(self, job_id, tool, timeout_s):
        self.jobs[job_id] = ("queued", None)

    def state(self, job_id):
        return self.jobs.get(job_id)

    def delete(self, job_id):
        self.deleted.append(job_id)
        self.jobs.pop(job_id, None)

    def length(self):
        return self.size


@pytest.fixture
def env(tmp_path):
    store, queue = JobStore(tmp_path), FakeQueue()
    limiter = RateLimiter(fakeredis.FakeRedis(), limit=config.RATE_LIMIT, window_s=config.RATE_WINDOW_S)
    return store, queue, TestClient(create_app(store, queue, limiter))


def post(client, tool="compress-pdf", name="report.pdf", data=PDF, opts=None, headers=None):
    form = {"tool": tool}
    if opts is not None:
        form["opts"] = json.dumps(opts)
    return client.post("/jobs", data=form, files={"file": (name, data, "application/octet-stream")}, headers=headers or {})


def finish(store, queue, job_id, output="output.pdf", content=b"%PDF-out", note=None):
    (store.out_dir(job_id) / output).write_bytes(content)
    queue.jobs[job_id] = ("done", {"ok": True, "output": output, "note": note})


def test_job_lifecycle(env):
    store, queue, client = env
    r = post(client, opts={"level": "high"})
    assert r.status_code == 202
    job_id = r.json()["id"]
    assert store.find_input(job_id).name == "input.pdf"
    assert store.read_meta(job_id) == {"tool": "compress-pdf", "name": "report", "size": len(PDF), "opts": {"level": "high"}}

    assert client.get(f"/jobs/{job_id}").json() == {"status": "queued"}
    queue.jobs[job_id] = ("running", None)
    assert client.get(f"/jobs/{job_id}").json() == {"status": "running"}

    finish(store, queue, job_id, content=b"%PDF-small")
    assert client.get(f"/jobs/{job_id}").json() == {
        "status": "done",
        "output": {"name": "report-compressed.pdf", "size": 10, "inputSize": len(PDF)},
    }
    f = client.get(f"/jobs/{job_id}/file")
    assert f.status_code == 200
    assert f.content == b"%PDF-small"
    assert f.headers["content-type"] == "application/pdf"
    assert 'filename="report-compressed.pdf"' in f.headers["content-disposition"]

    assert client.delete(f"/jobs/{job_id}").status_code == 204
    assert not store.exists(job_id)
    assert job_id in queue.deleted
    assert client.get(f"/jobs/{job_id}").status_code == 404


def test_output_name_and_type_per_tool(env):
    store, queue, client = env
    job_id = post(client, tool="pdf-to-word", name="Q3 報告.pdf").json()["id"]
    finish(store, queue, job_id, output="output.docx", content=b"PK\x03\x04docx")
    assert client.get(f"/jobs/{job_id}").json()["output"]["name"] == "Q3 報告.docx"
    f = client.get(f"/jobs/{job_id}/file")
    assert f.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert "filename*=utf-8''Q3%20%E5%A0%B1%E5%91%8A.docx" in f.headers["content-disposition"]

    word = post(client, tool="word-to-pdf", name="memo.docx", data=DOCX).json()["id"]
    finish(store, queue, word)
    assert client.get(f"/jobs/{word}").json()["output"]["name"] == "memo.pdf"


@pytest.mark.parametrize(
    "tool,name,data,code",
    [
        ("nope", "a.pdf", PDF, "BAD_OPTIONS"),
        ("word-to-pdf", "a.pdf", PDF, "UNSUPPORTED_TYPE"),
        ("compress-pdf", "a.docx", DOCX, "UNSUPPORTED_TYPE"),
        ("compress-pdf", "a.pdf", b"not a pdf", "INVALID_FILE"),
        ("word-to-pdf", "a.docx", b"%PDF-1.4", "INVALID_FILE"),
        ("compress-pdf", "a.pdf", b"", "INVALID_FILE"),
    ],
)
def test_rejected_uploads_leave_nothing_behind(env, tool, name, data, code):
    store, queue, client = env
    r = post(client, tool=tool, name=name, data=data)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == code
    assert list(store.root.iterdir()) == []
    assert queue.jobs == {}


def test_path_like_names_never_reach_the_disk(env):
    store, _, client = env
    job_id = post(client, name="../../etc/passwd.pdf").json()["id"]
    assert [p.name for p in (store.root / job_id / "in").iterdir()] == ["input.pdf"]
    assert store.read_meta(job_id)["name"] == "passwd"


def test_bad_options(env):
    _, _, client = env
    r = post(client, opts={"level": "max"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_OPTIONS"
    r = client.post("/jobs", data={"tool": "compress-pdf", "opts": "{nope"}, files={"file": ("a.pdf", PDF)})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_OPTIONS"


def test_too_large_while_streaming(env, monkeypatch):
    store, _, client = env
    monkeypatch.setattr(config, "MAX_BYTES", 10)
    r = post(client, data=PDF + b"x" * 20)
    assert r.status_code == 413 and r.json()["error"]["code"] == "TOO_LARGE"
    assert list(store.root.iterdir()) == []


def test_too_large_by_content_length(env, monkeypatch):
    store, _, client = env
    monkeypatch.setattr(config, "MAX_BYTES", 10)
    r = post(client, data=PDF + b"x" * (1024 * 1024 + 100))
    assert r.status_code == 413
    assert list(store.root.iterdir()) == []


def test_rate_limit_is_per_client_ip(env):
    _, _, client = env
    for _ in range(config.RATE_LIMIT):
        assert post(client, headers={"cf-connecting-ip": "1.1.1.1"}).status_code == 202
    r = post(client, headers={"cf-connecting-ip": "1.1.1.1"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    assert post(client, headers={"cf-connecting-ip": "2.2.2.2"}).status_code == 202


def test_busy_when_the_queue_is_full(env):
    _, queue, client = env
    queue.size = config.QUEUE_CAP
    r = post(client)
    assert r.status_code == 503 and r.json()["error"]["code"] == "BUSY"


def test_failed_jobs_report_the_worker_error(env):
    _, queue, client = env
    job_id = post(client).json()["id"]
    queue.jobs[job_id] = ("done", {"ok": False, "error": {"code": "ENCRYPTED", "message": "Protected"}})
    assert client.get(f"/jobs/{job_id}").json() == {"status": "failed", "error": {"code": "ENCRYPTED", "message": "Protected"}}
    assert client.get(f"/jobs/{job_id}/file").status_code == 409
    queue.jobs[job_id] = ("failed", None)
    body = client.get(f"/jobs/{job_id}").json()
    assert body["status"] == "failed" and body["error"]["code"] == "CONVERSION_FAILED"


def test_already_compressed_note(env):
    store, queue, client = env
    job_id = post(client).json()["id"]
    finish(store, queue, job_id, note="already-compressed")
    assert "already well compressed" in client.get(f"/jobs/{job_id}").json()["output"]["note"]


@pytest.mark.parametrize("job_id", ["nope", "0" * 32])
def test_unknown_or_malformed_ids_are_404(env, job_id):
    _, _, client = env
    for r in (client.get(f"/jobs/{job_id}"), client.get(f"/jobs/{job_id}/file"), client.delete(f"/jobs/{job_id}")):
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"


def test_a_job_is_gone_after_the_sweeper_runs(env):
    store, queue, client = env
    job_id = post(client).json()["id"]
    finish(store, queue, job_id)
    assert sweep(store.root, time.time() + 2 * config.JOB_MAX_AGE_S, config.JOB_MAX_AGE_S) == 1
    assert client.get(f"/jobs/{job_id}").status_code == 404
    assert client.get(f"/jobs/{job_id}/file").status_code == 404


def test_a_malformed_content_length_is_a_bad_request(env):
    _, _, client = env
    r = client.post("/jobs", headers={"content-length": "abc"}, content=b"x")
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_OPTIONS"


def test_an_unexpected_error_while_storing_the_upload_leaves_nothing_behind(env, monkeypatch):
    store, queue, _ = env
    limiter = RateLimiter(fakeredis.FakeRedis(), limit=config.RATE_LIMIT, window_s=config.RATE_WINDOW_S)
    client = TestClient(create_app(store, queue, limiter), raise_server_exceptions=False)

    def disk_full(ext, head):
        raise OSError(28, "No space left on device")

    monkeypatch.setattr("pdftools.api.looks_like", disk_full)
    assert post(client).status_code == 500
    assert list(store.root.iterdir()) == []
    assert queue.jobs == {}


def test_a_failed_job_reports_the_queue_error_when_there_is_one(env):
    _, queue, client = env
    job_id = post(client).json()["id"]
    queue.jobs[job_id] = ("failed", {"error": {"code": "TIMEOUT", "message": "Too slow"}})
    assert client.get(f"/jobs/{job_id}").json() == {"status": "failed", "error": {"code": "TIMEOUT", "message": "Too slow"}}
