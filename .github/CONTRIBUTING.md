# Contributing to TravelPlan

Thanks for your interest in TravelPlan. By taking part you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Run it locally

Follow [DEVELOPMENT.md](../DEVELOPMENT.md): prerequisites, environment
variables, Docker services and the dev servers.

## Workflow

1. Open an issue first for anything larger than a small fix.
2. Branch from the latest `develop`, named `<type>/<short-description>`
   (`feature/`, `fix/`, `test/`, `docs/`, `chore/`).
3. Write the failing test first, then the code (red → green → refactor).
4. Open the pull request into `develop` (never `main`) and fill in the template.
   PR titles use `<type>: <description>` (`feat`, `fix`, `test`, `docs`,
   `chore`, `refactor`).

## Checks that must pass

These run in CI on every pull request and must be green before merge:

- `npm run lint`
- `npm run typecheck`
- `npm run build` (run `npm run build:shared` first if you changed `packages/shared`)
- `npm run test` (unit tests of every workspace)
- The backend Docker image build

If you touch `analytics/` (Python), also run `ruff check`, `ruff format --check`
and `pytest -q` for the package you changed.

Never commit `.env` files, keys or tokens.
