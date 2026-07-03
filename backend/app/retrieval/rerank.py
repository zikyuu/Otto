# manual rescoring 
from __future__ import annotations
import datetime
from app.retrieval.models import CorpusEntry, RankedResource

def score(
        entry: CorpusEntry,
        cosine_sim: float,
        slot_minutes: int,
        user_proficiency: int,
):
    # courses/videos are splittable across sessions so length doesn't hurt them;
    # problems (leetcode) are atomic — can't half-solve across two sittings
    ratio = entry.est_minutes / max(slot_minutes, 1)
    if ratio <= 1.5:
        time_fit = 1.0
    elif entry.resource_type in ("course", "video"):
        time_fit = 0.8
    else:
        time_fit = 0.3
    
    # target difficulty slightly above current level
    target = min(3, user_proficiency + 1)
    difficulty_fit = 1.0 - abs(entry.difficulty - target) / 2.0

    # freshness: decay resources older than 2 years
    freshness = 1.0
    if entry.fetched_at:
        try:
            age_days = (datetime.datetime.utcnow() - datetime.datetime.fromisoformat(entry.fetched_at)).days
            freshness = max(0.5, 1.0 - age_days / 730)
        except Exception:
            pass
    
    final = (
        0.50 * cosine_sim +
        0.25 * time_fit +
        0.15 * difficulty_fit +
        0.05 * entry.source_quality +
        0.05 * freshness
    )
    return RankedResource(entry=entry, score=final, cosine_sim=cosine_sim,
                          time_fit=time_fit, difficulty_fit=difficulty_fit)

def rerank(
        candidates: list[tuple[CorpusEntry, float]],
        slot_minutes: int,
        user_proficiency: int,
        top_n: int = 5
):
    scored = [score(e, sim, slot_minutes, user_proficiency) for e, sim in candidates]
    scored.sort(key=lambda r: r.score, reverse=True)
    return _diversify(scored, top_n)

def _diversify(ranked: list[RankedResource], n: int):
    seen_types: set[str] = set()
    out: list[RankedResource] = []
    remainder: list[RankedResource] = []
    for r in ranked:
        if r.entry.resource_type not in seen_types:
            out.append(r)
            seen_types.add(r.entry.resource_type)
        else:
            remainder.append(r)
        if len(out) >= n:
            break
    for r in remainder:
        if len(out) >= n:
            break
        out.append(r)
    return out