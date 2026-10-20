# Local PDF RAG chat

React (Vite) frontend + FastAPI + PyMuPDF + `BAAI/bge-small-en-v1.5` + ChromaDB (Docker) + Qwen3 8B via native Ollama.
One PDF at a time; uploading a new one replaces the previous index and file.

| Service | URL (host) | Notes |
|---|---|---|
| Frontend (Vite dev server) | http://localhost:5173 | open this in the browser |
| Backend API | http://localhost:8000 | published on `127.0.0.1` only |
| ChromaDB | not published | reachable only by the backend, as `chroma:8000` |
| Ollama | `localhost:11434` on the host | reached by the backend as `host.docker.internal`; never exposed to the browser |

## Start

```bash
ollama pull qwen3:8b        # skip if you already have it
ollama serve                # skip if the Ollama app is already running
cp .env.example .env        # optional
docker compose up --build
curl localhost:8000/api/health
```

Then open **http://localhost:5173**, click *Upload PDF*, wait for the status to read "indexed", and ask a question.

The first start downloads the embedding model (~130 MB) into the `hf_cache` volume; later restarts reuse it.
The API is published on `127.0.0.1:8000` only. ChromaDB is not published at all.

## Frontend

`frontend/` is a React + Vite app with plain CSS and no other runtime dependencies. In Compose it runs the Vite dev
server on port 5173 (rebuild with `docker compose up --build` after editing frontend files).

How the networking works:

- The **browser** calls the backend directly at `VITE_API_BASE_URL`, so that URL must work from your machine
  (`http://localhost:8000`, set in `compose.yaml` from `API_PORT`). It must not be a service name such as `backend`.
- **Container-to-container** traffic uses service names: the backend talks to ChromaDB at `chroma:8000`.
  The frontend container never calls the backend itself.
- Because the page (`:5173`) and the API (`:8000`) are different origins, the backend allows the origins in
  `CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173`).

Run the frontend on the host instead of in Docker (backend and ChromaDB still in Compose):

```bash
docker compose up --build backend chroma
cd frontend
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev               # http://localhost:5173
npm run build             # production bundle in frontend/dist
```

Behavior notes: chat is disabled until a PDF is indexed; a PDF already indexed on the backend is picked up again
after a page reload; uploading a new PDF clears the on-screen conversation (the conversation lives only in React state).
Answers are shown as plain text; `[Page N]` citations are highlighted and the retrieved pages are listed under each answer.

If you change `API_PORT`, the frontend follows it automatically in Compose. If you serve the frontend from another
origin or port, add it to `CORS_ORIGINS`.

## API

```bash
# Upload (replaces any previously indexed PDF)
curl -F file=@paper.pdf localhost:8000/api/upload

# Ask (Server-Sent Events; -N disables curl buffering)
curl -N -X POST localhost:8000/api/chat -H 'content-type: application/json' \
     -d '{"question": "What are the main conclusions?"}'

curl localhost:8000/api/health   # 200 = ok, 503 = ChromaDB or Ollama/model unavailable
```

Chat stream events:

| event | data |
|---|---|
| `sources` | `[1, 4, 7]` pages that were retrieved |
| `token` | `{"text": "..."}` answer fragment |
| `done` | `{}` the answer is complete |
| `error` | `{"message": "..."}` the answer is incomplete; discard or flag it |

A stream that ends without `done` or `error` should be treated as failed.

CORS: only the origins in `CORS_ORIGINS` may call the API from a browser.

Errors: `400` not a valid/readable PDF, `413` too large, `422` no extractable text (scanned PDFs need OCR, which is not supported),
`409` no PDF uploaded yet or an upload already in progress, `503` ChromaDB unavailable.

## Configuration

See `.env.example`. `OLLAMA_BASE_URL` defaults to `http://host.docker.internal:11434`.
Chunks are ~500 embedding-model tokens with 50 overlap and never span pages. The top 5 are sent to the model.

## Tests

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

Tests use fakes for the embedding model, ChromaDB and Ollama, so they need no network or running services.

## Troubleshooting

| Symptom | Check |
|---|---|
| `/api/health` shows `ollama.ok: false` | Is Ollama running? `curl localhost:11434/api/tags` on the Mac. |
| Ollama is up but unreachable from the container | Restart it listening on all interfaces: `OLLAMA_HOST=0.0.0.0 ollama serve`. Test: `docker compose exec backend python -c "import urllib.request as u;print(u.urlopen('http://host.docker.internal:11434/api/tags').status)"` |
| `Model not found in Ollama` | `ollama list`; `ollama pull qwen3:8b`, or set `OLLAMA_MODEL`. |
| `chroma.ok: false` | `docker compose ps`, `docker compose logs chroma`. |
| Browser console shows a CORS error or "Cannot reach the server" | Is the backend up (`curl localhost:8000/api/health`)? Does `CORS_ORIGINS` include the exact origin in the address bar (`localhost` and `127.0.0.1` differ)? |
| Answers cut off with a context-limit error | Lower `TOP_K`/`CHUNK_TOKENS` or raise `OLLAMA_NUM_CTX`. |
| Slow first request | Qwen3 8B is loading into memory; later requests are faster. |

Reset everything (deletes the index, uploaded PDF and model cache):

```bash
docker compose down -v
```
