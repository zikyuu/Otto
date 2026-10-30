"""Persistent profile store — the learned state (velocity, peak window, completion
rate, signal history) lives here so it survives restarts and every /api/schedule
call reads the latest version.

A single JSON file keeps this dependency-free. Path override: OTTO_PROFILE_PATH.
Swap load/save for Supabase later without touching callers.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path

from app import auth, kv
from app.models import Profile

_LOCK = threading.RLock()


def _path() -> Path:
    override = os.getenv("OTTO_PROFILE_PATH")
    if override:
        return Path(override)
    return Path(__file__).parent.parent / "data" / "profile.json"


_PROFILE_KEY = "profile.data"       # a signed-in person's profile is a kv document (their own, and in Supabase when it is configured)


def _signed_in() -> bool:
    return auth.current_user.get() != auth.LOCAL


def load_profile() -> Profile:
    """Stored profile, or a cold-start default if none/corrupt."""
    if _signed_in():
        try:
            d = kv.get(_PROFILE_KEY)
            return Profile.from_dict(d) if isinstance(d, dict) else Profile()
        except (ValueError, KeyError, TypeError):
            return Profile()
    with _LOCK:
        path = _path()
        if not path.exists():
            return Profile()
        try:
            return Profile.from_dict(json.loads(path.read_text()))
        except (ValueError, KeyError, TypeError):
            return Profile()


def save_profile(profile: Profile) -> None:
    """Atomic write: a crash mid-save can't leave a half-written profile."""
    if _signed_in():
        kv.put(_PROFILE_KEY, profile.to_dict())
        return
    with _LOCK:
        path = _path()
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(profile.to_dict(), f, indent=2)
            os.replace(tmp, path)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


@contextmanager
def locked_profile():
    """Load → mutate → save under one lock so concurrent signals don't clobber each other.

        with locked_profile() as p:
            apply_all_signals(p, reflection)
    """
    with _LOCK:
        p = load_profile()
        yield p
        save_profile(p)
