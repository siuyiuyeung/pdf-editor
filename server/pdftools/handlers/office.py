import shutil
import tempfile
from pathlib import Path

from ..errors import JobError
from .proc import run


def to_pdf(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    """LibreOffice headless conversion with a throwaway profile per job (spec §8)."""
    profile = Path(tempfile.mkdtemp(prefix="lo-profile-"))
    try:
        result = run(
            [
                "soffice", f"-env:UserInstallation={profile.as_uri()}",
                "--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck",
                "--convert-to", "pdf", "--outdir", str(out_dir), str(src),
            ],
            timeout_s,
        )
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    out = out_dir / f"{src.stem}.pdf"
    if result.returncode != 0 or not out.is_file() or out.stat().st_size == 0:
        raise JobError("CONVERSION_FAILED", "This document couldn't be converted")
    return out
