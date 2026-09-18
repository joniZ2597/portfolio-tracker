# Task review: canonical BACKLOG.md

## Task

Introduce canonical, root-level `BACKLOG.md` and one pointer to it from `AGENTS.md`'s "Repo
orientation" section, per the approved brief at `work/canonical-backlog/brief.md` (committed
`95573f8`).

## Implementation branch

`task/canonical-backlog` (worktree `C:/Users/Owner/Documents/Project/pt-wt-canonical-backlog`),
based on `branch-dev` at `95573f8`.

## Implementation scope

- New `BACKLOG.md` (repository root).
- Modified `AGENTS.md` — "Repo orientation" section only, one approved pointer line added.
- No other file changed.

## QA / verification evidence

- `BACKLOG.md` verified byte-for-byte against the locked brief content: programmatic
  extraction of the fenced block from `git show 95573f8:work/canonical-backlog/brief.md`
  compared directly to the written `BACKLOG.md` — exact match, 9421 bytes both sides.
- `git status --short` confirms no unrelated files changed: only `AGENTS.md` (modified) and
  `BACKLOG.md` (new, untracked at verification time).
- No product, runtime, or QA file touched; `CLAUDE.md` and `work/canonical-backlog/brief.md`
  unchanged; no legacy backlog/status document edited or deleted.
- Documentation-only change — no behavior change to score, Actionable Take, recommendations,
  normal scan, or persistence.

## Codex review

- BLOCKING: NONE
- VERDICT: READY FOR FINALIZATION

## Non-blocking note

`BACKLOG.md`'s "Base snapshot" table records a normalized dated snapshot as of `e1442ab`. The
current task's base has since moved to `95573f8`. Per `BACKLOG.md`'s own stated rule ("If this
file and the repository disagree, the repository is right and this file is stale"), the
repository remains the source of truth and this offset does not block finalization — noted for
awareness, not as a defect.

## Final task status

Ready for final Codex check (complete final diff, including this file) before requesting the
final task commit approval.
