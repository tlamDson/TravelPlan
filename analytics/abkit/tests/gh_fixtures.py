"""A fake ``gh`` CLI for the actions panel tests: no network, records every call."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Completed:
    returncode: int
    stdout: str = ""
    stderr: str = ""


def _parse(args: list[str]) -> tuple[str, dict[str, str], str | None]:
    """(endpoint, params, jq) of a ``gh api -X GET <endpoint> -f k=v ... --jq <expr>`` call."""
    assert args[:2] == ["gh", "api"], args
    rest = args[2:]
    endpoint, params, jq = None, {}, None
    i = 0
    while i < len(rest):
        token = rest[i]
        if token == "-X":
            assert rest[i + 1] == "GET", args
            i += 2
        elif token == "-f":
            key, value = rest[i + 1].split("=", 1)
            params[key] = value
            i += 2
        elif token == "--jq":
            jq = rest[i + 1]
            i += 2
        else:
            assert endpoint is None, args
            endpoint = token
            i += 1
    assert endpoint is not None, args
    return endpoint, params, jq


@dataclass
class FakeGh:
    """Answers ``gh api`` calls from ``routes``: endpoint -> handler(params) -> value.

    A handler returns a JSON value (exit 0) or a ``Completed`` (to fail).
    """

    routes: dict[str, Any] = field(default_factory=dict)
    calls: list[list[str]] = field(default_factory=list)

    def __call__(self, args: list[str]) -> Completed:
        self.calls.append(list(args))
        endpoint, params, _ = _parse(args)
        if endpoint not in self.routes:
            return Completed(1, "", f"gh: Not Found (HTTP 404)\n{endpoint}")
        result = self.routes[endpoint](params)
        if isinstance(result, Completed):
            return result
        return Completed(0, json.dumps(result) + "\n", "")

    def endpoints(self) -> list[str]:
        return [_parse(call)[0] for call in self.calls]


def pages(items: list[Any], per_page: int = 100):
    """A handler serving ``items`` in pages by the ``page`` / ``per_page`` params."""

    def handler(params: dict[str, str]) -> list[Any]:
        size = int(params.get("per_page", per_page))
        page = int(params.get("page", "1"))
        return items[(page - 1) * size : page * size]

    return handler


def pr(created: str, merged: str | None, bot: bool = False) -> dict[str, Any]:
    return {"created_at": created, "merged_at": merged, "bot": bot}
