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
| `.ai-reports/arcs/<ARC-ID>/arc.json` | ARC registry entries (Multi-ARC V1.1 Increment 1, B3). **Reference material for arc attribution only** — see the carve-outs below |

**ARC registry carve-outs (B3 — binding, so the auditor does not regress).**

- **Documentary root.** The registry root is `<--root>/.ai-reports/arcs/` and is reference
  material only: it is **never rendered as audit rows** and never counted as a scanned artifact
  (`templates/arc-audit.md` is unchanged). The auditor has no `Bash` and therefore cannot resolve
  the main worktree; when auditing from a linked worktree the owner passes `--root <main worktree>`
  — the auditor cannot detect a wrong root itself. `STRAY-REGISTRY` is a `/arc-registry status`
  flag, **not an auditor flag**.
- **Absent root is informational.** `.ai-reports/arcs/` missing ⇒ one line,
  `registry not bootstrapped`, and the audit continues. It is **never a stop condition** (the
  pre-bootstrap state and every linked worktree look exactly like this).
- **Registry entries are a separate scan class.** `arc.json` files are JSON: no `# HANDOFF`
  header, no `- From:`, no `Status:`. They are **excluded from the header-normalization
  denominator** and from the >20% abort; they never count as handoffs.
- **What the auditor may take from an entry:** `arcId`, `state`, `authority.artifact` (for the
  orphan rule in §8) and `planning.revisions[].source` (to match handoffs to an arc). Nothing in
  an entry is authority over a handoff, over CHECKPOINT, or over any runtime fact.

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
    - Arc: <ARC-ID>                    (optional — registry arc identity for attribution, §8)
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
4. A handoff may carry the status as a **bold field**, `**Status:** <value>`, instead of the
   `- Status:` key. Read the bold field **only when no `- Status:` key exists** in the header
   block — a `- Status:` key always wins.
   The bold field `**Task state**` is **not a status source**: a task's runtime state is not the
   artifact's status, and inferring one from the other would be guessing. An artifact carrying
   neither key normalizes to `UNKNOWN` and is flagged.

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

**Precedence: rows are evaluated in table order and the first matching row wins.** Rows are
ordered most-specific first, so a compound ARC-era string is classified by its own row before a
generic substring inside it can claim it — `PLANNING SOURCE — revision r2. NOT RATIFIED … (rev1
DRAFT/HOLD)` is `PLANNING-SOURCE`, never `RATIFIED` or `HOLD`. A pattern written with a trailing
placeholder (`SUPERSEDED-BY <file>`) matches on its literal prefix.

| Class | Matches (case-insensitive, substring) |
|---|---|
| `PLANNING-SOURCE` | `PLANNING SOURCE` |
| `ACTIVE-SOURCE` | `ACTIVE ROUTING SOURCE`, `ACTIVE PUBLICATION SOURCE` |
| `IMPLEMENTED-UNCOMMITTED` | `IMPLEMENTED IN THE WORKING TREE`, `UNCOMMITTED` |
| `IMPLEMENTED-COMMITTED` | `COMMITTED + PUSHED`, `COMMITTED, PUSHED` |
| `REVIEW-RECORD` | `REVIEW RECORD` |
| `STANDING-POLICY` | `STANDING POLICY` |
| `SCOPE-DEFINITION` | `SCOPE DEFINITION` |
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

Two sources, fixed precedence (owner ruling O-1, 2026-08-22):

1. **`- Arc: <ARC-ID>` header — wins** for grouping when present (a registry `arcId`,
   `^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$`, case-exact).
2. **Slug prefix — fallback heuristic** when the header is absent (`p5-…` → P-5, `sc-t2…` → SC,
   `hs-1…` → HS-1, `c1-s4…` → C1). When the slug carries no recognizable arc key, attribute to
   `UNATTRIBUTED` and flag it — do not guess from the title.

When both are present and **disagree**, group by `- Arc:` and raise a **normalization flag** for
owner ruling — never a silent reclassification (SKILL.md standing rule).

**Neither source is runtime authority.** Slug-prefix attribution **never identifies a runtime
ARC**, and neither does the header: the publisher takes `arcId` only from its typed `--arc`
literal. The two `--arc` flags are **filters over different identity spaces**:
`/arc-progress-auditor --arc <name>` filters this attribution (heuristic, handoff-side);
`/arc-registry status --arc <ARC-ID>` filters registry `arcId` values (exact). The values are
not interchangeable and neither routes anything.

**Orphan rule (registry-aware).** A registry entry whose `state` is past `PLANNING` with
`authority.artifact` null is an orphan — approved work with no defining artifact — and is
reported under §3 Orphans exactly like approved work with no successor artifact.
