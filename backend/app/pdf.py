import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import pymupdf

Spans = Callable[[str], list[tuple[int, int]]]


class PDFError(ValueError):
    """The file is not a readable PDF."""


@dataclass(frozen=True)
class Chunk:
    page: int
    text: str


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def extract_pages(path: Path) -> tuple[int, list[tuple[int, str]]]:
    """Return (total page count, [(1-based page number, text)] for pages that have text)."""
    try:
        doc = pymupdf.open(str(path), filetype="pdf")
    except Exception as e:
        raise PDFError("The file is not a valid PDF.") from e
    try:
        if not doc.is_pdf:
            raise PDFError("The file is not a valid PDF.")
        if doc.needs_pass:
            raise PDFError("Password-protected PDFs are not supported.")
        pages = [
            (number, text)
            for number, page in enumerate(doc, start=1)
            if (text := _clean(page.get_text("text")))
        ]
        return doc.page_count, pages
    except PDFError:
        raise
    except Exception as e:
        raise PDFError("The PDF could not be read; it may be corrupted.") from e
    finally:
        doc.close()


def chunk_text(text: str, spans: Spans, size: int, overlap: int) -> list[str]:
    """Split text into windows of `size` tokens sharing `overlap` tokens.

    `spans(text)` returns one (start_char, end_char) pair per token.
    """
    if not 0 <= overlap < size:
        raise ValueError("overlap must be >= 0 and smaller than size")
    tokens = spans(text)
    chunks = []
    for start in range(0, len(tokens), size - overlap):
        end = min(start + size, len(tokens))
        piece = text[tokens[start][0] : tokens[end - 1][1]].strip()
        if piece:
            chunks.append(piece)
        if end == len(tokens):
            break
    return chunks


def chunk_pages(pages: list[tuple[int, str]], spans: Spans, size: int, overlap: int) -> list[Chunk]:
    return [
        Chunk(page, piece)
        for page, text in pages
        for piece in chunk_text(text, spans, size, overlap)
    ]
