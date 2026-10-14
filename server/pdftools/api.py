"""HTTP API: validates uploads, stores them, enqueues jobs, reports status and serves results (spec §4, §7, §8)."""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.datastructures import UploadFile

from . import config
from .jobqueue import JobQueue
from .ratelimit import RateLimiter
from .storage import JobStore
from .validation import display_base, extension_of, looks_like

log = logging.getLogger("pdftools.api")

CHUNK = 1024 * 1024
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
NOTES = {"already-compressed": "This PDF is already well compressed, so your original file is returned unchanged."}
GENERIC_FAILURE = {"code": "CONVERSION_FAILED", "message": "The file couldn't be converted"}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def not_found() -> ApiError:
    return ApiError(404, "NOT_FOUND", "This job doesn't exist or has expired")


def parse_opts(tool: str, raw: Any) -> dict:
    try:
        opts = json.loads(raw) if isinstance(raw, str) and raw else {}
    except json.JSONDecodeError:
        raise ApiError(400, "BAD_OPTIONS", "Options must be valid JSON") from None
    if not isinstance(opts, dict):
        raise ApiError(400, "BAD_OPTIONS", "Options must be a JSON object")
    if tool == "compress-pdf":
        level = opts.get("level", "medium")
        if level not in config.COMPRESS_LEVELS:
            raise ApiError(400, "BAD_OPTIONS", "Compression level must be low, medium or high")
        return {"level": level}
    return {}


def create_app(store: JobStore, queue: JobQueue, limiter: RateLimiter) -> FastAPI:
    app = FastAPI(title="PDF Tools API", docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(ApiError)
    async def api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=exc.status)

    def client_key(request: Request) -> str:
        # Trusted only because the API is reachable solely through `web` (spec §8).
        return request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")

    def load_meta(job_id: str) -> dict:
        meta = store.read_meta(job_id)
        if meta is None:
            raise not_found()
        return meta

    def job_state(job_id: str) -> tuple[str, dict | None]:
        state = queue.state(job_id)
        if state is None:
            raise not_found()
        return state

    def output_name(meta: dict) -> str:
        return meta["name"] + config.TOOLS[meta["tool"]].output_suffix

    @app.post("/jobs", status_code=202)
    async def create_job(request: Request) -> dict:
        try:
            declared = int(request.headers.get("content-length") or 0)
        except ValueError:
            raise ApiError(400, "BAD_OPTIONS", "Invalid Content-Length header") from None
        if declared > config.MAX_BYTES + CHUNK:
            raise ApiError(413, "TOO_LARGE", "File is larger than 50 MB")
        if not limiter.allow(client_key(request)):
            raise ApiError(429, "RATE_LIMITED", "Too many jobs — try again in a few minutes")
        if queue.length() >= config.QUEUE_CAP:
            raise ApiError(503, "BUSY", "The converter is busy — try again shortly")

        form = await request.form()
        tool, upload = form.get("tool"), form.get("file")
        spec = config.TOOLS.get(tool) if isinstance(tool, str) else None
        if spec is None:
            raise ApiError(400, "BAD_OPTIONS", "Unknown tool")
        if not isinstance(upload, UploadFile):
            raise ApiError(400, "BAD_OPTIONS", "No file was uploaded")
        ext = extension_of(upload.filename or "")
        if ext not in spec.extensions:
            raise ApiError(400, "UNSUPPORTED_TYPE", f"This tool accepts {', '.join(sorted(spec.extensions))} files")
        opts = parse_opts(tool, form.get("opts"))

        job_id = store.new_id()
        store.create(job_id)
        try:
            size, head = 0, b""
            with store.input_path(job_id, ext).open("wb") as fh:
                while chunk := await upload.read(CHUNK):
                    if size == 0:
                        head = chunk[:1024]
                    size += len(chunk)
                    if size > config.MAX_BYTES:
                        raise ApiError(413, "TOO_LARGE", "File is larger than 50 MB")
                    fh.write(chunk)
            if size == 0 or not looks_like(ext, head):
                raise ApiError(400, "INVALID_FILE", f"This isn't a valid {ext[1:].upper()} file")
        except BaseException:
            # Any failure (bad bytes, client disconnect, full disk) must not leave the upload behind.
            store.delete(job_id)
            raise
        finally:
            await upload.close()

        store.write_meta(job_id, {"tool": tool, "name": display_base(upload.filename or ""), "size": size, "opts": opts})
        queue.enqueue(job_id, tool, spec.timeout_s)
        log.info("job=%s tool=%s size=%d status=queued", job_id, tool, size)
        return {"id": job_id}

    @app.get("/jobs/{job_id}")
    def job_status(job_id: str) -> dict:
        meta = load_meta(job_id)
        status, result = job_state(job_id)
        if status == "done":
            if not result or not result.get("ok"):
                return {"status": "failed", "error": (result or {}).get("error") or GENERIC_FAILURE}
            out = store.out_dir(job_id) / Path(result["output"]).name
            if not out.is_file():
                raise not_found()
            output = {"name": output_name(meta), "size": out.stat().st_size, "inputSize": meta["size"]}
            if result.get("note") in NOTES:
                output["note"] = NOTES[result["note"]]
            return {"status": "done", "output": output}
        if status == "failed":
            return {"status": "failed", "error": (result or {}).get("error") or GENERIC_FAILURE}
        return {"status": status}

    @app.get("/jobs/{job_id}/file")
    def job_file(job_id: str) -> FileResponse:
        meta = load_meta(job_id)
        status, result = job_state(job_id)
        if status != "done" or not result or not result.get("ok"):
            raise ApiError(409, "NOT_READY", "The result isn't ready")
        out = store.out_dir(job_id) / Path(result["output"]).name
        if not out.is_file():
            raise not_found()
        suffix = Path("output" + config.TOOLS[meta["tool"]].output_suffix).suffix  # ".pdf" alone parses as a dotfile
        return FileResponse(out, filename=output_name(meta), media_type=MEDIA_TYPES[suffix])

    @app.delete("/jobs/{job_id}", status_code=204)
    def delete_job(job_id: str) -> Response:
        if not store.exists(job_id):
            raise not_found()
        queue.delete(job_id)
        store.delete(job_id)
        log.info("job=%s status=deleted", job_id)
        return Response(status_code=204)

    return app


def build_app() -> FastAPI:
    """uvicorn factory: `uvicorn pdftools.api:build_app --factory`."""
    from redis import Redis

    from .jobqueue import RQJobQueue

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    redis = Redis.from_url(config.REDIS_URL)
    limiter = RateLimiter(redis, config.RATE_LIMIT, config.RATE_WINDOW_S)
    return create_app(JobStore(config.DATA_DIR), RQJobQueue(redis), limiter)
