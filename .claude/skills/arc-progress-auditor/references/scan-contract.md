# Scan Contract — arc-progress-auditor

Read-only reference. Defines what the auditor reads, how it reads it, and how it
normalizes what it finds. If the underlying conventions drift, update **this file**
— not the skill body.

## 1. Artifact roots

Relative to `--root` (default: repo root):

| Root | What it is |
|---|---|
| `.ai-reports/handoffs/*.md` | Durable Lab/Cowork/Main handoffs — the primary evidence |
| `.ai-reports/handoffs/README.local.md` | **Source of the filename + header contract below.** Read it first; if it disagrees with this file, the README wins and this file is stale (report that as a finding) |
| `CHECKPOINT.md` | Authoritative project state record |
| `PORTFOLIO_ENDGAME_QUEUE.md` | Local-only work queue |

**Not evidence.** Codebase Memory MCP (unreliable/stale by standing ruling), git
history, chat transcripts, agent memory, and dashboards are never authoritative
project-state evidence for this audit. Durable artifacts only.

## 2. Filename contract

    YYYY-MM-DD_<task-slug>.<TOOL>.md

Date-sorted listing is the index. Observed `TOOL` values:

| Suffix | Meaning |
|---|---|
| `.LAB.md` | Lab lane finding |
| `.COWORK.md` | Cowork lane contract/scope/definition |
| `.MAIN.md` | Main Control ruling record |
| `.CODEX-REVIEW.md` | Independent Codex review |
| anything else | `UNKNOWN` → flag |

The suffix denotes the **authoring tool**, not the decision-maker. A `.MAIN.md`
file may be authored by Cowork recording Main Control rulings; that is correct and
is not a conflict.

**Known drift:** `README.local.md` documents only `LAB` and `COWORK`, but `.MAIN.md`
files and non-`.md` exports (`.LOCAL.json`) exist in the directory. Non-`.md` files
are out of scope for SCAN. Do not "correct" the README.

## 3. Header contract

Header block, first ~14 lines of each handoff:

    # HANDOFF — <task/topic>
    - From: LAB | COWORK | ...        As-of: YYYY-MM-DD
    - Repo ref (if relevant): <branch> @ <short hash>
    - Status: <status string>
    - Consumes: <prior filename(s)> | none
    - Companion: <filename>            (optional)
    - Verification level: repo-verified | live-verified | product-reasoning (unverified)

**Parsing rules — both learned from real misparses; do not skip.**

1. `Consumes:` is frequently a **multi-line, comma-continued list**. Its value runs to the
   next `- <Key>:` line and stops there. Do not let it swallow `- Companion:`,
   `- Verification level:`, or any other key — that fabricates citations.
2. `Consumes:` is **not always filenames**. Prose citations occur
   (e.g. `- Consumes: owner amendments 1–5 (...)`). Extract filenames only where the
   `YYYY-MM-DD_*.md` pattern actually appears; otherwise record the prose verbatim as
   an unresolvable citation and flag it.
3. Header keys beyond the README template exist in the wild (`- Companion:`,
   `- Sequencing ruling (binding):`). Accept unknown `- <Key>:` lines; never treat one
   as the start of the body.

Semantics from the README, binding:

- An artifact is **consumed** when a later artifact cites it in `Consumes:`.
- `Companion:` is a **reciprocal link, not succession**. Two companion artifacts
  reference one another as a set. A companion-linked artifact is **not an orphan** even
  when nothing cites it in `Consumes:`, and a companion link **never** establishes
  supersession in either direction.
- **Supersession** = a new artifact plus a `Status: SUPERSEDED-BY <filename>` line
  in the original, edited only by the original author's tool.
- **Nothing in a handoff authorizes anything.** Approvals come from Main Control,
  per action. `CHECKPOINT.md` stays the sole authoritative state record.

## 4. Required tool mechanics

The skill has `Read`, `Grep`, `Glob` only — no `Bash`. Use exactly these:

- **Enumerate** — `Glob` on `.ai-reports/handoffs/*.md`.
- **Headers** — `Read` with `limit: 14`. Never read a handoff body during SCAN.
  Bodies are read only for an arc the owner explicitly asks to adjudicate.
- **CHECKPOINT / queue headings** — `Grep` with `-n`, `output_mode: "content"`,
  pattern `^##+ `. Then `Read` targeted `offset`/`limit` ranges only.

Cost guard: 47 handoff headers ≈ 660 lines. `CHECKPOINT.md` is ~7,200 lines /
~770 KB — **never read it whole.**

## 5. CHECKPOINT reading rule — ordering gotcha

`CHECKPOINT.md` ordering is **mixed**, and a naive read misses recent work:

- `###` arc sections descend **newest-first from the top**.
- `##` sections are **appended at the tail** and are the **most recent** entries.

Always grep the full heading list with line numbers and take dates from the
heading text. A head-only read silently drops the newest work. Treat any arc
present in a tail `##` section as recent regardless of its position.

## 6. Queue reading rule

Read `## ` item headings and the re-baseline preamble only. The queue carries its
own `Last updated:` line — if that date trails the newest CHECKPOINT heading, the
queue itself is a staleness finding.

## 7. Status normalization

Status strings are **not a fixed enum**. Normalize to a class; report the raw
string verbatim alongside it.

| Class | Matches (case-insensitive, substring) |
|---|---|
| `OPEN` | `OPEN` |
| `CLOSED` | `CLOSED`, `CLOSED PASS`, `COMPLETE`, `DONE` |
| `RATIFIED` | `RATIFIED`, `ACCEPTED` |
| `SUPERSEDED` | `SUPERSEDED-BY <file>` |
| `HOLD` | `HOLD`, `PARKED`, `DEFERRED`, `BLOCKED` |
| `APPROVED-NOT-STARTED` | `APPROVED` without a `CLOSED`/`COMPLETE` marker |
| `REGISTERED` | `SPEC REGISTERED`, `REGISTERED` |
| `UNKNOWN` | anything else → **flag for owner ruling** |

Compound and qualified strings are real and must not be flattened — e.g.
`RATIFIED EXCEPT FOR STEP-4-DEPENDENT SYNTHESIS SHAPE` normalizes to `RATIFIED`
**and** raises a normalization flag, because the qualifier changes its meaning.
Never drop a qualifier silently.

## 8. Arc attribution

Derive the arc from the task slug prefix (`p5-…` → P-5, `sc-t2…` → SC, `hs-1…` →
HS-1, `c1-s4…` → C1). When the slug carries no recognizable arc key, attribute to
`UNATTRIBUTED` and flag it — do not guess from the title.
