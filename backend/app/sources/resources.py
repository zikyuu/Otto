"""On-demand Exa resource enrichment for scheduled tasks.

Fetches up to 6 curated resources (LeetCode, articles, videos) for a given
skill and role. Returns [] when EXA_API_KEY is absent or on any error —
same defensive pattern as _exa_skills() in gaps.py.
"""
from __future__ import annotations

import logging
import os

_log = logging.getLogger(__name__)

from app.models import Resource

try:
    from exa_py import Exa  # type: ignore
except ImportError:
    Exa = None  # type: ignore


def _classify_url(url: str) -> str:
    if "leetcode.com" in url:
        return "leetcode"
    if "youtube.com" in url or "youtu.be" in url:
        return "video"
    return "article"


def fetch_resources(skill: str, role: str) -> list[Resource]:
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return []
    if Exa is None:
        return []
    try:
        client = Exa(api_key=api_key)
        queries = [
            f"{role} {skill} interview prep resources guide",
            f"{role} {skill} leetcode problems",
        ]
        resources: list[Resource] = []
        for query in queries:
            res = client.search_and_contents(query, num_results=3, text={"max_characters": 500})
            for r in res.results:
                resources.append(Resource(
                    title=getattr(r, "title", None) or r.url,
                    url=r.url,
                    type=_classify_url(r.url),
                ))
        # Deduplicate by URL (two queries may surface the same resource)
        seen: set[str] = set()
        unique: list[Resource] = []
        for r in resources:
            if r.url not in seen:
                seen.add(r.url)
                unique.append(r)
        return unique[:6]
    except Exception:
        _log.exception("fetch_resources failed for skill=%r role=%r", skill, role)
        return []
