from pathlib import Path

from ..errors import JobError


def ensure_openable(src: Path) -> None:
    """ENCRYPTED for password-protected PDFs, CONVERSION_FAILED for files PyMuPDF cannot open."""
    import pymupdf

    try:
        with pymupdf.open(src) as doc:
            if doc.needs_pass:
                raise JobError("ENCRYPTED", "This PDF is password-protected")
            if doc.page_count == 0:
                raise JobError("CONVERSION_FAILED", "This PDF has no pages")
    except JobError:
        raise
    except Exception:
        raise JobError("CONVERSION_FAILED", "This PDF couldn't be read") from None
