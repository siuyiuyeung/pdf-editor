import shutil
import tempfile
from pathlib import Path

from ..errors import JobError
from .proc import run

# Never refresh links or fields while loading, and refuse to fetch linked resources: a crafted document must
# not pull files from the worker's disk into its own PDF.
_LOCKDOWN = {
    ("/org.openoffice.Office.Writer/Content/Update", "Link"): "0",
    ("/org.openoffice.Office.Writer/Content/Update", "Field"): "false",
    ("/org.openoffice.Office.Writer/Content/Update", "Chart"): "false",
    ("/org.openoffice.Office.Calc/Content/Update", "Link"): "0",
    ("/org.openoffice.Office.Common/Security/Scripting", "BlockUntrustedRefererLinks"): "true",
}


def make_profile(parent: Path) -> Path:
    """A fresh LibreOffice user profile with link and field updates disabled."""
    profile = Path(tempfile.mkdtemp(prefix="lo-profile-", dir=parent))
    items = "\n".join(
        f'<item oor:path="{path}"><prop oor:name="{name}" oor:op="fuse"><value>{value}</value></prop></item>'
        for (path, name), value in _LOCKDOWN.items()
    )
    (profile / "user").mkdir()
    (profile / "user" / "registrymodifications.xcu").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n'
        f"{items}\n</oor:items>\n",
        encoding="utf-8",
    )
    return profile


def to_pdf(src: Path, out_dir: Path, opts: dict, timeout_s: int) -> Path:
    """LibreOffice headless conversion with a throwaway, locked-down profile per job (spec §8)."""
    profile = make_profile(Path(tempfile.gettempdir()))
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
