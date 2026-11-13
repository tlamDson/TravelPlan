"""The 10 bugs planted on purpose in the abkit engine (B2 plan, PR 15a, M10)."""

import re
from pathlib import Path

import pytest

from abkit.golden.mutants import MUTANTS, PACKAGE_DIR, Mutant, MutantError, write_package


def _tree(root: Path) -> dict[str, bytes]:
    return {
        p.relative_to(root).as_posix(): p.read_bytes()
        for p in sorted(root.rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts
    }


def test_there_are_ten_mutants_with_unique_kebab_case_ids() -> None:
    ids = [m.id for m in MUTANTS]
    assert len(ids) == 10
    assert len(set(ids)) == 10
    assert all(re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", i) for i in ids)
    assert all(m.bug.strip() for m in MUTANTS)


def test_mutants_hit_the_g_ref_and_the_g_sim_engines() -> None:
    files = {m.path for m in MUTANTS}
    for engine in (
        "stats/welch.py",
        "stats/_common.py",
        "stats/delta.py",
        "stats/cuped.py",
        "stats/srm.py",
        "stats/bh.py",
        "stats/power.py",
        "readout/analysis.py",
    ):
        assert engine in files


def test_package_dir_is_the_imported_abkit_package() -> None:
    import abkit

    assert Path(abkit.__file__).resolve().parent == PACKAGE_DIR


@pytest.mark.parametrize("mutant", MUTANTS, ids=lambda m: m.id)
def test_each_mutant_still_applies_exactly_once_and_compiles(mutant: Mutant) -> None:
    source = (PACKAGE_DIR / mutant.path).read_text(encoding="utf-8")
    assert source.count(mutant.old) == 1, "the engine changed; update the mutant"
    assert mutant.new != mutant.old
    compile(source.replace(mutant.old, mutant.new), mutant.path, "exec")


def test_clean_copy_is_byte_identical_to_the_package(tmp_path: Path) -> None:
    copy = write_package(tmp_path)
    assert copy == tmp_path / "abkit"
    assert _tree(copy) == _tree(PACKAGE_DIR)


def test_mutated_copy_differs_only_in_the_target_file(tmp_path: Path) -> None:
    mutant = MUTANTS[0]
    copy = write_package(tmp_path, mutant)
    original, mutated = _tree(PACKAGE_DIR), _tree(copy)
    assert original.keys() == mutated.keys()
    changed = [k for k in original if original[k] != mutated[k]]
    assert changed == [mutant.path]
    text = (copy / mutant.path).read_text(encoding="utf-8")
    assert mutant.new in text and mutant.old not in text
    # The installed engine is never touched.
    assert mutant.old in (PACKAGE_DIR / mutant.path).read_text(encoding="utf-8")


@pytest.mark.parametrize(("source", "times"), [("a = 1\na = 1\n", 2), ("b = 2\n", 0)])
def test_a_stale_or_ambiguous_patch_is_refused(tmp_path: Path, source: str, times: int) -> None:
    package = tmp_path / "pkg"
    package.mkdir()
    (package / "x.py").write_text(source, encoding="utf-8")
    mutant = Mutant("stale", "x.py", "a = 1", "a = 2", "a stale patch")
    with pytest.raises(MutantError, match=f"{times} times"):
        write_package(tmp_path / "out", mutant, package_dir=package)


def test_a_patch_that_does_not_compile_is_refused(tmp_path: Path) -> None:
    package = tmp_path / "pkg"
    package.mkdir()
    (package / "x.py").write_text("a = 1\n", encoding="utf-8")
    mutant = Mutant("syntax", "x.py", "a = 1", "a = (", "not Python")
    with pytest.raises(MutantError, match="does not compile"):
        write_package(tmp_path / "out", mutant, package_dir=package)
