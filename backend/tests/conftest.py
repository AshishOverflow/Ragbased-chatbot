import re
from functools import lru_cache

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app import config, embeddings, main, store


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


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(config, "CHUNK_TOKENS", 5)
    monkeypatch.setattr(config, "CHUNK_OVERLAP", 1)
    @lru_cache(maxsize=1)
    def fake_model():
        return None

    monkeypatch.setattr(embeddings, "model", fake_model)
    monkeypatch.setattr(embeddings, "token_spans", spans)
    monkeypatch.setattr(embeddings, "embed_passages", lambda texts: [[1.0, 0.0] for _ in texts])
    monkeypatch.setattr(embeddings, "embed_query", lambda q: [1.0, 0.0])

    db: dict = {"doc": None, "chunks": []}

    def replace_index(doc_id, filename, pages, chunks, vectors):
        db["doc"] = {"doc_id": doc_id, "filename": filename, "pages": pages, "chunks": len(chunks)}
        db["chunks"] = list(chunks)

    monkeypatch.setattr(store, "replace_index", replace_index)
    monkeypatch.setattr(store, "current_document", lambda: db["doc"])
    monkeypatch.setattr(store, "search", lambda v, d, k: [store.Hit(c.page, c.text) for c in db["chunks"][:k]])
    monkeypatch.setattr(store, "ping", lambda: None)
    c = TestClient(main.app)
    c.db = db
    return c
