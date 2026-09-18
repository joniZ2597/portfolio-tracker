# AGENTS.md — Portfolio Tracker / Pulse (simplified workflow)

Shared guidance for Claude Code and Codex on this repo. Effective 2026-09-18, this replaces
the old ARC/registry/claim workflow as the active default (see `CLAUDE.md` FROZEN LEGACY
section for that history).

## Repo orientation

- Single-page app: `index.html` (client), `netlify/functions/` (server functions), `services/`
  (shared server-side helpers).
- `qa/` holds offline QA scripts, one per feature area (`qa/run-offline.js` is the aggregate
  runner).
- `CHECKPOINT.md` is local-only, gitignored legacy historical context from the old ARC
  workflow — useful background, but not authoritative. Current operational truth comes from
  Git (branches, log, diff), active worktrees, task evidence, and QA/review results — and the
  `work/<id>/` task-folder convention (see "Task folder convention" below). Never commit or
  recreate `CHECKPOINT.md` elsewhere.
- Task branches/worktrees should normally be based on `branch-dev`, the integration branch.
  Moving anything to `main`/production always requires separate, explicit Owner approval.
- `BACKLOG.md` is the canonical product backlog / queue of intent. It does not override Git,
  active worktrees, task evidence, QA, or review evidence as operational truth.

## Task brief convention

Before implementing, state in plain language: what file(s) will change, the smallest scoped
diff that satisfies the request, and how it will be validated. See "Task folder convention"
below for how this becomes an Owner-approved `work/<id>/brief.md`.

## Task folder convention

Each implementation task uses `work/<id>/`, where `<id>` is a stable slug derived from the task's
branch/worktree name (e.g. `work/p7-a2-news-catalysts/`, `work/tradingview-alerts/`). No
centrally allocated id, no lookup table, no registry.

- `brief.md` (tracked) — the Owner-approved task scope: what file(s) will change, the
  smallest scoped diff, how it will be validated. It may be drafted directly at
  `work/<id>/brief.md` before approval — the required sequence is: draft `work/<id>/brief.md`
  → Owner reviews the exact current contents → Owner approves the exact brief-only commit →
  commit it unchanged → implementation may begin. **An uncommitted or merely staged brief does
  not authorize implementation** — only the tracked, committed brief whose exact contents were
  Owner-approved does.
- `qa.log` (untracked, gitignored via `work/*/qa.log`) — raw output from targeted/full QA runs
  for this task.
- `review.md` (tracked) — the QA result summary and the Codex review outcome. Populated after
  Codex reviews the implementation diff and any required fixes/QA re-runs are done; then one
  final lightweight Codex check runs against the complete final diff including `review.md`
  itself, so the complete final task diff (implementation + `review.md`) is reviewed before it
  is committed. `review.md` is committed in the same commit as any final implementation
  touch-ups — that commit's Owner approval and the separate, later Owner LAND approval are two
  distinct events, never conflated even when they happen close together.

No separate authorization record, editable status, or lifecycle state machine exists. The only
operational meaning of a tracked, committed `brief.md` is that implementation may begin within
its exact approved scope. `review.md` is evidence only and authorizes nothing. Commit, LAND, and
SHIP still require their explicit Owner decisions. No registry, claim, or mutex exists anywhere
in this convention.

## Test commands

- During implementation: run the targeted `test:<area>` script(s) in `package.json` relevant to
  the area being touched.
- At LAND: `npm run qa:offline` is the required full-suite gate, plus any additional targeted
  tests still relevant to the change. The full suite is not required before every intermediate
  functional commit — only at LAND.
- `npm run test:qa` — Playwright browser QA, used only when browser-level verification is
  needed.

## Codex as diff reviewer

Codex reviews the actual diff, not a plan or a description of intended changes. Before asking
for a Codex review, make the actual implementation diff available in the task working tree or
task branch, then give Codex the real diff (`git diff`, commit, or branch comparison). Codex
review normally happens before LAND.

## Owner LAND / SHIP boundaries

- **LAND** (integrate the reviewed task into `branch-dev`): requires `npm run qa:offline`
  passing, a clean `git status`, and a reviewed diff (Codex or Owner). Claude Code may prepare
  and request LAND; it does not decide LAND is done — the Owner confirms.
- **SHIP** (`branch-dev` → `main`/production): always requires explicit, separate Owner
  approval, on top of a landed and QA'd `branch-dev` state. Never bundled with a LAND approval.

## Protected actions (always require explicit Owner approval)

- Any edit, merge, checkout, reset, or deploy touching `main`/production.
- `git push`, force-push, or any destructive Git operation (`reset --hard`, `clean -f`,
  `branch -D`, etc.).
- Every Netlify write requires explicit Owner approval — including deployments, branch
  deploys/previews, environment-variable changes, and any other Netlify mutation. Read-only
  Netlify inspection does not require approval.
- Live external API canaries (SEC, Perplexity, or similar).
- Committing — Claude Code prepares and requests, the Owner approves the exact scope.

## Simplified worktree model

- Use plain `git worktree add <path> <branch>` for parallel tasks — no registry, claim file,
  or mutex. A worktree is just an isolated checkout; delete it (`git worktree remove`) when the
  task lands or is abandoned.
- Existing worktrees at the time of this writing (`pt-wt-panel`, `pt-wt-wft`, plus older
  `-lab-*` experiment worktrees) may continue to be used or cleaned up as their own tasks
  dictate — this convention doesn't retroactively require changing them.
- Each worktree stays scoped to one task; do not stack unrelated work in the same worktree.
