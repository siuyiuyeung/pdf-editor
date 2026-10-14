"""The RQ job function. Returns the result contract read by the API; never raises."""

import logging
import shutil
import time

from . import config
from .errors import JobError
from .storage import JobStore

log = logging.getLogger("pdftools.worker")


def run_job(job_id: str, tool: str, store: JobStore | None = None, handlers: dict | None = None) -> dict:
    if handlers is None:
        from .handlers import HANDLERS

        handlers = HANDLERS
    store = store or JobStore(config.DATA_DIR)
    started = time.monotonic()
    status, size = "failed", 0
    try:
        meta = store.read_meta(job_id) if store.valid_id(job_id) else None
        src = store.find_input(job_id) if meta is not None else None
        if meta is None or src is None:
            raise JobError("CONVERSION_FAILED", "The upload is no longer available")
        size = src.stat().st_size
        out = handlers[tool](src, store.out_dir(job_id), meta.get("opts", {}))
        note = None
        if tool == "compress-pdf" and out.stat().st_size >= size:
            # Spec §5: if compression doesn't help, return the original with a notice.
            out.unlink()
            out = shutil.copyfile(src, store.out_dir(job_id) / "output.pdf")
            note = "already-compressed"
        status = "done"
        return {"ok": True, "output": out.name, "note": note}
    except JobError as e:
        status = e.code
        return {"ok": False, "error": {"code": e.code, "message": e.message}}
    except Exception:
        log.exception("job=%s tool=%s unexpected failure", job_id, tool)
        return {"ok": False, "error": {"code": "CONVERSION_FAILED", "message": "The file couldn't be converted"}}
    finally:
        log.info(
            "job=%s tool=%s size=%d duration=%.1fs status=%s", job_id, tool, size, time.monotonic() - started, status
        )
