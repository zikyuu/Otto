"""Database client — Supabase REST API via supabase-py.

Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
No direct PostgreSQL connection needed.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_url = os.getenv("SUPABASE_URL", "")
_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not _url or not _key:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
    )

supabase: Client = create_client(_url, _key)


def get_supabase() -> Client:
    return supabase
