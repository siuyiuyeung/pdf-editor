import pytest

from pdftools.storage import JobStore


def test_create_paths_meta_and_delete(tmp_path):
    store = JobStore(tmp_path)
    job_id = store.new_id()
    assert store.valid_id(job_id)
    store.create(job_id)
    src = store.input_path(job_id, ".pdf")
    assert src == tmp_path / job_id / "in" / "input.pdf"
    src.write_bytes(b"x")
    assert store.find_input(job_id) == src
    assert store.out_dir(job_id).is_dir()
    store.write_meta(job_id, {"a": 1})
    assert store.read_meta(job_id) == {"a": 1}
    assert store.exists(job_id)
    assert store.delete(job_id)
    assert not store.exists(job_id)
    assert store.read_meta(job_id) is None
    assert store.find_input(job_id) is None


@pytest.mark.parametrize("bad", ["../x", "a" * 32 + "/..", "", "ABCDEF" * 6, "g" * 32, "a" * 32 + "\n"])
def test_ids_that_could_escape_the_root_are_rejected(tmp_path, bad):
    store = JobStore(tmp_path)
    assert not store.valid_id(bad)
    with pytest.raises(ValueError):
        store.job_dir(bad)
    assert not store.exists(bad)
    assert not store.delete(bad)
    assert store.read_meta(bad) is None
