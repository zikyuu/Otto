from app.models import Resource


def test_resource_dataclass_fields():
    r = Resource(title="Neetcode 150", url="https://neetcode.io", type="article")
    assert r.title == "Neetcode 150"
    assert r.url == "https://neetcode.io"
    assert r.type == "article"


def test_resource_dataclass_leetcode_type():
    r = Resource(title="Two Sum", url="https://leetcode.com/problems/two-sum/", type="leetcode")
    assert r.type == "leetcode"


from unittest.mock import MagicMock, patch

from app.sources.resources import _classify_url, fetch_resources


def test_classify_url_leetcode():
    assert _classify_url("https://leetcode.com/problems/two-sum/") == "leetcode"


def test_classify_url_youtube():
    assert _classify_url("https://www.youtube.com/watch?v=abc123") == "video"


def test_classify_url_youtu_be():
    assert _classify_url("https://youtu.be/abc123") == "video"


def test_classify_url_article():
    assert _classify_url("https://neetcode.io/roadmap") == "article"


def test_classify_url_other():
    assert _classify_url("https://unknown-site.com/page") == "article"


def test_fetch_resources_returns_empty_without_key(monkeypatch):
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    result = fetch_resources("algorithms", "backend engineer")
    assert result == []


def test_fetch_resources_returns_resources(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "fake-key")
    mock_result = MagicMock()
    mock_result.results = [
        MagicMock(title="Two Sum", url="https://leetcode.com/problems/two-sum/"),
        MagicMock(title="Algo Guide", url="https://neetcode.io/roadmap"),
    ]
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.return_value = mock_result
        result = fetch_resources("algorithms", "backend engineer")
    assert len(result) == 4          # 2 results × 2 queries
    assert result[0].type == "leetcode"
    assert result[1].type == "article"


def test_fetch_resources_caps_at_six(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "fake-key")
    mock_result = MagicMock()
    mock_result.results = [
        MagicMock(title=f"Result {i}", url=f"https://example.com/{i}")
        for i in range(5)
    ]
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.return_value = mock_result
        result = fetch_resources("algorithms", "backend engineer")
    assert len(result) <= 6


def test_fetch_resources_returns_empty_on_exa_error(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "fake-key")
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.side_effect = Exception("API error")
        result = fetch_resources("algorithms", "backend engineer")
    assert result == []
