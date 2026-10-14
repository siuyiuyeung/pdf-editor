import pytest

from pdftools.validation import OLE_MAGIC, ZIP_MAGIC, display_base, extension_of, looks_like


@pytest.mark.parametrize(
    "name,ext",
    [
        ("a.PDF", ".pdf"),
        ("x.tar.docx", ".docx"),
        ("C:\\dir\\r.XLSX", ".xlsx"),
        ("noext", ""),
        ("../../etc/passwd.pdf", ".pdf"),
        ("", ""),
    ],
)
def test_extension_of(name, ext):
    assert extension_of(name) == ext


def test_looks_like_checks_container_magic():
    assert looks_like(".pdf", b"%PDF-1.7\n")
    assert looks_like(".pdf", b"\xef\xbb\xbf junk before the header %PDF-1.4")
    assert not looks_like(".pdf", b"hello")
    assert looks_like(".docx", ZIP_MAGIC + b"rest")
    assert not looks_like(".docx", OLE_MAGIC + b"rest")
    assert looks_like(".ppt", OLE_MAGIC + b"rest")
    assert not looks_like(".xls", b"")
    assert not looks_like(".exe", b"MZ")


@pytest.mark.parametrize(
    "name,base",
    [
        ("report.pdf", "report"),
        ("../../etc/passwd.pdf", "passwd"),
        ("C:\\Users\\me\\報告 v2.docx", "報告 v2"),
        ('weird<>:"|?*name.pdf', "weird_name"),
        ("???.pdf", "document"),
        ("", "document"),
        ("a" * 300 + ".pdf", "a" * 100),
    ],
)
def test_display_base(name, base):
    assert display_base(name) == base


def test_legacy_word_and_excel_exports_in_rtf_html_or_xml_are_accepted():
    assert looks_like(".doc", rb"{\rtf1\ansi hello")
    assert looks_like(".doc", b"\xef\xbb\xbf  <html><body>hi")
    assert looks_like(".xls", b"\r\n<!DOCTYPE html><table>")
    assert looks_like(".xls", b'<?xml version="1.0"?><Workbook>')
    assert looks_like(".xls", b"<table><tr><td>1</td></tr></table>")
    assert not looks_like(".ppt", rb"{\rtf1")
    assert not looks_like(".docx", rb"{\rtf1")
    assert not looks_like(".doc", b"just some text")
