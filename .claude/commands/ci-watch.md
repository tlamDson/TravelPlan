---
description: Watch CI on an existing PR without stopping the turn until it concludes, or stop watching
argument-hint: [pr-number|stop]
allowed-tools: Bash(gh pr view *), Bash(gh pr checks *), Bash(gh pr merge *), Bash(gh run list *), Bash(gh run view *), Bash(git rev-parse *), Bash(git branch *), Read, Write
---

An optional command for **manual sessions**; the conductor's headless sessions do not use it.

If `$1` is `stop`: delete `.claude/.ci-watch.json` if it exists, report that it is disarmed, and stop here.

Otherwise, resolve the PR: use `$1` if it is a number, else `gh pr view --json number --jq .number` for the current branch. If no PR can be found, say so and stop.

Write `.claude/.ci-watch.json` with `pr`, `branch` (from `git rev-parse --abbrev-ref HEAD`), `armed_at_epoch` = now, `deadline_epoch` = now + 3600, `attempts: 0`, `max_attempts: 6`.

Then follow steps 7–12 of `/pr` exactly (wait for checks to register → bounded watch → classify → handle fail/pass/timeout). When PASSED: check `gh pr view <n> --json baseRefName` — if the base is `develop`, merge (`gh pr merge <n> --squash`) only if an independent review has already PASSed; if not, report that it is ready and waiting for review; if the base is `main`, never merge on your own, only report that it is ready.
