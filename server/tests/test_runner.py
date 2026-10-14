import logging
from pathlib import Path

from pdftools.errors import JobError
from pdftools.runner import run_job
from pdftools.storage import JobStore

PDF = b"%PDF-" + b"x" * 100


def setup_job(tmp_path, data=PDF, opts=None, name="doc"):
    store = JobStore(tmp_path)
    job_id = store.new_id()
    store.create(job_id)
    store.input_path(job_id, ".pdf").write_bytes(data)
    store.write_meta(job_id, {"tool": "compress-pdf", "name": name, "size": len(data), "opts": opts or {}})
    return store, job_id


def writer(content: bytes, name="output.pdf"):
    seen = {}

    def handle(src: Path, out_dir: Path, opts: dict) -> Path:
        seen.update(src=src, opts=opts)
        out = out_dir / name
        out.write_bytes(content)
        return out

    return handle, seen


def test_success_returns_the_output_name_and_passes_options(tmp_path):
    store, job_id = setup_job(tmp_path, opts={"level": "high"})
    handle, seen = writer(b"%PDF-small")
    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result == {"ok": True, "output": "output.pdf", "note": None}
    assert seen["opts"] == {"level": "high"}
    assert seen["src"].name == "input.pdf"


def test_compress_that_does_not_shrink_returns_the_original(tmp_path):
    store, job_id = setup_job(tmp_path)
    handle, _ = writer(b"%PDF-" + b"y" * 500)
    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result == {"ok": True, "output": "output.pdf", "note": "already-compressed"}
    assert (store.out_dir(job_id) / "output.pdf").read_bytes() == PDF


def test_job_errors_are_returned_not_raised(tmp_path):
    store, job_id = setup_job(tmp_path)

    def boom(src, out_dir, opts):
        raise JobError("ENCRYPTED", "Protected PDF")

    assert run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": boom}) == {
        "ok": False,
        "error": {"code": "ENCRYPTED", "message": "Protected PDF"},
    }


def test_unexpected_errors_become_conversion_failed(tmp_path):
    store, job_id = setup_job(tmp_path)

    def crash(src, out_dir, opts):
        raise RuntimeError("segfault-ish")

    result = run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": crash})
    assert result["ok"] is False and result["error"]["code"] == "CONVERSION_FAILED"


def test_a_deleted_job_fails_cleanly(tmp_path):
    store = JobStore(tmp_path)
    handle, _ = writer(b"x")
    result = run_job(store.new_id(), "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert result["ok"] is False and result["error"]["code"] == "CONVERSION_FAILED"


def test_the_log_line_never_contains_the_file_name(tmp_path, caplog):
    store, job_id = setup_job(tmp_path, name="secret-salary-review")
    handle, _ = writer(b"%PDF-small")
    with caplog.at_level(logging.INFO, logger="pdftools.worker"):
        run_job(job_id, "compress-pdf", store=store, handlers={"compress-pdf": handle})
    assert job_id in caplog.text and "compress-pdf" in caplog.text and "status=done" in caplog.text
    assert "secret" not in caplog.text
