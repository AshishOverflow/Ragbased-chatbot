import re

import pymupdf
import pytest


def spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for m in re.finditer(r"\S+", text)]


def make_pdf(path, pages: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text)
    doc.save(str(path))
    doc.close()
    return path.read_bytes()


@pytest.fixture
def pdf_bytes(tmp_path):
    def build(pages: list[str]) -> bytes:
        return make_pdf(tmp_path / "t.pdf", pages)

    return build
