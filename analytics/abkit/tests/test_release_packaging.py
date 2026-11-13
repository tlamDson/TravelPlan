"""Distribution name, docs site and tag-triggered PyPI release (B2 plan, PR 22, G-B2-2)."""

import importlib
import re
import shutil
import subprocess
import sys
import tomllib
import zipfile
from pathlib import Path

import pytest

import abkit

ABKIT_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ABKIT_DIR.parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/release-abkit.yml"
PYPROJECT = tomllib.loads((ABKIT_DIR / "pyproject.toml").read_text(encoding="utf-8"))


def _workflow() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


def test_distribution_is_abkit_experiments_but_the_import_name_stays_abkit():
    project = PYPROJECT["project"]
    assert project["name"] == "abkit-experiments"
    assert importlib.import_module("abkit") is abkit
    assert PYPROJECT["tool"]["setuptools"]["packages"]["find"]["where"] == ["src"]
    assert project["scripts"]["abkit"] == "abkit.cli:main"


def test_package_version_matches_pyproject():
    assert abkit.__version__ == PYPROJECT["project"]["version"]


def test_metadata_is_complete_enough_for_pypi():
    project = PYPROJECT["project"]
    assert project["readme"] == "README.md"
    assert project["license"]
    assert project["urls"]["Documentation"].startswith("https://")
    assert project["urls"]["Source"].startswith("https://github.com/")
    assert project["classifiers"]
    for extra in ("docs", "release"):
        deps = project["optional-dependencies"][extra]
        assert deps and all("==" in dep for dep in deps), extra


def test_mkdocs_nav_files_exist():
    config = (ABKIT_DIR / "mkdocs.yml").read_text(encoding="utf-8")
    pages = re.findall(r":\s*([\w./-]+\.md)\s*$", config, flags=re.M)
    assert len(pages) >= 4
    for page in pages:
        assert (ABKIT_DIR / "docs" / page).is_file(), page
    assert "strict: true" in config


def test_mkdocs_site_builds_strict(tmp_path):
    pytest.importorskip("mkdocs")
    result = subprocess.run(
        [sys.executable, "-m", "mkdocs", "build", "--strict", "-d", str(tmp_path / "site")],
        cwd=ABKIT_DIR,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / "site/index.html").is_file()


def test_simkit_depends_on_the_distribution_name_not_the_import_name():
    simkit = tomllib.loads((ABKIT_DIR.parent / "simkit/pyproject.toml").read_text("utf-8"))
    version = PYPROJECT["project"]["version"]
    assert f"abkit-experiments=={version}" in simkit["project"]["dependencies"]


def test_wheel_has_the_abkit_package_and_distribution_metadata(tmp_path):
    setuptools = pytest.importorskip("setuptools")
    pinned = PYPROJECT["build-system"]["requires"][0].split("==")[1]
    if setuptools.__version__ != pinned:
        pytest.skip(f"wheel build is checked with the pinned setuptools {pinned}")
    src = tmp_path / "src"
    shutil.copytree(
        ABKIT_DIR,
        src,
        ignore=shutil.ignore_patterns("build", "dist", "*.egg-info", "__pycache__", ".*"),
    )
    out = tmp_path / "out"
    out.mkdir()
    build = f"from setuptools import build_meta; build_meta.build_wheel(r'{out}')"
    result = subprocess.run(
        [sys.executable, "-c", build], cwd=src, capture_output=True, text=True, timeout=300
    )
    assert result.returncode == 0, result.stdout + result.stderr
    (wheel,) = out.glob("*.whl")
    version = PYPROJECT["project"]["version"]
    assert wheel.name.startswith(f"abkit_experiments-{version}-")
    names = zipfile.ZipFile(wheel).namelist()
    assert "abkit/__init__.py" in names
    assert any(n.endswith(".dist-info/entry_points.txt") for n in names)


def test_release_workflow_is_tag_triggered_only():
    trigger = _workflow().split("jobs:")[0]
    assert re.search(r"tags:\s*\n\s*-\s*[\"']?abkit-v\*", trigger)
    assert "pull_request" not in trigger and "branches" not in trigger
    assert "workflow_dispatch" not in trigger


def test_release_publishes_through_trusted_publishing_without_a_token():
    text = _workflow()
    assert re.search(r"environment:\s*\n\s*name:\s*pypi\b", text)
    assert re.search(r"id-token:\s*write", text)
    assert "pypa/gh-action-pypi-publish@" in text
    for forbidden in ("PYPI_API_TOKEN", "password:", "TWINE_PASSWORD", "secrets."):
        assert forbidden not in text, forbidden


def test_release_id_token_is_only_on_the_publish_job():
    text = _workflow()
    head, publish = text.split("  publish:")
    assert "id-token" not in head
    assert "needs: build" in publish
    assert re.search(r"permissions:\s*\n\s*id-token:\s*write", publish)


def test_release_checks_the_tag_against_the_package_version_before_building():
    text = _workflow()
    assert "GITHUB_REF_NAME" in text
    assert "abkit-v" in text
    assert text.index("GITHUB_REF_NAME") < text.index("python -m build")


def test_release_actions_are_pinned_to_a_full_version():
    uses = re.findall(r"uses:\s*(\S+)", _workflow())
    assert uses
    for ref in uses:
        assert re.search(r"@(v\d+(\.\d+)*|[0-9a-f]{40})$", ref), ref
