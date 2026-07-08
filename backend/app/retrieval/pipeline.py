from __future__ import annotations
import uuid
import datetime
import numpy as np

from app.retrieval.models import CorpusEntry, RankedResource
from app.retrieval.embed import embed_text, entry_text, query_text, DIM
from app.retrieval.index import CorpusIndex
from app.retrieval.rerank import rerank
from app.retrieval import store

RETRIEVE_K = 20
DEDUP_THRESHOLD = 0.95


class RetrievalPipeline:
    def __init__(self):
        self._entries: dict[str, CorpusEntry] = {}
        self._index = CorpusIndex(DIM)
        self._loaded = False

    def _ensure_loaded(self):
        # load existing corpus from supabase into FAISS on first use
        if self._loaded:
            return
        try:
            for e in store.load_all():
                if e.embedding:
                    self._entries[e.id] = e
                    self._index.add(e.id, np.array(e.embedding, dtype=np.float32))
            print(f"[pipeline] loaded {len(self._entries)} entries from Supabase")
        except Exception as ex:
            print(f"[pipeline] cold start, store unavailable: {ex}")
        self._loaded = True

    def query(
        self,
        skill: str,
        role: str,
        slot_minutes: int,
        user_proficiency: int = 1,
        top_n: int = 5,
    ) -> list[RankedResource]:
        self._ensure_loaded()

        # always call Exa — embed new results, dedup, grow the index
        self._ingest_from_exa(skill, role)

        # embed the query and search
        q_vec = embed_text(query_text(skill, role, slot_minutes, user_proficiency))
        hits = self._index.search(q_vec, RETRIEVE_K)

        # prefer candidates matching this skill, fall back to anything
        candidates = [(self._entries[eid], sim) for eid, sim in hits
                      if eid in self._entries and self._entries[eid].skill == skill]
        if not candidates:
            candidates = [(self._entries[eid], sim) for eid, sim in hits
                          if eid in self._entries]

        return rerank(candidates, slot_minutes, user_proficiency, top_n)

    def ingest(self, entry: CorpusEntry) -> bool:
        # check Supabase first (survives restarts), then in-memory
        if store.url_exists(entry.url):
            return False
        if any(e.url == entry.url for e in self._entries.values()):
            return False

        if not entry.embedding:
            vec = embed_text(entry_text(entry))
            entry.embedding = vec.tolist()
        else:
            vec = np.array(entry.embedding, dtype=np.float32)

        # semantic dedup — skip near-duplicates already in the index
        if len(self._entries) > 0:
            hits = self._index.search(vec, 1)
            if hits and hits[0][1] >= DEDUP_THRESHOLD:
                return False

        entry.fetched_at = entry.fetched_at or datetime.datetime.utcnow().isoformat()
        self._entries[entry.id] = entry
        self._index.add(entry.id, vec)
        try:
            store.save(entry)
        except Exception as ex:
            print(f"[pipeline] store.save failed (non-fatal): {ex}")
        return True

    def _ingest_from_exa(self, skill: str, role: str) -> None:
        for raw in _fetch_exa(skill, role):
            self.ingest(CorpusEntry(
                id=str(uuid.uuid4()),
                title=raw["title"],
                url=raw["url"],
                description=raw.get("description", ""),
                skill=skill,
                resource_type=_classify_url(raw["url"]),
                difficulty=2,
                est_minutes=_estimate_minutes(raw.get("description", ""), raw["url"]),
                source_quality=_quality_score(raw["url"]),
                tags=[skill, role],
            ))


def _fetch_exa(skill: str, role: str) -> list[dict]:
    import os
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return []
    try:
        from exa_py import Exa
        client = Exa(api_key=api_key)
        queries = [
            f"{role} {skill} interview prep guide tutorial",
            f"{skill} leetcode problems practice",
        ]
        results, seen = [], set()
        for q in queries:
            for r in client.search_and_contents(q, num_results=5, text={"max_characters": 400}).results:
                if r.url not in seen:
                    seen.add(r.url)
                    results.append({
                        "title": getattr(r, "title", "") or r.url,
                        "url": r.url,
                        "description": getattr(r, "text", "") or "",
                    })
        return results
    except Exception as ex:
        print(f"[pipeline] Exa failed for skill={skill!r}: {ex}")
        return []


def _classify_url(url: str) -> str:
    if "leetcode.com" in url: return "problem"
    if "youtube.com" in url or "youtu.be" in url: return "video"
    if "coursera.org" in url or "udemy.com" in url or "educative.io" in url: return "course"
    return "article"


def _estimate_minutes(description: str, url: str) -> int:
    if "leetcode.com" in url: return 45
    if "youtube.com" in url or "youtu.be" in url: return 20
    if "coursera.org" in url or "udemy.com" in url: return 180
    return max(10, min(60, len(description.split()) // 5))


def _quality_score(url: str) -> float:
    high = ("neetcode.io", "leetcode.com", "bytebytego.com", "github.com", "mit.edu")
    mid = ("medium.com", "dev.to", "geeksforgeeks.org", "youtube.com")
    if any(h in url for h in high): return 0.9
    if any(m in url for m in mid): return 0.7
    return 0.6


_pipeline: RetrievalPipeline | None = None

def get_pipeline() -> RetrievalPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = RetrievalPipeline()
    return _pipeline
