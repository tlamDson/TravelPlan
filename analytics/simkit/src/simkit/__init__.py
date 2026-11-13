"""SIMULATED TravelPlan events: personas, experiment and fault hooks, G-event replay.

Ported from RepoPulse ``simkit/`` (MIT). See ``analytics/simkit/README.md``.
"""

from simkit.catalog import (
    QUARANTINE_REASONS,
    Catalog,
    IngestReplay,
    load_catalog,
    replay_ingest,
)
from simkit.experiment import Experiment, apply_lift, parse_experiment
from simkit.export import read_jsonl, to_jsonl, write_jsonl, write_parquet
from simkit.faults import FAULT_TYPES, FaultRecord, FaultResult, inject_faults
from simkit.generator import Simulation, SimUser, simulate
from simkit.personas import ACTIONS, PERSONAS, Persona

__all__ = [
    "ACTIONS",
    "FAULT_TYPES",
    "PERSONAS",
    "QUARANTINE_REASONS",
    "Catalog",
    "Experiment",
    "FaultRecord",
    "FaultResult",
    "IngestReplay",
    "Persona",
    "SimUser",
    "Simulation",
    "apply_lift",
    "inject_faults",
    "load_catalog",
    "parse_experiment",
    "read_jsonl",
    "replay_ingest",
    "simulate",
    "to_jsonl",
    "write_jsonl",
    "write_parquet",
]
