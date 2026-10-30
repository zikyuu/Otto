"""Test isolation: no network calls, no real API keys, no writes to the real profile.

Must run before app modules import (they call load_dotenv at import time, which never
overrides a variable that is already set — so blank values here win over backend/.env).
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

for key in ("OPENAI_API_KEY",):
    os.environ[key] = ""

_tmp = tempfile.mkdtemp(prefix="otto-tests-")
os.environ["OTTO_PROFILE_PATH"] = str(Path(_tmp) / "profile.json")
os.environ["OTTO_KV_PATH"] = str(Path(_tmp) / "kv.json")
os.environ["OTTO_KV_BACKEND"] = "file"          # never touch a real Supabase from the tests
for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"):
    os.environ[key] = ""

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_profile_store():
    """Every test starts from a cold-start profile on disk."""
    p = Path(os.environ["OTTO_PROFILE_PATH"])
    if p.exists():
        p.unlink()
    kv = Path(os.environ["OTTO_KV_PATH"])
    if kv.exists():
        kv.unlink()
    yield
