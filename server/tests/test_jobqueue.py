from datetime import datetime, timedelta, timezone

import fakeredis
from rq.job import JobStatus
from rq.results import Result

from pdftools.jobqueue import RQJobQueue


def queued_job():
    queue = RQJobQueue(fakeredis.FakeRedis())
    queue.enqueue("a" * 32, "compress-pdf", 60)
    return queue, queue._fetch("a" * 32)


def test_a_queued_job_is_queued():
    queue, _ = queued_job()
    assert queue.state("a" * 32) == ("queued", None)


def test_a_running_job_with_a_fresh_heartbeat_is_running():
    queue, job = queued_job()
    job.set_status(JobStatus.STARTED)
    job.heartbeat(datetime.now(timezone.utc), 600)
    assert queue.state("a" * 32) == ("running", None)


def test_a_running_job_whose_worker_stopped_heartbeating_is_failed():
    queue, job = queued_job()
    job.set_status(JobStatus.STARTED)
    job.heartbeat(datetime.now(timezone.utc) - timedelta(minutes=5), 600)
    status, result = queue.state("a" * 32)
    assert status == "failed"
    assert result["error"]["code"] == "CONVERSION_FAILED"


def test_a_job_killed_by_the_rq_timeout_reports_timeout():
    queue, job = queued_job()
    job.set_status(JobStatus.FAILED)
    Result.create_failure(job, 600, "Traceback ...\nrq.timeouts.JobTimeoutException: Task exceeded maximum timeout value (90 seconds)")
    status, result = queue.state("a" * 32)
    assert status == "failed"
    assert result["error"]["code"] == "TIMEOUT"


def test_other_failures_have_no_specific_error():
    queue, job = queued_job()
    job.set_status(JobStatus.FAILED)
    Result.create_failure(job, 600, "Traceback ...\nRuntimeError: boom")
    assert queue.state("a" * 32) == ("failed", None)
