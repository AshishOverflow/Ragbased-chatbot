import os
from pathlib import Path

# LLM Provider configuration: supports 'ollama' (default) or 'lmstudio' / 'openai'
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_NUM_CTX = int(os.environ.get("OLLAMA_NUM_CTX", "8192"))

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "").lower()
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "").rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "")
LLM_NUM_CTX = int(os.environ.get("LLM_NUM_CTX", str(OLLAMA_NUM_CTX)))

# Auto-detect LM Studio if port 1234 or /v1 is in the URL, or if LLM_PROVIDER is set
if not LLM_PROVIDER:
    if "1234" in OLLAMA_BASE_URL or "1234" in LLM_BASE_URL or "/v1" in (LLM_BASE_URL or OLLAMA_BASE_URL):
        LLM_PROVIDER = "lmstudio"
    else:
        LLM_PROVIDER = "ollama"

if not LLM_BASE_URL:
    if LLM_PROVIDER in ("lmstudio", "openai"):
        LLM_BASE_URL = "http://host.docker.internal:1234" if "11434" in OLLAMA_BASE_URL else OLLAMA_BASE_URL
    else:
        LLM_BASE_URL = OLLAMA_BASE_URL

if not LLM_MODEL:
    LLM_MODEL = OLLAMA_MODEL

CHROMA_HOST = os.environ.get("CHROMA_HOST", "chroma")
CHROMA_PORT = int(os.environ.get("CHROMA_PORT", "8000"))

EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

UPLOAD_DIR = Path(os.environ.get("DATA_DIR", "/data")) / "uploads"
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))

CHUNK_TOKENS = int(os.environ.get("CHUNK_TOKENS", "500"))
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "50"))
TOP_K = int(os.environ.get("TOP_K", "5"))

# Browser origins allowed to call the API (the React dev server). Comma-separated.
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]
