from app.models import Resource


def test_resource_dataclass_fields():
    r = Resource(title="Neetcode 150", url="https://neetcode.io", type="article")
    assert r.title == "Neetcode 150"
    assert r.url == "https://neetcode.io"
    assert r.type == "article"


def test_resource_dataclass_leetcode_type():
    r = Resource(title="Two Sum", url="https://leetcode.com/problems/two-sum/", type="leetcode")
    assert r.type == "leetcode"
