from pdftools.handlers.office import make_profile


def test_the_libreoffice_profile_never_updates_links_or_fields(tmp_path):
    profile = make_profile(tmp_path)
    xcu = (profile / "user" / "registrymodifications.xcu").read_text(encoding="utf-8")
    assert '<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value>' in xcu
    assert '<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Field" oor:op="fuse"><value>false</value>' in xcu
    assert '<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value>' in xcu
    assert '<prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value>' in xcu
