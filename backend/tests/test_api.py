from dataclasses import asdict
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.models import Resource

client = TestClient(app)


def test_resources_endpoint_returns_list():
    mock_resources = [
        Resource(title="Two Sum", url="https://leetcode.com/problems/two-sum/", type="leetcode"),
        Resource(title="Algo Guide", url="https://neetcode.io", type="article"),
    ]
    with patch("app.main.fetch_resources", return_value=mock_resources):
        resp = client.get("/api/resources?skill=algorithms&role=backend+engineer")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["type"] == "leetcode"
    assert data[0]["url"] == "https://leetcode.com/problems/two-sum/"


def test_resources_endpoint_returns_empty_list():
    with patch("app.main.fetch_resources", return_value=[]):
        resp = client.get("/api/resources?skill=algorithms&role=backend+engineer")
    assert resp.status_code == 200
    assert resp.json() == []


def test_resources_endpoint_missing_role_returns_422():
    resp = client.get("/api/resources?skill=algorithms")
    assert resp.status_code == 422


def test_resources_endpoint_missing_skill_returns_422():
    resp = client.get("/api/resources?role=backend+engineer")
    assert resp.status_code == 422
