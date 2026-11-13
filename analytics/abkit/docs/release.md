# Releasing

The distribution `abkit-experiments` is published to PyPI by
`.github/workflows/release-abkit.yml` through PyPI Trusted Publishing: no token is
stored anywhere. The workflow runs only when a tag `abkit-v<version>` is pushed.

1. Bump `version` in `pyproject.toml` and `__version__` in `src/abkit/__init__.py`
   (a test keeps them equal), refresh the results (`python -m abkit.readme_results --write`),
   and merge to `develop`, then release through `main`.
2. Push the tag on `main`: `git tag abkit-v0.1.0 && git push origin abkit-v0.1.0`.
3. The workflow checks the tag against the package version, runs the tests, builds
   the wheel and sdist, runs `twine check`, builds the docs with `mkdocs build --strict`,
   then the `publish` job (GitHub environment `pypi`) uploads them.

One-time setup, by the repository owner: on PyPI add a pending trusted publisher for
project `abkit-experiments` (owner `tlamDson`, repository `TravelPlan`, workflow
`release-abkit.yml`, environment `pypi`), and create the `pypi` environment in the
repository settings (a required reviewer there makes every release a manual approval).
