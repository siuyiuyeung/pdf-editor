from pathlib import Path

from ..config import COMPRESS_LEVELS
from ..errors import JobError
from .pdfcheck import ensure_openable
from .proc import run


def compress(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    preset = COMPRESS_LEVELS.get(opts.get("level", "medium"))
    if preset is None:
        raise JobError("BAD_OPTIONS", "Compression level must be low, medium or high")
    ensure_openable(src)
    out = out_dir / "output.pdf"
    result = run(
        [
            "gs", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.5", f"-dPDFSETTINGS={preset}", "-dDetectDuplicateImages=true",
            f"-sOutputFile={out}", str(src),
        ],
        timeout_s,
    )
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be compressed")
    return out
