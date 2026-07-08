# store.py: stores the faiss entries (embedded stuff) into supabase as well :-)
from __future__ import annotations
import datetime
import json
import os
from supabase import create_client
from app.retrieval.models import CorpusEntry

_sb_client = None

def _sb():
    global _sb_client
    if _sb_client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _sb_client = create_client(url, key)
    return _sb_client

def load_all():
    rows = _sb().table("resource_corpus").select("*").execute().data
    entries = []
    for r in rows:
        try:
            entries.append(CorpusEntry(
                id=r["id"],
                title=r["title"],
                url=r["url"],
                description=r.get("description", ""),
                skill=r["skill"],
                resource_type=r.get("resource_type", "article"),
                difficulty=r.get("difficulty", 2),
                est_minutes=r.get("est_minutes", 30),
                source_quality=r.get("source_quality", 0.7),
                tags=r.get("tags") or [],
                fetched_at=r.get("fetched_at", ""),
                embedding=json.loads(r["embedding"]) if isinstance(r.get("embedding"), str) else (r.get("embedding") or []),
            ))
        except Exception as e:
            print(f"[store] skipping malformed row {r.get('id')}: {e}")
    return entries

def save(entry):
    _sb().table("resource_corpus").upsert({
        "id": entry.id,
        "title": entry.title,
        "url": entry.url,
        "description": entry.description,
        "skill": entry.skill,
        "resource_type": entry.resource_type,
        "difficulty": entry.difficulty,
        "est_minutes": entry.est_minutes,
        "source_quality": entry.source_quality,
        "tags": entry.tags,
        "fetched_at": entry.fetched_at or datetime.datetime.utcnow().isoformat(),
        "embedding": entry.embedding,
    }, on_conflict="id").execute()

def url_exists(url: str) -> bool:
    r = _sb().table("resource_corpus").select("id").eq("url", url).limit(1).execute()
    return bool(r.data)
