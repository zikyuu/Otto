"""Is this machine (or a Render service) ready for Otto's accounts and storage?

    cd backend && .venv/bin/python scripts/check_deploy.py

Reads backend/.env (or the real environment) and checks, in order: the settings are present, the Supabase project answers,
Google sign-in is switched on in it, the otto_kv table exists, the public (anon) key cannot read anybody's data, and a
saved document survives with no local copy to fall back on. It never prints a key. It leaves nothing behind.
"""
from __future__ import annotations

import os
import re
import socket
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
import httpx  # noqa: E402

OK, BAD, WARN = "  ok   ", "  FAIL ", "  warn "
failed = 0


def say(mark: str, msg: str) -> None:
    global failed
    if mark == BAD:
        failed += 1
    print(mark + msg)


def have(name: str) -> bool:
    return bool(os.getenv(name, "").strip())


print("1. Settings")
for name, why in [("SUPABASE_URL", "where the data lives"), ("SUPABASE_ANON_KEY", "lets the page sign in (public key)"),
                  ("SUPABASE_SERVICE_ROLE_KEY", "lets the server save data (secret)")]:
    say(OK if have(name) else BAD, f"{name}: {'set' if have(name) else 'MISSING'} ({why})")
say(OK if have("OPENAI_API_KEY") else WARN, "OPENAI_API_KEY: " + ("set (pays for each account's one free goal review)" if have("OPENAI_API_KEY") else "not set (nobody gets a free AI call; that is fine)"))
say(OK if os.getenv("OTTO_REQUIRE_LOGIN", "").lower() in ("1", "true", "yes") else WARN, "OTTO_REQUIRE_LOGIN: " + ("on" if os.getenv("OTTO_REQUIRE_LOGIN", "").lower() in ("1", "true", "yes") else "off (set it to 1 on Render, or anyone can use the app without signing in)"))
say(OK if have("OTTO_SECRET_KEY") or have("SUPABASE_SERVICE_ROLE_KEY") else BAD, "OTTO_SECRET_KEY: " + ("set" if have("OTTO_SECRET_KEY") else "not set (saved OpenAI keys will be protected with a hash of the service key instead)"))
say(OK if have("OTTO_ORIGIN") else WARN, "OTTO_ORIGIN: " + ("set" if have("OTTO_ORIGIN") else "not set (set it to your Render address so only your site may call the API from a browser)"))
if not (have("SUPABASE_URL") and have("SUPABASE_ANON_KEY") and have("SUPABASE_SERVICE_ROLE_KEY")):
    print("\nFill in the three SUPABASE_ values first (Supabase dashboard > Project settings > API), then run this again.")
    sys.exit(1)

url = os.environ["SUPABASE_URL"].rstrip("/")
host = re.sub(r"^https?://", "", url).split("/")[0]
print("\n2. The Supabase project")
try:
    socket.gethostbyname(host)
    say(OK, f"{host} exists")
except OSError:
    say(BAD, f"{host} does not exist. The project was deleted or the URL is wrong. Create a new project and use its URL.")
    sys.exit(1)

anon = {"apikey": os.environ["SUPABASE_ANON_KEY"]}
try:
    r = httpx.get(f"{url}/auth/v1/settings", headers=anon, timeout=10)
    if r.status_code == 200:
        g = r.json().get("external", {}).get("google")
        say(OK if g else BAD, "Google sign-in: " + ("switched on" if g else "OFF. Supabase > Authentication > Providers > Google"))
    else:
        say(BAD, f"auth settings answered {r.status_code}: the anon key is probably wrong or the project is paused")
except Exception as e:
    say(BAD, f"could not reach the auth service: {e}")

print("\n3. Storage")
os.environ.pop("OTTO_KV_BACKEND", None)
cache = tempfile.mktemp(suffix=".json")
os.environ["OTTO_KV_PATH"] = cache
from app import kv  # noqa: E402

sb = kv._supabase()
if sb is None:
    say(BAD, "the Supabase client could not start (check the service-role key)")
else:
    try:
        sb.table("otto_kv").select("key").limit(1).execute()
        say(OK, "table otto_kv exists")
        table = True
    except Exception as e:
        say(BAD, "table otto_kv is not usable: " + str(e)[:160] + "\n         run backend/migrations/001_otto_kv.sql then 002_otto_kv_rls.sql in the Supabase SQL editor")
        table = False
    if table:
        kv.put("deploycheck.row", {"n": 1})
        os.remove(cache) if os.path.exists(cache) else None            # no local copy left to cheat with
        back = kv.get("deploycheck.row")
        say(OK if back == {"n": 1} else BAD, "a saved document is read back from Supabase alone: " + ("yes" if back == {"n": 1} else f"NO, got {back!r}"))
        try:
            ra = httpx.get(f"{url}/rest/v1/otto_kv?select=key&limit=1", headers={**anon, "Authorization": f"Bearer {anon['apikey']}"}, timeout=10)
            leaked = ra.status_code == 200 and ra.json() not in ([], None)
            say(BAD if leaked else OK, "public key can read the table: " + ("YES, run 002_otto_kv_rls.sql" if leaked else "no (row-level security is on)"))
        except Exception as e:
            say(WARN, f"could not test the public key: {e}")
        kv.delete("deploycheck.row")
        left = sb.table("otto_kv").select("key").eq("key", "deploycheck.row").execute().data
        say(OK if not left else WARN, "test row cleaned up")

print("\n" + ("Not ready: fix the FAIL lines above." if failed else "Ready for the one thing this cannot test: sign in with Google in a browser."))
sys.exit(1 if failed else 0)
