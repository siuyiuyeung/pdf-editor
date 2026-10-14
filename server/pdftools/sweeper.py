"""Deletes job directories older than JOB_MAX_AGE_S, regardless of job state (spec §8)."""

import logging
import shutil
import time
from pathlib import Path

from . import config

log = logging.getLogger("pdftools.sweeper")


def sweep(root: Path, now: float, max_age_s: int) -> int:
    if not root.exists():
        return 0
    removed = 0
    for entry in root.iterdir():
        try:
            if entry.is_dir() and now - entry.stat().st_mtime > max_age_s:
                shutil.rmtree(entry, ignore_errors=True)
                removed += 1
        except FileNotFoundError:
            continue  # deleted by the API in the meantime
    return removed


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    while True:
        removed = sweep(config.DATA_DIR, time.time(), config.JOB_MAX_AGE_S)
        if removed:
            log.info("swept %d job dirs", removed)
        time.sleep(config.SWEEP_EVERY_S)


if __name__ == "__main__":
    main()
