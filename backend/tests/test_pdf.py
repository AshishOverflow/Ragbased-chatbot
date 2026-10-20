import pytest

from app.pdf import PDFError, chunk_pages, chunk_text, extract_pages
from tests.conftest import spans


def test_chunk_text_overlap_and_coverage():
    text = " ".join(f"w{i}" for i in range(10))
    chunks = chunk_text(text, spans, size=4, overlap=1)
    assert chunks == ["w0 w1 w2 w3", "w3 w4 w5 w6", "w6 w7 w8 w9"]


def test_chunk_text_short_and_empty():
    assert chunk_text("a b", spans, 4, 1) == ["a b"]
    assert chunk_text("", spans, 4, 1) == []


def test_chunk_text_rejects_bad_overlap():
    with pytest.raises(ValueError):
        chunk_text("a b c", spans, 3, 3)


def test_chunk_pages_keeps_page_numbers():
    chunks = chunk_pages([(1, "a b c d e"), (3, "x y")], spans, 3, 1)
    assert [c.page for c in chunks] == [1, 1, 3]


def test_extract_pages_skips_blank_pages(tmp_path, pdf_bytes):
    path = tmp_path / "d.pdf"
    path.write_bytes(pdf_bytes(["hello first", "", "third page text"]))
    count, pages = extract_pages(path)
    assert count == 3
    assert [n for n, _ in pages] == [1, 3]
    assert "third page text" in pages[1][1]


def test_extract_pages_blank_pdf(tmp_path, pdf_bytes):
    path = tmp_path / "d.pdf"
    path.write_bytes(pdf_bytes(["", ""]))
    assert extract_pages(path) == (2, [])


def test_extract_pages_invalid(tmp_path):
    path = tmp_path / "bad.pdf"
    path.write_bytes(b"%PDF-1.7 this is not really a pdf")
    with pytest.raises(PDFError):
        extract_pages(path)
