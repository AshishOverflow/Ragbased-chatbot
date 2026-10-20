import json

import pytest
from fastapi.testclient import TestClient

from app import config, embeddings, llm, main, store
from tests.conftest import spans


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(config, "CHUNK_TOKENS", 5)
    monkeypatch.setattr(config, "CHUNK_OVERLAP", 1)
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


def upload(client, data: bytes, name="doc.pdf"):
    return client.post("/api/upload", files={"file": (name, data, "application/pdf")})


def sse(response) -> list[tuple[str, object]]:
    out = []
    for block in response.text.strip().split("\n\n"):
        event, data = block.split("\n", 1)
        out.append((event.removeprefix("event: "), json.loads(data.removeprefix("data: "))))
    return out


def test_upload_rejects_non_pdf(client):
    assert upload(client, b"hello world").status_code == 400
    assert client.db["doc"] is None


def test_upload_rejects_corrupt_pdf(client):
    assert upload(client, b"%PDF-1.4 garbage").status_code == 400


def test_upload_rejects_pdf_without_text(client, pdf_bytes):
    r = upload(client, pdf_bytes(["", ""]))
    assert r.status_code == 422
    assert not list(config.UPLOAD_DIR.glob("*"))


def test_upload_indexes_and_replaces(client, pdf_bytes):
    r = upload(client, pdf_bytes(["one two three four five six seven", "eight nine"]))
    assert r.status_code == 200
    body = r.json()
    assert body["pages"] == 2 and body["chunks"] == 3
    assert {c.page for c in client.db["chunks"]} == {1, 2}

    r2 = upload(client, pdf_bytes(["only page"]), name="second.pdf")
    assert r2.json()["doc_id"] != body["doc_id"]
    assert client.db["doc"]["filename"] == "second.pdf"
    files = list(config.UPLOAD_DIR.glob("*"))
    assert [f.name for f in files] == [f"{r2.json()['doc_id']}.pdf"]


def test_chat_requires_upload(client):
    assert client.post("/api/chat", json={"question": "hi"}).status_code == 409


def test_chat_validates_question(client):
    assert client.post("/api/chat", json={"question": "   "}).status_code == 422


def test_chat_streams_sources_tokens_done(client, pdf_bytes, monkeypatch):
    upload(client, pdf_bytes(["alpha beta gamma"]))

    async def fake(messages, transport=None):
        assert "alpha beta gamma" in messages[1]["content"]
        for t in ["The answer ", "[Page 1]"]:
            yield t

    monkeypatch.setattr(llm, "stream_answer", fake)
    r = client.post("/api/chat", json={"question": "what?"})
    assert r.headers["content-type"].startswith("text/event-stream")
    events = sse(r)
    assert events[0] == ("sources", [1])
    assert [e for e, _ in events[1:]] == ["token", "token", "done"]


def test_chat_reports_midstream_failure_without_done(client, pdf_bytes, monkeypatch):
    upload(client, pdf_bytes(["alpha beta gamma"]))

    async def fake(messages, transport=None):
        yield "partial"
        raise llm.LLMError("connection dropped")

    monkeypatch.setattr(llm, "stream_answer", fake)
    events = sse(client.post("/api/chat", json={"question": "what?"}))
    names = [e for e, _ in events]
    assert names[-1] == "error" and "done" not in names
    assert events[-1][1] == {"message": "connection dropped"}


def test_health(client, monkeypatch):
    async def ok():
        return {"ok": True, "model": "qwen3:8b", "model_available": True}

    monkeypatch.setattr(main, "_check_ollama", ok)
    assert client.get("/api/health").status_code == 200

    async def down():
        return {"ok": False, "model": "qwen3:8b", "error": "refused"}

    monkeypatch.setattr(main, "_check_ollama", down)
    r = client.get("/api/health")
    assert r.status_code == 503 and r.json()["status"] == "degraded"


def test_cors_allows_configured_origin_only(client):
    ok = client.options(
        "/api/chat",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"

    bad = client.options(
        "/api/chat",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in bad.headers
