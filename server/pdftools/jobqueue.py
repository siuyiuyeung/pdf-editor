"""Queue adapter. The API depends only on the JobQueue protocol, so tests can use an in-memory fake."""

from typing import Protocol

from . import config


class JobQueue(Protocol):
    def enqueue(self, job_id: str, tool: str, timeout_s: int) -> None: ...

    def state(self, job_id: str) -> tuple[str, dict | None] | None:
        """("queued" | "running" | "done" | "failed", worker result) or None when unknown."""
        ...

    def delete(self, job_id: str) -> None: ...

    def length(self) -> int: ...


class RQJobQueue:
    def __init__(self, redis) -> None:
        from rq import Queue

        self.redis = redis
        self.queue = Queue(config.QUEUE_NAME, connection=redis)

    def enqueue(self, job_id: str, tool: str, timeout_s: int) -> None:
        self.queue.enqueue(
            "pdftools.runner.run_job",
            job_id,
            tool,
            job_id=job_id,
            job_timeout=timeout_s + 30,  # the handler kills the converter first; RQ's limit is a backstop
            result_ttl=config.JOB_MAX_AGE_S,
            failure_ttl=config.JOB_MAX_AGE_S,
        )

    def _fetch(self, job_id: str):
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        try:
            return Job.fetch(job_id, connection=self.redis)
        except NoSuchJobError:
            return None

    def state(self, job_id: str) -> tuple[str, dict | None] | None:
        from rq.job import JobStatus

        job = self._fetch(job_id)
        if job is None:
            return None
        status = job.get_status()
        if status == JobStatus.STARTED:
            return ("running", None)
        if status == JobStatus.FINISHED:
            return ("done", job.return_value())
        if status in (JobStatus.FAILED, JobStatus.STOPPED, JobStatus.CANCELED):
            return ("failed", None)
        return ("queued", None)

    def delete(self, job_id: str) -> None:
        job = self._fetch(job_id)
        if job is not None:
            job.delete(remove_from_queue=True)

    def length(self) -> int:
        return self.queue.count
