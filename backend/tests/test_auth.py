"""Login: with it off nothing changes; with it on every /api call needs a valid token and each person only sees their own data."""
import pytest
from fastapi.testclient import TestClient

from app import auth, kv, main, store

client = TestClient(main.app)
USERS = {"tok-a": ("user-a", "a@example.com"), "tok-b": ("user-b", "b@example.com")}


@pytest.fixture
def login_on(monkeypatch):
    monkeypatch.setenv("OTTO_REQUIRE_LOGIN", "1")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    auth._CACHE.clear()

    async def fake(token):
        return USERS.get(token)
    monkeypatch.setattr(auth, "fetch_user", fake)
    yield
    auth._CACHE.clear()


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_without_login_switched_on_everything_is_the_single_local_user():
    assert client.get("/api/auth/config").json() == {"required": False}
    assert client.get("/api/state").status_code == 200


def test_the_page_is_told_how_to_sign_in_but_never_a_secret(login_on, monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "very-secret")
    cfg = client.get("/api/auth/config").json()
    assert cfg == {"required": True, "supabase_url": "https://x.supabase.co", "anon_key": "anon"}
    assert "very-secret" not in str(cfg)


def test_api_calls_without_a_valid_token_are_refused(login_on):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/state", headers=h("nope")).status_code == 401
    assert client.get("/api/state", headers={"Authorization": "Bearer "}).status_code == 401
    assert client.get("/api/health").status_code == 200                     # open on purpose
    assert client.get("/api/state", headers=h("tok-a")).status_code == 200


def test_each_person_has_their_own_documents(login_on):
    assert client.put("/api/state/otto.events.v1", json={"value": ["a's event"]}, headers=h("tok-a")).status_code == 200
    assert client.get("/api/state/otto.events.v1", headers=h("tok-b")).status_code == 404
    assert client.get("/api/state/otto.events.v1", headers=h("tok-a")).json()["value"] == ["a's event"]
    assert client.get("/api/state", headers=h("tok-b")).json()["state"] == {}
    assert list(client.get("/api/state", headers=h("tok-a")).json()["state"]) == ["otto.events.v1"]


def test_a_signed_in_person_never_reads_or_writes_the_local_users_documents(login_on):
    kv.put("otto.mine", 1)                                                 # the local user's, written with no login
    assert client.get("/api/state", headers=h("tok-a")).json()["state"] == {}
    assert client.put("/api/state/otto.mine", json={"value": 2}, headers=h("tok-a")).status_code == 200
    assert kv.get("otto.mine") == 1


def test_each_person_has_their_own_learned_profile(login_on):
    assert client.post("/api/learning/energy", json={"level": 5}, headers=h("tok-a")).status_code == 200
    ta = auth.current_user.set("user-a")
    try:
        na = len(store.load_profile().energy_logs)
    finally:
        auth.current_user.reset(ta)
    tb = auth.current_user.set("user-b")
    try:
        nb = len(store.load_profile().energy_logs)
    finally:
        auth.current_user.reset(tb)
    assert (na, nb) == (1, 0)
    assert len(store.load_profile().energy_logs) == 0                      # and the local profile is untouched


def test_google_calendar_connection_belongs_to_whoever_started_it(login_on, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    url = client.get("/api/gcal/auth-url", headers=h("tok-a")).json()["url"]
    state = url.split("state=")[1].split("&")[0]
    assert state.startswith("user-a~")
    seen = {}

    def fake_post(data):
        seen["user"] = auth.current_user.get()
        return {"access_token": "t", "refresh_token": "r", "expires_in": 3600}
    monkeypatch.setattr("app.sources.gcal._post_token", fake_post)
    r = client.get(f"/api/gcal/callback?code=c&state={state}", follow_redirects=False)      # Google's redirect carries no token
    assert r.headers["location"].endswith("gcal=connected") and seen["user"] == "user-a"
    assert client.get("/api/gcal/status", headers=h("tok-a")).json()["connected"] is True
    assert client.get("/api/gcal/status", headers=h("tok-b")).json()["connected"] is False
    forged = client.get("/api/gcal/callback?code=c&state=user-b~guess", follow_redirects=False)
    assert forged.headers["location"].endswith("gcal=failed")


def test_tokens_are_checked_once_a_minute_not_on_every_call(login_on, monkeypatch):
    calls = []

    async def counting(token):
        calls.append(token)
        return USERS.get(token)
    monkeypatch.setattr(auth, "fetch_user", counting)
    for _ in range(5):
        client.get("/api/state", headers=h("tok-a"))
    assert calls == ["tok-a"]
