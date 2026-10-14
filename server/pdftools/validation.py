"""Upload checks that never trust the client: extension whitelist, magic bytes, safe display names."""

import re

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc/.xls/.ppt
ZIP_MAGIC = b"PK\x03\x04"  # .docx/.xlsx/.pptx

_UNSAFE = re.compile(r"[^\w.\- ]+")


def _basename(name: str) -> str:
    return name.replace("\\", "/").rsplit("/", 1)[-1]


def extension_of(name: str) -> str:
    stem, dot, ext = _basename(name).rpartition(".")
    return f".{ext.lower()}" if dot and stem else ""


def looks_like(ext: str, head: bytes) -> bool:
    """True when the first bytes match the container format the extension claims."""
    if ext == ".pdf":
        return b"%PDF-" in head[:1024]
    if ext in (".doc", ".xls", ".ppt"):
        return head.startswith(OLE_MAGIC)
    if ext in (".docx", ".xlsx", ".pptx"):
        return head.startswith(ZIP_MAGIC)
    return False


def display_base(name: str) -> str:
    """The user's file name without directory or extension, reduced to safe characters.

    Used only to name the download; it never becomes part of a filesystem path.
    """
    base = _basename(name)
    stem, dot, _ext = base.rpartition(".")
    if not dot or not stem:
        stem = base
    safe = _UNSAFE.sub("_", stem).strip(" ._-")[:100].strip(" ._-")
    return safe or "document"
