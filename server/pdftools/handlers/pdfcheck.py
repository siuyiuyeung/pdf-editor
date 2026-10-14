"""Opens the PDF in a child process so a PyMuPDF hang is killed by the same timeout as the converters."""

import sys
from pathlib import Path

from ..errors import JobError
from .proc import run

#: Fits inside RQ's backstop (tool timeout + 30 s) together with the converter's own timeout.
CHECK_TIMEOUT_S = 20
# Directory that contains the `pdftools` package, so `python -m` finds it from any working directory.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]

EXIT_ENCRYPTED, EXIT_NO_PAGES, EXIT_UNREADABLE = 3, 4, 5


def check_command(src: Path) -> list[str]:
    return [sys.executable, "-m", "pdftools.handlers.pdfcheck", str(src)]


def ensure_openable(src: Path) -> None:
    """ENCRYPTED for password-protected PDFs, CONVERSION_FAILED for files PyMuPDF cannot open, TIMEOUT if it hangs."""
    result = run(check_command(src), CHECK_TIMEOUT_S, cwd=str(PACKAGE_ROOT))
    if result.returncode == 0:
        return
    if result.returncode == EXIT_ENCRYPTED:
        raise JobError("ENCRYPTED", "This PDF is password-protected")
    if result.returncode == EXIT_NO_PAGES:
        raise JobError("CONVERSION_FAILED", "This PDF has no pages")
    raise JobError("CONVERSION_FAILED", "This PDF couldn't be read")


def main(src: str) -> int:
    import pymupdf

    try:
        with pymupdf.open(src) as doc:
            if doc.needs_pass:
                return EXIT_ENCRYPTED
            if doc.page_count == 0:
                return EXIT_NO_PAGES
    except Exception:
        return EXIT_UNREADABLE
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
