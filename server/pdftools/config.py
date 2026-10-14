"""Settings shared by the API, the worker and the sweeper."""

import os
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(os.environ.get("PDFTOOLS_DATA", "/data/jobs"))
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "pdftools"

MAX_BYTES = 50 * 1024 * 1024
RATE_LIMIT = int(os.environ.get("PDFTOOLS_RATE_LIMIT", "20"))
RATE_WINDOW_S = 600
QUEUE_CAP = 50
JOB_MAX_AGE_S = 3600
SWEEP_EVERY_S = 600


@dataclass(frozen=True)
class ToolSpec:
    extensions: frozenset[str]
    timeout_s: int
    #: Appended to the user's file name (without extension) for the download.
    output_suffix: str


TOOLS: dict[str, ToolSpec] = {
    "compress-pdf": ToolSpec(frozenset({".pdf"}), 60, "-compressed.pdf"),
    "word-to-pdf": ToolSpec(frozenset({".doc", ".docx"}), 90, ".pdf"),
    "excel-to-pdf": ToolSpec(frozenset({".xls", ".xlsx"}), 90, ".pdf"),
    "powerpoint-to-pdf": ToolSpec(frozenset({".ppt", ".pptx"}), 90, ".pdf"),
    "pdf-to-word": ToolSpec(frozenset({".pdf"}), 120, ".docx"),
}

#: Spec §5: Ghostscript PDFSETTINGS per compression level.
COMPRESS_LEVELS = {"low": "/printer", "medium": "/ebook", "high": "/screen"}
