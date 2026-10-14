import os
import signal
import subprocess

from ..errors import JobError


def run(cmd: list[str], timeout_s: int, cwd: str | None = None) -> subprocess.CompletedProcess:
    """Runs `cmd` in its own session; on timeout the whole process group is killed (spec §8)."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, cwd=cwd)
    try:
        out, err = proc.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise JobError("TIMEOUT", f"Conversion took longer than {timeout_s} seconds") from None
    return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
