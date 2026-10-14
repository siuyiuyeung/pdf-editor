from collections.abc import Callable
from functools import partial
from pathlib import Path

from ..config import TOOLS
from .compress import compress
from .office import to_pdf
from .pdf_to_word import pdf_to_word

Handler = Callable[[Path, Path, dict], Path]

HANDLERS: dict[str, Handler] = {
    "compress-pdf": partial(compress, timeout_s=TOOLS["compress-pdf"].timeout_s),
    "word-to-pdf": partial(to_pdf, timeout_s=TOOLS["word-to-pdf"].timeout_s),
    "excel-to-pdf": partial(to_pdf, timeout_s=TOOLS["excel-to-pdf"].timeout_s),
    "powerpoint-to-pdf": partial(to_pdf, timeout_s=TOOLS["powerpoint-to-pdf"].timeout_s),
    "pdf-to-word": partial(pdf_to_word, timeout_s=TOOLS["pdf-to-word"].timeout_s),
}
