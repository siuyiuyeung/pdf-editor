import sys
from pathlib import Path

from ..errors import JobError
from .pdfcheck import ensure_openable
from .proc import run

# Directory that contains the `pdftools` package, so `python -m` finds it from any working directory.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def pdf_to_word(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    ensure_openable(src)
    out = out_dir / "output.docx"
    result = run([sys.executable, "-m", "pdftools.handlers.pdf2docx_cli", str(src), str(out)], timeout_s, cwd=str(PACKAGE_ROOT))
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be converted to Word")
    return out
