"""Ten bugs planted on purpose in the abkit engine; the golden gate must block each (M10).

A mutant is a one-line source patch: ``old`` must occur exactly once in ``path`` (relative to
the ``abkit`` package), so a mutant that no longer applies fails loudly instead of testing
nothing. ``write_package`` applies it to a copy; the installed engine is never touched.
Each is a plausible slip, not a syntax error: the gate (``abkit.golden.gate``) runs the
copy through ``abkit golden --strict`` and the mutant counts as blocked only if a golden
case fails.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[1]
#: Where the copy goes under ``dest``: the repo layout, because modules resolve repo files
#: from ``Path(__file__).parents[N]`` at import time (N up to 4). In a shallow temp dir such
#: as ``/tmp/x/abkit`` that index runs past ``/`` and the copy dies with ``IndexError``.
COPY_LAYOUT = Path("analytics/abkit/src/abkit")


class MutantError(ValueError):
    """The patch does not apply exactly once, or the patched file is not valid Python."""


@dataclass(frozen=True)
class Mutant:
    id: str
    path: str
    old: str
    new: str
    bug: str


MUTANTS: tuple[Mutant, ...] = (
    Mutant(
        "welch-student-df",
        "stats/welch.py",
        "df = float((vc + vt) ** 2 / (vc**2 / (c.size - 1) + vt**2 / (t.size - 1)))",
        "df = float(c.size + t.size - 2)",
        "Student's pooled df n1 + n2 - 2 instead of Welch-Satterthwaite",
    ),
    Mutant(
        "welch-sign-flip",
        "stats/welch.py",
        "estimate = float(t.mean() - c.mean())",
        "estimate = float(c.mean() - t.mean())",
        "control minus treatment: every effect has the wrong sign",
    ),
    Mutant(
        "ci-one-sided-quantile",
        "stats/_common.py",
        "half = float(dist.ppf(1 - alpha / 2)) * se",
        "half = float(dist.ppf(1 - alpha)) * se",
        "two-sided interval built with the one-sided quantile (90% CI labelled 95%)",
    ),
    Mutant(
        "p-value-one-tail",
        "stats/_common.py",
        "return float(2 * dist.sf(abs(statistic)))",
        "return float(dist.sf(abs(statistic)))",
        "two-sided p-value not doubled: false positives at twice alpha",
    ),
    Mutant(
        "delta-drop-covariance",
        "stats/delta.py",
        "variance = (var_y - 2 * ratio * cov + ratio**2 * var_x)",
        "variance = (var_y + ratio**2 * var_x)",
        "delta method without the numerator-denominator covariance term",
    ),
    Mutant(
        "cuped-theta-sign",
        "stats/cuped.py",
        "y_c - theta * (x_c - x_mean), y_t - theta * (x_t - x_mean)",
        "y_c + theta * (x_c - x_mean), y_t + theta * (x_t - x_mean)",
        "CUPED adds the covariate instead of subtracting it: variance goes up",
    ),
    Mutant(
        "srm-dof-off-by-one",
        "stats/srm.py",
        "dof = counts.size - 1",
        "dof = counts.size",
        "chi-square SRM test with k instead of k - 1 degrees of freedom",
    ),
    Mutant(
        "bh-no-step-up",
        "stats/bh.py",
        "stepped = np.minimum(np.minimum.accumulate(scaled[::-1])[::-1], 1.0)",
        "stepped = np.minimum(scaled, 1.0)",
        "Benjamini-Hochberg without the running minimum (adjusted p not monotone)",
    ),
    Mutant(
        "power-one-tail-alpha",
        "stats/power.py",
        'tail = alpha / 2 if alternative == "two-sided" else alpha',
        "tail = alpha",
        "two-sided power computed at the one-sided alpha: sample sizes too small",
    ),
    Mutant(
        "readout-decides-early-window",
        "readout/analysis.py",
        "primary = measure_effect(spec.metric, data, everyone, spec.alpha)",
        "primary = measure_effect(spec.early_metric or spec.metric, data, everyone, spec.alpha)",
        "readout decides on the novelty window instead of the lasting metric",
    ),
)


def _mutate(source: str, mutant: Mutant) -> str:
    times = source.count(mutant.old)
    if times != 1:
        raise MutantError(
            f"mutant {mutant.id!r}: {mutant.old!r} occurs {times} times in {mutant.path}, not once"
        )
    patched = source.replace(mutant.old, mutant.new)
    try:
        compile(patched, mutant.path, "exec")
    except SyntaxError as err:
        raise MutantError(f"mutant {mutant.id!r}: {mutant.path} does not compile: {err}") from err
    return patched


def write_package(
    dest: Path, mutant: Mutant | None = None, package_dir: Path = PACKAGE_DIR
) -> Path:
    """Copy ``package_dir`` to ``dest/abkit`` (patched with ``mutant``) and return that path."""
    target = Path(dest) / COPY_LAYOUT
    shutil.copytree(package_dir, target, ignore=shutil.ignore_patterns("__pycache__"))
    if mutant is not None:
        path = target / mutant.path
        # Bytes in and out, so the file keeps its line endings.
        source = path.read_bytes().decode("utf-8")
        path.write_bytes(_mutate(source, mutant).encode("utf-8"))
    return target
