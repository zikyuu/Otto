from unittest.mock import MagicMock, patch

from app.models import Resource
from app.sources.resources import _classify_url, fetch_resources


def test_resource_dataclass_fields():
    r = Resource(title="Neetcode 150", url="https://neetcode.io", type="article")
    assert r.title == "Neetcode 150"
    assert r.url == "https://neetcode.io"
    assert r.type == "article"


def test_resource_dataclass_leetcode_type():
    r = Resource(title="Two Sum", url="https://leetcode.com/problems/two-sum/", type="leetcode")
    assert r.type == "leetcode"


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
    # Return distinct URLs per query so dedup doesn't collapse them.
    mock_result_q1 = MagicMock()
    mock_result_q1.results = [
        MagicMock(title="Two Sum", url="https://leetcode.com/problems/two-sum/"),
        MagicMock(title="Algo Guide", url="https://neetcode.io/roadmap"),
    ]
    mock_result_q2 = MagicMock()
    mock_result_q2.results = [
        MagicMock(title="Three Sum", url="https://leetcode.com/problems/three-sum/"),
        MagicMock(title="Big-O Cheat Sheet", url="https://bigocheatsheet.com/"),
    ]
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.side_effect = [mock_result_q1, mock_result_q2]
        result = fetch_resources("algorithms", "backend engineer")
    assert len(result) == 4          # 2 results × 2 queries, all unique URLs
    assert result[0].type == "leetcode"
    assert result[1].type == "article"


def test_fetch_resources_caps_at_six(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "fake-key")
    # Return 4 unique results per query (8 total) so dedup still caps at 6.
    mock_result_q1 = MagicMock()
    mock_result_q1.results = [
        MagicMock(title=f"Result {i}", url=f"https://example.com/{i}")
        for i in range(4)
    ]
    mock_result_q2 = MagicMock()
    mock_result_q2.results = [
        MagicMock(title=f"Result {i}", url=f"https://example.com/{i}")
        for i in range(4, 8)
    ]
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.side_effect = [mock_result_q1, mock_result_q2]
        result = fetch_resources("algorithms", "backend engineer")
    assert len(result) == 6


def test_fetch_resources_returns_empty_on_exa_error(monkeypatch):
    monkeypatch.setenv("EXA_API_KEY", "fake-key")
    with patch("app.sources.resources.Exa") as MockExa:
        MockExa.return_value.search_and_contents.side_effect = Exception("API error")
        result = fetch_resources("algorithms", "backend engineer")
    assert result == []
