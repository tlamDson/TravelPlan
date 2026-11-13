"""Do the counts agree end to end: sent, ingest answers, what Mongo stored, what was exported?"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass

from simkit.driver.client import Tally


@dataclass(frozen=True)
class Reconciliation:
    checks: dict[str, tuple[int, int]]  # name -> (expected, actual)

    @property
    def ok(self) -> bool:
        return not self.failures()

    def failures(self) -> list[tuple[str, int, int]]:
        return [(name, e, a) for name, (e, a) in self.checks.items() if e != a]


def reconcile(
    *,
    sent: int,
    expected: Mapping[str, int],
    tally: Tally,
    stored_events: int,
    stored_quarantine: int,
    accepted_ids: Collection[str],
    exported_ids: Collection[str],
    vus: int,
    scripts: int,
) -> Reconciliation:
    """``expected``: the fault manifest's ingest counts (``FaultResult.expected_ingest``).

    ``vus`` Locust users were asked for; every one must have spawned, and as many as there is
    work for (``scripts``) must have been sending at the same moment. Without that a "1k VU"
    run could finish its work with a few hundred users and still pass.
    """
    return Reconciliation(
        {
            "received = sent": (sent, tally.received),
            "accepted = expected": (expected["accepted"], tally.accepted),
            "duplicates = expected": (expected["duplicates"], tally.duplicates),
            "quarantined = expected": (expected["quarantined"], tally.quarantined),
            "accepted = sent - duplicates - quarantined": (
                sent - tally.duplicates - tally.quarantined,
                tally.accepted,
            ),
            "stored events = accepted": (tally.accepted, stored_events),
            "stored quarantine = quarantined": (tally.quarantined, stored_quarantine),
            "exported rows = accepted": (tally.accepted, len(exported_ids)),
            "exported ids = accepted ids": (0, len(set(accepted_ids) ^ set(exported_ids))),
            "failed batches = 0": (0, tally.failed_batches),
            "spawned locust users = vus": (vus, tally.spawned_users),
            "peak concurrent virtual users = min(vus, scripts)": (
                min(vus, scripts),
                tally.peak_active,
            ),
        }
    )
