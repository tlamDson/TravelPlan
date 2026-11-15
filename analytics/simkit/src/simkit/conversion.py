"""Exact P(one session of a persona reaches ``target``), from its Markov chain.

h(s) = P(target before END | s) solves h(s) = P(s -> target) + sum_s' P(s -> s') h(s') over the
non-absorbing states, so ``save_probability`` is one linear solve. ``lift`` applies
``simkit.experiment.apply_lift`` to every row first: the session of an exposed user.

This is the chain alone: the generator's 30-event cap and its "no trip yet -> wizard" redirect
are not part of it (both only matter for a user's very first session or very long ones).
"""

from __future__ import annotations

import numpy as np

from simkit.experiment import apply_lift
from simkit.personas import ACTIONS, END, START, Persona


def save_probability(persona: Persona, target: str = "trip_saved", lift: float = 0.0) -> float:
    if target not in ACTIONS:
        raise ValueError(f"target must be one of {ACTIONS}, got {target!r}")
    if not lift > -1:
        raise ValueError(f"lift must be > -1, got {lift!r}")
    transient = [s for s in (START, *ACTIONS) if s != target]
    index = {s: i for i, s in enumerate(transient)}
    a = np.eye(len(transient))
    b = np.zeros(len(transient))
    for state in transient:
        for dest, p in apply_lift(persona.row(state), target, lift):
            if dest == target:
                b[index[state]] += p
            elif dest != END:
                a[index[state], index[dest]] -= p
    return float(np.linalg.solve(a, b)[index[START]])
