from __future__ import annotations
import os
import numpy as np
from openai import OpenAI

DIM = 512 # text-embedding-3-small supports up to 3072; 512 is fast and good enough

_client: OpenAI | None = None # client holds type of OpenAI but starts off as None

def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client

def embed_text(text):
    r = _get_client().embeddings.create(
        model="text-embedding-3-small",
        input=text,
        dimensions=DIM,
    )
    return np.array(r.data[0].embedding, dtype=np.float32)

def embed_batch(texts):
    if not texts:
        return np.zeros((0, DIM), dtype=np.float32)
    r = _get_client().embeddings.create(
        model="text-embedding-3-small",
        input=texts,
        dimensions=DIM,
    )
    return np.array([d.embedding for d in r.data], dtype=np.float32)

# text we embed for a CorpusEntry -> what the index sees
def entry_text(entry):
    tags = " ".join(entry.tags)
    return f"{entry.title}. {entry.description}. {tags}. skill: {entry.skill}"

# text we embed for a query :-)
def query_text(skill, role, slot_minutes, proficiency):
    level = {0: "beginner", 1: "beginner", 2: "intermediate", 3: "advanced"}.get(proficiency, "intermediate")
    return f"{role} {skill} interview prep. {level} level. {slot_minutes} minutes study session."