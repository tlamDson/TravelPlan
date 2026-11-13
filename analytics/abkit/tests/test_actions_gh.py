from pathlib import Path

import pytest
from gh_fixtures import Completed, FakeGh

from abkit.actions.gh import GhClient, GhError, Projection, RateLimited, gh_args


def _client(tmp_path: Path, fake: FakeGh, **kw) -> GhClient:
    kw.setdefault("sleep", lambda s: None)
    return GhClient(tmp_path / "cache", runner=fake, **kw)


def test_gh_args_are_get_only_with_params_and_no_jq() -> None:
    args = gh_args("repos/a/b/pulls", {"state": "closed", "page": "2"})
    assert args == [
        "gh", "api", "-X", "GET", "repos/a/b/pulls", "-f", "page=2", "-f", "state=closed",
    ]  # fmt: skip


@pytest.mark.parametrize("endpoint", ["-X", "graphql", "repos/a b", "repos/a?x=1", "", "/repos/a"])
def test_endpoints_that_are_not_plain_rest_paths_are_refused(endpoint: str) -> None:
    with pytest.raises(ValueError):
        gh_args(endpoint, {})


def test_a_second_identical_get_is_served_from_the_cache(tmp_path: Path) -> None:
    fake = FakeGh({"repos/a/b": lambda p: {"id": 1}})
    client = _client(tmp_path, fake)
    assert client.get("repos/a/b") == {"id": 1}
    again = _client(tmp_path, fake)  # a new process reading the same cache
    assert again.get("repos/a/b") == {"id": 1}
    assert len(fake.calls) == 1
    assert (client.calls, again.calls, again.hits) == (1, 0, 1)


def test_the_cache_key_includes_params_and_the_projection_id(tmp_path: Path) -> None:
    fake = FakeGh({"r": lambda p: p})
    client = _client(tmp_path, fake)
    assert client.get("r", {"page": "1"}) == {"page": "1"}
    assert client.get("r", {"page": "2"}) == {"page": "2"}
    page = Projection("page/v1", lambda raw: raw["page"])
    assert client.get("r", {"page": "1"}, project=page) == "1"
    assert len(fake.calls) == 3


def test_only_the_projected_value_is_cached(tmp_path: Path) -> None:
    fake = FakeGh({"r": lambda p: {"keep": 1, "noise": "x" * 1000}})
    keep = Projection("keep/v1", lambda raw: raw["keep"])
    assert _client(tmp_path, fake).get("r", project=keep) == 1
    (path,) = (tmp_path / "cache").rglob("*.json")
    assert "noise" not in path.read_text(encoding="utf-8")
    assert _client(tmp_path, fake).get("r", project=keep) == 1
    assert len(fake.calls) == 1


def test_a_404_raises_with_its_status_and_is_cached(tmp_path: Path) -> None:
    fake = FakeGh({})
    client = _client(tmp_path, fake)
    for _ in range(2):
        with pytest.raises(GhError) as err:
            client.get("repos/gone/repo")
        assert err.value.status == 404
    assert len(fake.calls) == 1


def test_a_rate_limit_waits_for_the_reset_of_its_resource_then_retries(tmp_path: Path) -> None:
    answers = [Completed(1, "", "gh: API rate limit exceeded for user (HTTP 403)")]
    fake = FakeGh(
        {
            "search/repositories": lambda p: answers.pop() if answers else {"items": []},
            "rate_limit": lambda p: {
                "resources": {"core": {"reset": 5000}, "search": {"reset": 1100}}
            },
        }
    )
    slept: list[float] = []
    client = _client(tmp_path, fake, sleep=slept.append, clock=lambda: 1000.0)
    assert client.get("search/repositories", {"q": "x"}) == {"items": []}
    assert slept == [101.0]
    assert fake.endpoints() == ["search/repositories", "rate_limit", "search/repositories"]


def test_a_rate_limit_that_never_clears_raises_rate_limited(tmp_path: Path) -> None:
    fake = FakeGh(
        {
            "repos/a/b": lambda p: Completed(1, "", "secondary rate limit (HTTP 403)"),
            "rate_limit": lambda p: {"resources": {"core": {"reset": 0}, "search": {"reset": 0}}},
        }
    )
    client = _client(tmp_path, fake, max_retries=2)
    with pytest.raises(RateLimited):
        client.get("repos/a/b")
    assert fake.endpoints().count("repos/a/b") == 3


def test_a_server_error_is_retried_with_backoff_and_not_cached(tmp_path: Path) -> None:
    answers = [Completed(1, "", "HTTP 502: Bad Gateway")]
    fake = FakeGh({"repos/a/b": lambda p: answers.pop() if answers else [1]})
    slept: list[float] = []
    client = _client(tmp_path, fake, sleep=slept.append)
    assert client.get("repos/a/b") == [1]
    assert slept == [2.0]


def test_a_persistent_server_error_raises_after_the_retries(tmp_path: Path) -> None:
    fake = FakeGh({"repos/a/b": lambda p: Completed(1, "", "HTTP 500")})
    client = _client(tmp_path, fake, max_retries=1)
    with pytest.raises(GhError) as err:
        client.get("repos/a/b")
    assert err.value.status == 500
    assert not isinstance(err.value, RateLimited)
    assert len(fake.calls) == 2
