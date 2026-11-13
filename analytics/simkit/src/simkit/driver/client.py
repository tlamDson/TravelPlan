"""Post one virtual user's batches to the ingest, retrying like the web client, and tally."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field

from simkit.driver.plan import UserScript

COUNT_KEYS = ("received", "accepted", "duplicates", "quarantined")
#: Answers worth sending the same batch again for: the ingest is idempotent on eventId.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
DEFAULT_MAX_ATTEMPTS = 3

#: Levels, not counts: merging two tallies keeps the larger one.
_PEAKS = frozenset({"spawned_users", "peak_active"})

#: ``post(batch) -> (status, body)``; may raise on a connection error.
Post = Callable[[Sequence[object]], tuple[int, object]]


@dataclass
class Tally:
    received: int = 0
    accepted: int = 0
    duplicates: int = 0
    quarantined: int = 0
    scripts: int = 0  # scripts sent to the end
    batches: int = 0
    failed_batches: int = 0
    retries: int = 0
    unsent: int = 0  # events of batches that failed every attempt
    spawned_users: int = 0  # Locust users running when spawning completed
    peak_active: int = 0  # most Locust users sending a script at the same moment
    latencies_ms: list[float] = field(default_factory=list)

    @property
    def sent(self) -> int:
        """Events handed to the server: answered ones plus those of failed batches."""
        return self.received + self.unsent

    def counts(self) -> dict[str, int]:
        return {k: getattr(self, k) for k in COUNT_KEYS}

    def merge(self, other: Tally) -> Tally:
        for name, value in asdict(other).items():
            mine = getattr(self, name)
            setattr(self, name, max(mine, value) if name in _PEAKS else mine + value)
        return self

    def latency_ms(self, q: float) -> float | None:
        """Linear-interpolated ``q`` quantile of the batch latencies, None without any."""
        if not self.latencies_ms:
            return None
        ordered = sorted(self.latencies_ms)
        pos = q * (len(ordered) - 1)
        lo, hi = math.floor(pos), math.ceil(pos)
        return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: Mapping) -> Tally:
        return cls(**{**raw, "latencies_ms": list(raw.get("latencies_ms", []))})


def _counts(body: object, n: int) -> dict[str, int] | None:
    """The ingest result if ``body`` is one for a batch of ``n`` events, else None."""
    if not isinstance(body, Mapping) or set(body) != set(COUNT_KEYS):
        return None
    if not all(isinstance(body[k], int) and body[k] >= 0 for k in COUNT_KEYS):
        return None
    if body["received"] != n or body["received"] != sum(body[k] for k in COUNT_KEYS[1:]):
        return None
    return {k: body[k] for k in COUNT_KEYS}


def send_script(
    post: Post, script: UserScript, tally: Tally, max_attempts: int = DEFAULT_MAX_ATTEMPTS
) -> None:
    """Post every batch of ``script`` in order; a batch is retried on 429/5xx/connection error."""
    if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or max_attempts < 1:
        raise ValueError(f"max_attempts must be a positive integer, got {max_attempts!r}")
    for batch in script.batches:
        tally.batches += 1
        counts = None
        for attempt in range(max_attempts):
            if attempt:
                tally.retries += 1
            started = time.perf_counter()
            try:
                status, body = post(batch)
            except (ConnectionError, OSError, TimeoutError):
                continue
            tally.latencies_ms.append((time.perf_counter() - started) * 1000)
            if status == 200:
                counts = _counts(body, len(batch))
                break
            if status not in RETRY_STATUSES:
                break
        if counts is None:
            tally.failed_batches += 1
            tally.unsent += len(batch)
            continue
        for key, value in counts.items():
            setattr(tally, key, getattr(tally, key) + value)
    tally.scripts += 1  # finished: the last Locust user to finish one stops the run
