from functools import lru_cache

from . import config

QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache(maxsize=1)
def model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(config.EMBEDDING_MODEL)


def is_loaded() -> bool:
    return model.cache_info().currsize > 0


def token_spans(text: str) -> list[tuple[int, int]]:
    enc = model().tokenizer(
        text, add_special_tokens=False, return_offsets_mapping=True, verbose=False
    )
    return [(s, e) for s, e in enc["offset_mapping"]]


def embed_passages(texts: list[str]) -> list[list[float]]:
    return model().encode(texts, batch_size=32, normalize_embeddings=True).tolist()


def embed_query(question: str) -> list[float]:
    return model().encode(QUERY_PREFIX + question, normalize_embeddings=True).tolist()
