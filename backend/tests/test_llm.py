import asyncio
import json

import httpx
import pytest

from app import llm
from app.store import Hit


def run(body: bytes | None = None, status: int = 200, raise_exc: Exception | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if raise_exc:
            raise raise_exc
        payload = json.loads(request.content)
        assert payload["stream"] is True and payload["model"] == "qwen3:8b"
        return httpx.Response(status, content=body or b"")

    async def collect() -> list[str]:
        return [t async for t in llm.stream_answer([], httpx.MockTransport(handler))]

    return asyncio.run(collect())


def lines(*objs: dict) -> bytes:
    return b"\n".join(json.dumps(o).encode() for o in objs) + b"\n"


def msg(text: str) -> dict:
    return {"message": {"role": "assistant", "content": text}, "done": False}


def test_streams_tokens():
    body = lines(msg("Hel"), msg("lo [Page 2]"), {"done": True, "done_reason": "stop", "message": {"content": ""}})
    assert run(body) == ["Hel", "lo [Page 2]"]


def test_error_line_raises():
    with pytest.raises(llm.LLMError, match="boom"):
        run(lines(msg("partial"), {"error": "boom"}))


def test_truncated_stream_raises():
    with pytest.raises(llm.LLMError, match="closed"):
        run(lines(msg("partial")))


def test_length_cutoff_raises():
    with pytest.raises(llm.LLMError, match="cut off"):
        run(lines(msg("x"), {"done": True, "done_reason": "length", "message": {"content": ""}}))


def test_empty_response_raises():
    with pytest.raises(llm.LLMError, match="empty"):
        run(lines({"done": True, "done_reason": "stop", "message": {"content": ""}}))


def test_http_error_raises():
    with pytest.raises(llm.LLMError, match="HTTP 404"):
        run(b'{"error":"model not found"}', status=404)


def test_connection_error_raises():
    with pytest.raises(llm.LLMError, match="Connection to Ollama"):
        run(raise_exc=httpx.ConnectError("refused"))


def test_invalid_json_raises():
    with pytest.raises(llm.LLMError, match="invalid"):
        run(b"not json\n")


def test_complete_stops_when_the_card_array_closes():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        seen["num_predict"] = payload["options"]["num_predict"]
        seen["format"] = payload["format"]["type"]
        body = lines(
            msg('<think>planning</think>[{"front": "Q", "back": "A", "source": "Page 1"}]'),
            msg(" this essay should not be waited for"),
            {"done": True, "done_reason": "stop", "message": {"content": ""}},
        )
        return httpx.Response(200, content=body)

    async def go() -> str:
        return await llm.complete(
            [],
            transport=httpx.MockTransport(handler),
            max_tokens=400,
            json_schema={"type": "array"},
        )

    text = asyncio.run(go())
    assert text == '[{"front": "Q", "back": "A", "source": "Page 1"}]'
    assert seen == {"num_predict": 400, "format": "array"}


def test_closed_json_array_waits_out_an_open_think_block():
    assert not llm._closed_json_array('<think> [1, 2]')
    assert llm._closed_json_array('<think>nope</think>[{"a": "]"}]')


def test_build_messages_includes_pages():
    m = llm.build_messages("Why?", [Hit(3, "alpha"), Hit(7, "beta")])
    assert "[Page 3]\nalpha" in m[1]["content"] and "[Page 7]\nbeta" in m[1]["content"]
    assert m[1]["content"].endswith("Question: Why?")


def test_streams_tokens_openai_lmstudio(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "LLM_PROVIDER", "lmstudio")
    monkeypatch.setattr(config, "LLM_MODEL", "qwen3.5:9b")

    sse_data = (
        b"data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}, \"finish_reason\": null}]}\n\n"
        b"data: {\"choices\": [{\"delta\": {\"content\": \" [Page 1]\"}, \"finish_reason\": \"stop\"}]}\n\n"
        b"data: [DONE]\n\n"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        payload = json.loads(request.content)
        assert payload["model"] == "qwen3.5:9b"
        assert payload["stream"] is True
        return httpx.Response(200, content=sse_data)

    async def collect() -> list[str]:
        return [t async for t in llm.stream_answer([], httpx.MockTransport(handler))]

    tokens = asyncio.run(collect())
    assert tokens == ["Hello", " [Page 1]"]

