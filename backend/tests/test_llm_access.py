"""Who pays for AI: with login on, one free goal review per account on the host's key, everything else needs the person's own key."""
import pytest
from fastapi.testclient import TestClient

from app import auth, kv, llm_access, main

client = TestClient(main.app)
USERS = {"tok-a": ("user-a", "a@example.com"), "tok-b": ("user-b", "b@example.com")}
GOAL = {"id": "g", "title": "RAG", "milestones": []}


class FakeOpenAI:
    """Stands in for the OpenAI client: records which key was used and answers with an empty review."""
    used: list[str] = []

    def __init__(self, api_key=None, **kw):
        FakeOpenAI.used.append(api_key)
        self.chat = type("C", (), {"completions": type("X", (), {"create": staticmethod(lambda **k: type("R", (), {"choices": [type("Ch", (), {"message": type("M", (), {"content": '{"goals": [], "new_goals": []}'})()})()]})())})()})()


@pytest.fixture
def gated(monkeypatch):
    monkeypatch.setenv("OTTO_REQUIRE_LOGIN", "1")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-HOSTKEYHOSTKEYHOSTKEY")
    auth._CACHE.clear()
    llm_access._RECENT.clear()
    FakeOpenAI.used = []

    async def fake(token):
        return USERS.get(token)
    monkeypatch.setattr(auth, "fetch_user", fake)
    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    monkeypatch.setattr(llm_access, "check_key", lambda k: None)
    yield


def h(t):
    return {"Authorization": f"Bearer {t}"}


def review(tok):
    body = {"goals": [{"id": "g", "title": "RAG", "milestones": [{"title": "m", "effort_h": 2}]}], "today": "2026-10-13"}
    return client.post("/api/ai/review-goals", json=body, headers=h(tok))


OWN = "sk-ownkeyownkeyownkey1234"


def test_a_new_account_gets_exactly_one_free_goal_review_on_the_host_key(gated):
    assert client.get("/api/llm/status", headers=h("tok-a")).json()["free_left"] == 1
    assert review("tok-a").status_code == 200
    assert FakeOpenAI.used == ["sk-HOSTKEYHOSTKEYHOSTKEY"]
    second = review("tok-a")
    assert second.status_code == 402 and "free goal review has been used" in second.json()["detail"]
    assert len(FakeOpenAI.used) == 1                                   # the second one never reached OpenAI
    assert review("tok-b").status_code == 200                          # somebody else still has theirs


def test_a_failed_call_does_not_spend_the_free_review(gated, monkeypatch):
    class Down(FakeOpenAI):
        def __init__(self, **kw):
            super().__init__(**kw)
            self.chat.completions.create = lambda **k: (_ for _ in ()).throw(RuntimeError("openai down"))
    monkeypatch.setattr("openai.OpenAI", Down)
    quiet = TestClient(main.app, raise_server_exceptions=False)
    body = {"goals": [{"id": "g", "title": "RAG", "milestones": [{"title": "m", "effort_h": 2}]}], "today": "2026-10-13"}
    assert quiet.post("/api/ai/review-goals", json=body, headers=h("tok-a")).status_code == 500
    assert client.get("/api/llm/status", headers=h("tok-a")).json()["free_left"] == 1


def test_other_ai_features_need_the_persons_own_key_and_fall_back_without_one(gated):
    assert client.get("/api/ai/status", headers=h("tok-a")).json()["llm"] is False         # the free review is wizard-only
    r = client.post("/api/chat/rules", json={"text": "gym first"}, headers=h("tok-a")).json()
    assert r["via"] == "keywords" and r["rules"][0]["key"] == "gym_first"
    assert FakeOpenAI.used == []


def test_saving_your_own_key_switches_everything_to_it_and_it_is_never_sent_back(gated):
    r = client.put("/api/llm/key", json={"key": OWN}, headers=h("tok-a"))
    assert r.status_code == 200 and r.json()["mode"] == "own" and r.json()["own_hint"] == "1234"
    assert OWN not in r.text and OWN not in client.get("/api/llm/status", headers=h("tok-a")).text
    stored = [v for k, v in __import__("json").loads(open(__import__("os").environ["OTTO_KV_PATH"]).read()).items() if k.endswith("llm.key")]
    assert stored and OWN not in str(stored)                           # encrypted at rest
    assert client.get("/api/ai/status", headers=h("tok-a")).json()["llm"] is True
    assert review("tok-a").status_code == 200 and review("tok-a").status_code == 200   # no limit on their own key
    assert FakeOpenAI.used == [OWN, OWN]
    assert client.get("/api/ai/status", headers=h("tok-b")).json()["llm"] is False      # and it is theirs alone
    assert client.get("/api/state", headers=h("tok-a")).json()["state"] == {}           # the key is not reachable through the page's state api


def test_removing_the_key_goes_back_to_the_allowance(gated):
    client.put("/api/llm/key", json={"key": OWN}, headers=h("tok-a"))
    assert client.delete("/api/llm/key", headers=h("tok-a")).json()["mode"] == "free"


def test_a_malformed_key_is_refused_before_anything_is_called(gated, monkeypatch):
    seen = []
    monkeypatch.setattr(llm_access, "check_key", lambda k: seen.append(k))
    assert client.put("/api/llm/key", json={"key": "not-an-openai-key-at-all"}, headers=h("tok-a")).status_code == 422
    assert seen == []


def test_the_host_key_has_a_daily_cap_across_everyone(gated, monkeypatch):
    monkeypatch.setenv("OTTO_HOST_DAILY_CAP", "1")
    assert review("tok-a").status_code == 200
    capped = review("tok-b")
    assert capped.status_code == 402 and "allowance for today" in capped.json()["detail"]


def test_too_many_calls_in_a_minute_are_slowed(gated, monkeypatch):
    client.put("/api/llm/key", json={"key": OWN}, headers=h("tok-a"))
    codes = [review("tok-a").status_code for _ in range(llm_access.PER_MINUTE + 2)]
    assert codes[:llm_access.PER_MINUTE] == [200] * llm_access.PER_MINUTE and codes[-1] == 429


def test_without_login_the_server_key_works_as_before_with_no_limits(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-HOSTKEYHOSTKEYHOSTKEY")
    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    FakeOpenAI.used = []
    for _ in range(3):
        body = {"goals": [{"id": "g", "title": "RAG", "milestones": [{"title": "m", "effort_h": 2}]}], "today": "2026-10-13"}
        assert client.post("/api/ai/review-goals", json=body).status_code == 200
    assert len(FakeOpenAI.used) == 3
