"""Turn a PDF or PowerPoint into study flashcards grounded in retrieved passages."""

import json
import re
from pathlib import Path

from .pdf import extract_pages
from .slides import extract_slides

# Leave room for the prompt and the card JSON inside a local 8k context.
MAX_SOURCE_CHARS = 6_000

# Ollama structured output. A top-level array makes the model stop when the deck is finished.
CARD_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "front": {"type": "string"},
            "back": {"type": "string"},
            "source": {"type": "string"},
        },
        "required": ["front", "back", "source"],
    },
}

# Queries embedded the same way as a chat question, then matched against chunk vectors.
STUDY_QUERIES = (
    "definitions and key terms a student should memorize",
    "important facts, steps, causes, and effects",
    "examples, formulas, comparisons, and conclusions",
)

CARD_COUNTS = (3, 5, 8, 12, 15)

SYSTEM_PROMPT = """You create study flashcards from one document. Use only the retrieved excerpts in the user message. Each excerpt is labeled with its page or slide.

Return a JSON array and nothing else. Each item is an object with:
- "front": a short question or term a student should recall
- "back": a concise answer stated in the source
- "source": the block label the answer comes from, copied exactly, such as "Page 3" or "Slide 2"

Rules:
- Cover distinct ideas spread across the whole document, not only the opening.
- Do not invent facts, examples, or numbers that the source does not state.
- Skip bare titles, slide numbers, and boilerplate that are not worth studying.
- Write in the same language as the source.
- No markdown fences, no thinking trace, and no commentary. Start the reply with [."""


class DocumentError(ValueError):
    """The upload is not a PDF or a .pptx presentation."""


def detect_kind(name: str, head: bytes) -> str:
    """Return 'pdf' or 'pptx' from the filename and the first bytes of the file."""
    lower = Path(name).name.lower()
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        raise DocumentError("Older .ppt files are not supported. Save the deck as .pptx and upload that.")
    if b"%PDF-" in head[:1024] or lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".pptx") or head[:2] == b"PK":
        return "pptx"
    raise DocumentError("Upload a PDF or a PowerPoint file (.pptx).")


def load_units(path: Path, kind: str) -> tuple[str, int, list[tuple[int, str]]]:
    """Return (label, unit count, non-empty units). Label is 'Page' or 'Slide'."""
    if kind == "pdf":
        return ("Page", *extract_pages(path))
    if kind == "pptx":
        return ("Slide", *extract_slides(path))
    raise DocumentError("Upload a PDF or a PowerPoint file (.pptx).")


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip()
    return (cut or text[:limit].rstrip()) + "…"


def fit_source(units: list[tuple[int, str]], label: str, limit: int = MAX_SOURCE_CHARS) -> str:
    """Join labeled units, shortening each one so the whole source stays within `limit`."""
    if not units:
        return ""
    per_unit = max(24, limit // len(units))
    while True:
        parts = [
            f"[{label} {number}]\n{_truncate(text, per_unit)}"
            for number, text in units
        ]
        joined = "\n\n".join(parts)
        if len(joined) <= limit or per_unit <= 24:
            return joined
        per_unit = max(24, int(per_unit * 0.75))


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def retrieve_units(
    units: list[tuple[int, str]],
    vectors: list[list[float]],
    query_vectors: list[list[float]],
    k: int,
) -> list[tuple[int, str]]:
    """Pick up to k passages by similarity to the study queries, then return them in document order.

    Ties keep the earlier passage. If the queries agree on too few passages, the rest of the
    slots are filled by walking the document so later pages still appear.
    """
    if k <= 0 or not units:
        return []
    k = min(k, len(units))
    chosen: list[int] = []
    seen: set[int] = set()

    def take(order: list[int], limit: int) -> None:
        got = 0
        for i in order:
            if i in seen:
                continue
            seen.add(i)
            chosen.append(i)
            got += 1
            if got >= limit or len(chosen) >= k:
                return

    per_query = max(1, -(-k // max(1, len(query_vectors))))
    for qv in query_vectors:
        ranked = sorted(range(len(units)), key=lambda i: (-_dot(qv, vectors[i]), i))
        take(ranked, per_query)
        if len(chosen) >= k:
            break

    if len(chosen) < k:
        need = k - len(chosen)
        candidates = [i for i in range(len(units)) if i not in seen]
        if need >= len(candidates):
            take(candidates, need)
        else:
            step = len(candidates) / need
            picks = [candidates[min(len(candidates) - 1, int(i * step))] for i in range(need)]
            take(picks, need)

    return [units[i] for i in sorted(chosen)]


def build_messages(source: str, count: int) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Create up to {count} flashcards from the retrieved excerpts. "
                "If the excerpts only support fewer distinct cards, return fewer.\n\n"
                f"Excerpts:\n\n{source}"
            ),
        },
    ]


def _clip(value: object, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit].rstrip()


def parse_cards(raw: str, limit: int) -> list[dict[str, str]]:
    """Pull a JSON card list out of a model response. Raises ValueError when nothing usable is there."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        data = json.loads(text[start : end + 1])
    else:
        obj_start, obj_end = text.find("{"), text.rfind("}")
        if obj_start == -1 or obj_end <= obj_start:
            raise ValueError("no JSON")
        data = json.loads(text[obj_start : obj_end + 1])

    if isinstance(data, dict):
        for key in ("cards", "flashcards", "items"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise ValueError("not a list")

    cards: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        front = _clip(item.get("front") or item.get("question") or item.get("term"), 280)
        back = _clip(item.get("back") or item.get("answer") or item.get("definition"), 700)
        source = _clip(item.get("source") or item.get("page") or item.get("slide"), 40)
        key = front.casefold()
        if not front or not back or key in seen:
            continue
        seen.add(key)
        cards.append({"front": front, "back": back, "source": source})
        if len(cards) >= limit:
            break
    if not cards:
        raise ValueError("no cards")
    return cards
