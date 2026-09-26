@AGENTS.md

# Claude Code notes

Claude Code loads this file. Project constitution is in `AGENTS.md` via the import above. Keep long-lived rules there so Cursor and Claude stay aligned.

## Extra for Claude Code

- Skills: native discovery from `.claude/skills/`. Those files are adapters. The full workflow is `.skills/<name>/SKILL.md`.
- Before product work, read `plans/00-north-star.md` and the plan for the current tier.
- Do not duplicate Cursor-only paths (`.cursor/rules`) into this file. They encode the same constraints as `AGENTS.md`.
- Windows workspace: use forward slashes in skill and doc links.
