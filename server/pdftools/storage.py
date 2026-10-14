"""Job directories: /data/jobs/<id>/{in/input<ext>, out/, meta.json}. Never uses user-supplied names."""

import json
import re
import shutil
import uuid
from pathlib import Path

_ID = re.compile(r"[0-9a-f]{32}")


class JobStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex

    @staticmethod
    def valid_id(job_id: str) -> bool:
        return bool(job_id) and _ID.fullmatch(job_id) is not None

    def job_dir(self, job_id: str) -> Path:
        if not self.valid_id(job_id):
            raise ValueError("invalid job id")
        return self.root / job_id

    def create(self, job_id: str) -> Path:
        d = self.job_dir(job_id)
        (d / "in").mkdir(parents=True)
        (d / "out").mkdir()
        return d

    def input_path(self, job_id: str, ext: str) -> Path:
        return self.job_dir(job_id) / "in" / f"input{ext}"

    def find_input(self, job_id: str) -> Path | None:
        files = sorted((self.job_dir(job_id) / "in").glob("input*"))
        return files[0] if files else None

    def out_dir(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "out"

    def write_meta(self, job_id: str, meta: dict) -> None:
        (self.job_dir(job_id) / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def read_meta(self, job_id: str) -> dict | None:
        if not self.valid_id(job_id):
            return None
        try:
            return json.loads((self.job_dir(job_id) / "meta.json").read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def exists(self, job_id: str) -> bool:
        return self.valid_id(job_id) and self.job_dir(job_id).is_dir()

    def delete(self, job_id: str) -> bool:
        if not self.exists(job_id):
            return False
        shutil.rmtree(self.job_dir(job_id), ignore_errors=True)
        return True
