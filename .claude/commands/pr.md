---
description: Commit, push, open a PR into develop, then hold the turn until CI concludes
argument-hint: [pr title]
allowed-tools: Bash(git status *), Bash(git diff *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *), Bash(git checkout -b *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(gh pr create *), Bash(gh pr view *), Bash(gh pr checks *), Bash(gh pr merge *), Bash(gh run list *), Bash(gh run view *), Read, Write, Edit
---

An optional command for **manual sessions** — the conductor's headless sessions do not use this command (they stop at push, see the "Two kinds of session" section in `CLAUDE.md`).

You are running the full PR-opening procedure for TravelPlan, per `.claude/rules/git-pr.md`. Work sequentially, and do not ask the user again unless you are hard-blocked (missing auth, a conflict you cannot resolve yourself).

## 1. Preflight

`gh auth status` — if not logged in, stop immediately and say why; do not try to continue.
`git status --porcelain` and `git rev-parse --abbrev-ref HEAD` to see where you are.

## 2. Branch

If on `main` or `develop`, create a new branch from the current `develop` (not `main`):

```
git checkout -b <type>/<kebab-case-description>
```

`<type>` is one of `feature/fix/test/docs/chore`, inferred from the content of the change or from `$ARGUMENTS`. Never commit directly to `develop`/`main`.

## 3. Commit

`git add` only the files that belong to the real change (do not use `git add -A` casually if the working tree has stray files of unknown origin — check `git status` first). Review with `git diff --cached --stat`. Commit following the convention in `.claude/rules/git-pr.md`: imperative mood, one line, no `feat:`/`fix:` prefix. End the message with the trailer:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 4. Push

```
git push -u origin <branch>
```

## 5. Create the PR

```
gh pr create --base develop --title "<type>: <short description>" --body "..."
```

The body follows the PR template in `.claude/rules/git-pr.md` (Summary + RED + Test plan + Assumptions). Add the footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Take the PR number from the returned URL.

## 6. Arm the guard — this step is MANDATORY before waiting

Write the file `.claude/.ci-watch.json`:

```json
{ "pr": <n>, "branch": "<branch>", "armed_at_epoch": <unix now>, "deadline_epoch": <now + 3600>, "attempts": 0, "max_attempts": 6, "last_status": "pending" }
```

## 7. Wait for checks to register

```bash
n=0
until [ "$(gh pr view <n> --json statusCheckRollup --jq '.statusCheckRollup|length')" -ge 2 ] || [ $n -ge 36 ]; do
  n=$((n+1)); sleep 5
done
```

## 8. Bounded watch — do NOT end the turn between rounds

Bash tool, timeout 540000 (9 minutes):

```bash
gh pr checks <n> --watch --fail-fast --interval 20 >/dev/null 2>&1
echo "watch_exit=$?"
gh pr checks <n> --json bucket,name,state,link --jq '.[] | "\(.bucket)\t\(.name)\t\(.link)"' || true
```

If it times out, call exactly this command again (at most 5 rounds ≈ 45 minutes). Do not stop the turn between calls.

## 9. Classify

```bash
gh pr checks <n> --json bucket --jq 'if any(.[]; .bucket=="pending") then "PENDING" elif any(.[]; .bucket=="fail" or .bucket=="cancel") then "FAILED" else "PASSED" end'
```

## 10. If FAILED

```bash
gh run list --branch <branch> --workflow "CI - PR Check" --limit 1 --json databaseId,conclusion
gh run view <id> --log-failed
```

Diagnose, fix, commit, push, go back to step 7 (the guard is still armed, no need to arm again).

## 11. If PASSED or the deadline is reached

Delete `.claude/.ci-watch.json`. If PASSED and the PR targets `develop`: merge (`gh pr merge <n> --squash`) only if an independent review has already PASSed (the authority rule in `CLAUDE.md`); if there is no review yet, report the PR as ready and waiting for review. If the PR targets `main`: **never merge on your own**, only report that the PR is ready for the repo owner to decide. If the deadline passes without PASSED, do not merge — report the status. Always report: the PR URL, the check table (name + bucket), the merge result (merged / left for the repo owner to merge), and state clearly that **lint/test now really block CI** (no more `|| echo`), so green means the tests truly pass.

## 12. If the deadline passes and it is still PENDING

Disarm, then re-arm as a background task (`run_in_background: true` on `gh pr checks <n> --watch`) so the user is still notified when it finishes, and say clearly that you have switched to background mode.

⚠️ Do not interpolate `$ARGUMENTS` into a `` !`…` `` block — it is not shell-escaped; pass it as prose to use in the Bash tool call.
