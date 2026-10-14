import os
import time

from pdftools.sweeper import sweep


def test_sweep_removes_only_job_dirs_older_than_max_age(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    (old / "in").mkdir(parents=True)
    (old / "in" / "input.pdf").write_bytes(b"x")
    new.mkdir()
    (tmp_path / "stray.txt").write_text("x")
    now = time.time()
    os.utime(old, (now - 4000, now - 4000))
    os.utime(new, (now - 100, now - 100))

    assert sweep(tmp_path, now, 3600) == 1
    assert not old.exists()
    assert new.exists()
    assert (tmp_path / "stray.txt").exists()


def test_sweep_tolerates_a_missing_root(tmp_path):
    assert sweep(tmp_path / "missing", time.time(), 3600) == 0
