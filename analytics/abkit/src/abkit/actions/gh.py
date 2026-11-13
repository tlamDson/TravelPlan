"""A read-only, cached client over the ``gh api`` CLI (B2 plan, PR 18).

Every request is ``gh api -X GET``: the plan allows ``gh api`` only to read public
repository data, so this module cannot send another method. Answers (after the
``--jq`` projection, so the cache stays small) are cached on disk by endpoint, params
and projection; a rerun of a build reads the cache and calls GitHub only for what is
missing. A 404 / 409 / 410 / 451 answer is cached too, as the error it raised.
A rate limit waits until the reset of its resource (``search`` or ``core``), then retries.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

_ENDPOINT = re.compile(r"^[A-Za-z0-9_.][A-Za-z0-9_./-]*$")
_STATUS = re.compile(r"HTTP (\d{3})")
#: Answers that will not change on a retry, so they are cached as errors.
_FINAL_STATUSES = frozenset({404, 409, 410, 451})
#: Never sleep longer than one rate-limit window (an hour) plus a margin.
_MAX_WAIT = 3700.0


class GhError(RuntimeError):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class RateLimited(GhError):
    pass


def run_gh(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", check=False)


def gh_args(endpoint: str, params: Mapping[str, str], jq: str) -> list[str]:
    """The ``gh api`` argv of one GET; refuses anything that is not a plain REST path."""
    if not _ENDPOINT.match(endpoint) or endpoint.startswith("graphql") or ".." in endpoint:
        raise ValueError(f"not a REST GET path: {endpoint!r}")
    args = ["gh", "api", "-X", "GET", endpoint]
    for key in sorted(params):
        args += ["-f", f"{key}={params[key]}"]
    return [*args, "--jq", jq]


def _status(stderr: str) -> int | None:
    found = _STATUS.findall(stderr)
    return int(found[-1]) if found else None


def _is_rate_limit(stderr: str, status: int | None) -> bool:
    return status == 429 or "rate limit" in stderr.lower()


class GhClient:
    def __init__(
        self,
        cache_dir: Path,
        runner: Callable[[list[str]], Any] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.time,
        max_retries: int = 5,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self._runner = runner
        self._sleep = sleep
        self._clock = clock
        self.max_retries = max_retries
        self.calls = 0
        self.hits = 0

    def _run(self, args: list[str]):
        runner = self._runner if self._runner is not None else run_gh
        self.calls += 1
        return runner(args)

    def _path(self, endpoint: str, params: Mapping[str, str], jq: str) -> Path:
        key = json.dumps([endpoint, sorted(params.items()), jq], separators=(",", ":"))
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.cache_dir / digest[:2] / f"{digest}.json"

    def get(self, endpoint: str, params: Mapping[str, str] | None = None, jq: str = ".") -> Any:
        params = {k: str(v) for k, v in (params or {}).items()}
        args = gh_args(endpoint, params, jq)
        path = self._path(endpoint, params, jq)
        if path.exists():
            self.hits += 1
            return _from_entry(json.loads(path.read_text(encoding="utf-8")), endpoint)
        entry = self._fetch(args, endpoint)
        _write_atomic(path, {"request": [endpoint, params, jq], **entry})
        return _from_entry(entry, endpoint)

    def _fetch(self, args: list[str], endpoint: str) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            done = self._run(args)
            if done.returncode == 0:
                return {"response": json.loads(done.stdout)}
            status = _status(done.stderr)
            if status in _FINAL_STATUSES:
                return {"error": status, "stderr": done.stderr.strip()[:500]}
            last = attempt == self.max_retries
            if _is_rate_limit(done.stderr, status):
                if last:
                    raise RateLimited(f"{endpoint}: {done.stderr.strip()}", status)
                self._sleep(self._rate_limit_wait(endpoint))
            elif last:
                raise GhError(f"{endpoint}: {done.stderr.strip()}", status)
            else:
                self._sleep(2.0**attempt * 2.0)
        raise AssertionError("unreachable")

    def _rate_limit_wait(self, endpoint: str) -> float:
        done = self._run(["gh", "api", "-X", "GET", "rate_limit", "--jq", ".resources"])
        if done.returncode != 0:
            return 60.0
        resource = "search" if endpoint.startswith("search/") else "core"
        reset = float(json.loads(done.stdout)[resource]["reset"])
        return min(max(reset - self._clock() + 1.0, 1.0), _MAX_WAIT)


def _from_entry(entry: Mapping[str, Any], endpoint: str) -> Any:
    if "error" in entry:
        raise GhError(f"{endpoint}: HTTP {entry['error']}", int(entry["error"]))
    return entry["response"]


def _write_atomic(path: Path, entry: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(entry, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)
