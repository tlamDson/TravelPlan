# Git, commit, PR

## Branches and worktrees

`develop ← <type>/<description> (PR)`, `main ← develop` (release per the authority charter). Always create a branch from the latest `origin/develop`. Branch types: `feature/`, `fix/`, `test/`, `docs/`, `chore/` — lowercase, kebab-case, a specific description (not `fix/bug`, `feature/wip`).

One worktree per task (several sessions run in parallel on the same repo; if they share a directory, one session's `git checkout`/`reset` wipes the other's uncommitted changes). A headless session is already given its worktree. A manual session: `EnterWorktree` before editing the first file, then:

```bash
git fetch origin develop
git reset --hard origin/develop
git branch -m <type>/<description>
```

A new worktree has no `.env` and no `node_modules`: copy `.env`, `backend/.env`, `frontend/web/.env` (and `.env.e2e` if you touch E2E) from the main directory, then `npm install`. A dev server in a worktree uses a different port from the main directory. Do not use bare `git stash` (the stack is shared across worktrees) — use a temporary WIP commit.

## Commit

One line, imperative, completing the sentence "If applied, this commit will…". No `feat:`/`fix:` prefix (those are for PR titles only). Verbs: `add`, `fix`, `update`, `remove`, `refactor`, `test`, `docs`, `chore`. Do not commit `.env`/secrets, `node_modules/`, `dist/`, coverage, or files outside the scope of the task.

## Pull request

Target `develop`. Title `<type>: <short description>` (< 72 characters; `feat|fix|test|docs|chore|refactor`). Body:

```markdown
## Summary

- <main change, reason>

## RED

<red test output of the first commit>

## Test plan

- [ ] First commit has only red tests (TDD)
- [ ] Related tests pass; `npm run lint`, `npm run typecheck` pass
- [ ] No `.env` or secrets committed

## Assumptions

- <small decisions made on your own; things noticed out of scope and not fixed>
```

Before pushing more commits to an open PR: `gh pr view <n> --json state` — if the PR is `MERGED`/`CLOSED` there is no new CI; open a new branch from `develop`.

## CI (`.github/workflows/ci-pr.yml`)

The names of the 3 jobs `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build` **are** the required check names on GitHub:

- Do not rename them; for new work, add a job with a different name.
- Do not add `paths:` to `on: pull_request` (the check hangs at "Expected" and the PR cannot merge).
- Do not put a job-level `if:` on these 3 jobs — gate at the step level (the `changes` + `env.SHOULD_BUILD` pattern).
- If you see `|| echo` wrapping lint/test, someone is disabling the gate — ask before keeping it.
- The `abkit Lint + Test` job (Python `analytics/abkit`, B2) follows the same rules as the 3 jobs above: do not rename it, no job-level `if:`. The B2 plan puts it into the required checks — that is the repo owner's job (branch protection).
- Auxiliary jobs (`security`, `e2e`, …) are allowed to be red; do not add them to the required checks on your own.
