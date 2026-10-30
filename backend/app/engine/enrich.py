"""Async task enrichment: a long, loosely-worded task gets structure from one batched LLM call.

A task whose description runs past 15 words is worth reading properly: the call returns a short title, a
category, a time estimate and a few subtasks. At most 5 tasks are enriched per week (the quota is kept by the
caller) and the whole batch is one request. Everything the model returns is clamped, so the UI can apply it
without checking.
"""
from __future__ import annotations

import re
from typing import Any

WORD_LIMIT = 15
WEEKLY_QUOTA = 5
CATEGORIES = ("deep_work", "admin", "creative", "physical", "social")

SYSTEM = (
    "You tidy up tasks for a planner. For each task (id, text) return a short imperative title (max 7 words), "
    "a category (one of deep_work, admin, creative, physical, social), an honest time estimate in minutes "
    "(15-480, multiple of 5), an importance 1-5, and 0-5 concrete subtasks with minutes each (multiples of 5, "
    "summing to about the estimate). Do not invent deadlines. "
    'Return JSON: {"tasks": [{"id": "...", "title": "...", "category": "...", "minutes": 60, "importance": 3, '
    '"subtasks": [{"name": "...", "minutes": 20}]}]}'
)


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text or ""))


def needs_enrichment(text: str) -> bool:
    return word_count(text) > WORD_LIMIT


def clean(data: dict[str, Any], asked: dict[str, str]) -> list[dict[str, Any]]:
    """Whatever came back, for the ids that were asked about: bounded, well-typed, no extras."""
    out = []
    for row in (data.get("tasks") or []):
        if not isinstance(row, dict) or row.get("id") not in asked:
            continue
        try:
            minutes = max(15, min(480, int(round(float(row.get("minutes", 60)) / 5.0)) * 5))
        except (TypeError, ValueError):
            minutes = 60
        cat = row.get("category") if row.get("category") in CATEGORIES else "admin"
        try:
            imp = max(1, min(5, int(row.get("importance", 3))))
        except (TypeError, ValueError):
            imp = 3
        subs = []
        for s in (row.get("subtasks") or [])[:5]:
            if isinstance(s, dict) and str(s.get("name") or "").strip():
                try:
                    m = max(5, min(240, int(round(float(s.get("minutes", 15)) / 5.0)) * 5))
                except (TypeError, ValueError):
                    m = 15
                subs.append({"name": str(s["name"]).strip()[:80], "minutes": m})
        title = str(row.get("title") or "").strip()[:80] or asked[row["id"]][:60]
        out.append({"id": row["id"], "title": title, "category": cat, "minutes": minutes, "importance": imp, "subtasks": subs})
    return out
