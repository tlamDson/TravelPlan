# Custom Subagents — TravelPlan

## Existing agents

| Agent (`name`)  | File               | Model  | Tools                               | Use when                                                                                                                                                     |
| --------------- | ------------------ | ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-reviewer` | `code-reviewer.md` | sonnet | Read, Grep, Glob, Bash              | Review a diff before committing/opening a PR — TDD compliance, file size/responsibility, layer violations, commit convention, security, Python, data safety. |
| `researcher`    | `researcher.md`    | sonnet | Read, Grep, Glob                    | Explore the codebase (planner, itinerary builder, destinations RAG, calendar sync...) before planning or changing code.                                      |
| `qa-testing`    | `qa-testing.md`    | sonnet | Read, Grep, Glob, Bash, Edit, Write | Write/run tests with TDD Red-Green-Refactor, backend (Vitest) and frontend (Vitest/RTL, MSW, Playwright).                                                    |

## Convention

Each subagent is one `.md` file in this directory. **The real identity of an agent is the `name` field in the frontmatter, not the file name** — the file name only makes it easy to find and may differ from `name`.

Minimal frontmatter:

```markdown
---
name: agent-slug # required — the identifier used when calling through the Agent tool
description: A short description of what this agent does and when to use it.
tools: Read, Grep, Glob # optional — a comma-separated string, NOT a YAML list. Omit to inherit all tools.
model: sonnet # optional — valid aliases: sonnet, opus, haiku, fable (or a full model ID)
---

The agent's system prompt, written like instructions for a new colleague taking over the work.
```
