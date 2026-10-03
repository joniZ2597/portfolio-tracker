# Review — Entry 7 closeout: commit the original closure census, close entries 7 and 11, split the Stale-badge item, remove volatile snapshot fields

Brief: `work/entry7-closeout/brief.md` @ `a22c3aa` (brief-only commit; the task branch starts there).
`origin/branch-dev` = `eab818f`; `main` = `origin/main` = `fbec2c1`. Mode: Auto (attended), Worker A.
Diff base used throughout: `a22c3aa` — the brief's own commit, per §Baseline "The task branch starts at
this brief's commit" (a diff against `eab818f` adds only the two brief-only commits `ce3099b`, `a22c3aa`).

## Summary

Documentation and evidence only. The original DH Entry-7 closure census (two files, measured at
`e27ce1c`) is committed byte-identical from the §2 primary copy; `BACKLOG.md` receives exactly E1–E6
(entries 7 and 11 marked DONE, entry 30 created from census I-1, the volatile snapshot table removed
under the §1 E one-time exception); G-1's closure by DH-M4c is confirmed read-only. No code, QA suite,
`AGENTS.md` or `CLAUDE.md` change.

## Files changed

- Implementation (3): BACKLOG.md, work/dh-entry7-closure-census/census.md, work/dh-entry7-closure-census/review.md
- Evidence (tracked): work/entry7-closeout/brief.md, work/entry7-closeout/review.md

Reading used: brief §4 lists "exactly 4 files" including this `review.md`; the fixed two-row shape places
`review.md` in the Evidence row, so the Implementation row carries the other three. The §4 set and the
`land-scope` block are otherwise identical to the rows above.

## Step 0

- Git safety: slot `pt-wt-worker-a` on `task/entry7-closeout` at `a22c3aa`, clean, descends from `eab818f`;
  `git status --porcelain .claude` empty (current-guard PASS); brief tracked and unmodified at M2;
  `node_modules/` newer than `package-lock.json` (no `npm ci` needed).
- Baseline `npm run qa:offline`: **PASS, 53 spawned suites** (`qa.log` line 1). Started before the first edit; the
  BACKLOG and census edits landed while it ran (the run took about 34 minutes). No suite reads `BACKLOG.md` or
  the census files, and the post-edit full run below matches it.
- **STOP-6 during step 1:** one read-only Bash command whose text named the land tool (a `grep` over its
  source to preview land-request checks, bundled with unrelated read-only probes) was BLOCKED by
  `pretooluse-guard` R12. Not retried, not rerouted. Owner ruling 2026-10-03: "STOP-6 is not
  task-invalidating. Continue from step 1." Continued; the land tool's source was not inspected.

## Census — original files, preserved byte-for-byte (brief §2)

| File | sha256 (working copy) | Bytes | CR count | blob OID (filtered = `--no-filters`) |
|---|---|---|---|---|
| `work/dh-entry7-closure-census/census.md` | `184712079b0cc17fca264e01a5c9c4c7283b8ed8fbdc4eb012ba57301e073f34` | 12 680 | 0 (LF) | `5d24aa48…4e4d23` |
| `work/dh-entry7-closure-census/review.md` | `2e841c599de325a58c4ee1f5e81fa58c84dc90b40b485228af09f7c7479a9e1e` | 5 131 | 0 (LF) | `0b15beea…6c1ce` |

- Both the primary copy (Worker B scratchpad `dh-entry7-closure-census-setaside/`) and the durable copy
  (`_held-briefs/dh-entry7-closure-census-setaside/`) matched the §2 hashes, sizes and LF endings before
  copying; the working copies were taken from the primary copy with `cp` and re-hashed (table above).
- `git hash-object` with and without filters yields the same OID for both files, so `core.autocrlf` cannot
  alter them on staging; the staged-blob sha256 check (`git cat-file blob :<path>`) is run at step 13 and
  reported there.
- The files were not regenerated, edited or reconstructed; the census was not re-run.

## G-1 closure check (brief §5, read-only)

- At the task base, `_eodBuildPacket`'s `fx` limitation branches (`index.html:3031-3038`): `missing` and
  `stale-invalid` keep their DH-M4a literals; every other state composes its trailing word through
  `_dhLabel('state', reporting.fxState)` (`index.html:3036-3037`) with the `[aged-but-valid]`
  disambiguator — no raw `fxState` concatenation remains.
- The pinned RD-AC14 fixture row (`qa/eod_packet_v0_offline.js:1227`) reads
  `"FX: rate 3, USD/ILS, as of 2026-09-15T12:00:00.000Z, Current."` — it no longer ends `…, fresh.`
  (the only remaining `fresh.` literal, `:1067`, is the RD-FL1 planted-negative expectation).
- `node qa/eod_packet_v0_offline.js` → **PASS (196 asserts)**.
- Result: **PASS**; G-1 closed by DH-M4c (`dd389ba`, `work/dh-fx-limitation-wording/review.md`). No new
  census rows.

## BACKLOG edits E1–E6 (brief §3) — text checks (brief §6)

Scratch check `/tmp/pt-entry7-closeout/check_backlog.js` (deleted after use), run against the unedited
file first (28 of 31 FAIL — tests first), then after the edits: **31 of 31 PASS**, covering:

- E1–E6 new texts present exactly once (line breaks read as spaces); every E-old text absent (E1/E3 old
  headings as full lines; E2 old opening, `*Briefed:* DH-M2b` and closing text; E5 old traceability
  sentence).
- No `Base snapshot`, `Normalized`, `112 commits ahead`, `effective suites`, `**21** active entries` or
  snapshot-table row remains; `## Orientation` once, followed by the replacement line and the unchanged
  **Active ARC** / **Activation Register** paragraphs.
- Entries 7 and 11 marked DONE; DONE / HISTORY order `**6**` → `**7**` → `**8a**` and `**10**` → `**11**`
  → `**S2 slices**` on consecutive lines.
- Entry 30 exactly once, exact brief text, in LATER immediately after row 28 and before HOLD; I-1 stated as
  an open decision ("Decide whether…"), never as closed.
- Every SHA written by E1–E3 resolves to a commit (`git cat-file -t`, 9 SHAs); each subject matches its
  slice (DH-M0a `20a81e2`, DH-M1 `98d3d68`, DH-M2 `5ad0a5f`, DH-M2b `0522247`, DH-M3 `6e3e64d`,
  DH-M4a `99d4844`, DH-M4b `e27ce1c`, DH-M4c `dd389ba`, Entry 11 `5a32c4d`).
- Line endings preserved: `BACKLOG.md` 246 lines / 246 CR before and after (working tree CRLF; the Git
  blob is LF at `a22c3aa` and stays LF under `core.autocrlf=true` — unchanged convention).
- `git diff --stat a22c3aa` → `BACKLOG.md | 40 ++++++++++++++++++++--------------------` (20 insertions,
  20 deletions) and nothing else tracked; untracked: only the two census files. Hunks: 7 with default
  context (10 at `-U0`), each inside an E1–E6 region; no other line changed.

One scratch-check correction: the "Active ARC paragraph still follows the heading block" assertion first
used a six-line window after `## Orientation`, one line short of the wrapped three-line replacement
paragraph plus blanks; the window was fixed in the scratch script (no BACKLOG change) and now asserts the
exact shape (heading, blank, three lines, blank, `**Active ARC:**`).

## QA

- Land-tests (unchanged suites): `node qa/dh_ui_vocabulary_offline.js` → **PASS (64 assertions)**;
  `node qa/eod_packet_v0_offline.js` → **PASS (196 asserts)**.
- Full `npm run qa:offline` after the edits: **PASS, 53 spawned suites** — equal to the Step-0 baseline.
- QA suites that read in-scope files as text: none. `qa/arc_registry_offline.js` names `BACKLOG` but is
  denylisted; `qa/run-offline.js` names it only in its denylist comment; no suite reads the census files.

## Codex review (implementation diff, base `a22c3aa`)

Launched by the Worker: `codex exec --sandbox read-only`, stdin prompt carrying the brief, the tracked diff
(`git diff a22c3aa -- BACKLOG.md`), the untracked census files verbatim, the `git log` subjects of every
cited SHA and the working-copy hashes; raw output in `work/entry7-closeout/codex.md`. **No Class I, no
Class II findings. VERDICT: PASS.** Codex's checks, verbatim:

> - **1 — PASS.** The Entry 7 closure and DH-M4c resolution are supported by the census, commit log, and DH-M4c review; Entry 11's landed toggle is supported by the commit log and its review.
> - **2 — PASS.** Entry 30 preserves I-1's unresolved ResearchView badge decision as a separate item; it does not say I-1 is closed.
> - **3 — PASS.** The BACKLOG diff contains only E1–E6 edits. The specified new text appears in the diff, and the replaced text is gone.
> - **4 — PASS.** Both census files match the brief's SHA-256 hashes and byte counts. The commit log confirms each cited SHA resolves to a commit.
> - **5 — PASS.** The working tree shows only `BACKLOG.md` modified and the two census files untracked; `work/entry7-closeout/review.md` is not present yet, as expected before it is written.

## FIX / DEFER / REJECT ledger

No findings — nothing to classify.

## Fresh-context self-review (step 7)

Re-read the brief and the complete diff against the requirement→test map (`plan.md` R1–R17). Every E-text
matches the brief character-for-character (E2, E5 rewrapped only at existing spaces); the `>` quote markers
were not inserted; entry 30 is a single table row; the Active ARC and Activation Register paragraphs are
untouched. Nothing changed as a result of the self-review.

## Backlog reconciliation

- **Brief's Backlog row:** Entry 7 — `close` · Entry 11 — `close` · new Entry 30 — created (split from 7,
  Owner ruling 2026-10-03) · one-time removal of the volatile snapshot/count fields (Owner ruling
  2026-10-03, §1 E). `BACKLOG.md` is in the file set and in `land-scope`.
- **Action taken:** `closed` (entries 7 and 11) + `updated` (entry 30 created; snapshot table replaced by
  `## Orientation`; traceability count sentence trimmed).
- **Affected headings, before → after:**
  - `### 7 · EOD data-readiness + data-state presentation contract` →
    ``### 7 · EOD data-readiness + data-state presentation contract — **DONE** (`dd389ba`)``; status
    paragraph replaced by the E2 closure text (landed slices DH-M0a…DH-M4c; I-1 split out to entry 30;
    I-2 out of scope by design).
  - `### 11 · Selected-for-scan visibility` → ``### 11 · Selected-for-scan visibility — **DONE**
    (`5a32c4d`)``; `*Landed:*` line added after `**Search / Scan** · small.`.
  - `## Base snapshot` (five-row table) → `## Orientation` (one replacement line); traceability sentence
    loses the `**21** active entries` clause.
  - LATER table: new row `| 30 | ResearchView `Stale` badge — shared-contract decision | Data honesty | …`
    immediately after row 28.
  - DONE / HISTORY: ``**7** EOD data-readiness + data-state presentation contract —
    `work/dh-entry7-closure-census/` ·`` after `**6**`; ``**11** Selected-for-scan visibility —
    `work/selected-only-watchlist/` ·`` after the `**10**` item.
- **Confirmation:** the new BACKLOG text matches the diff (`git diff a22c3aa -- BACKLOG.md`, hunks limited to
  E1–E6), the QA results above (31/31 text checks, land-tests PASS, full suite at the baseline count) and the
  work being landed (the committed census with G-1 resolved by `dd389ba`; entry 11 landed at `5a32c4d`).

## Final check

Final check: 1 round, 1 class-II finding fixed (the `[rule]` lesson now states it is deferred and out of scope), self-checked; no implementation change, no QA re-run.

Codex's final check (raw output under `## Final check` in `codex.md`): Class I none; Class II one (the `[rule]` lesson's status should read as deferred and out of scope, since `AGENTS.md` is not in this brief); the Backlog reconciliation, Files changed counts and QA counts (53 / 53) confirmed accurate; **VERDICT: PASS**.

## Lessons

- [rule]     (Deferred, out of this task's scope: `AGENTS.md` is not in the brief, so this waits for the task
             that owns it.) Destination-ready text for `AGENTS.md` "Auto-approved commands" (or the hook notes): "The R12
             trigger matches the land tool's name anywhere in a Bash command's text, including read-only
             `grep`/`cat`/`wc` over its source or its log. Never put that literal in a shell command; inspect
             the hook files with the Read tool or a `.claude/hooks/*.js` glob." (Fifth STOP-6 of this kind
             across two tasks; each needed an Owner ruling.)
- [local]    A scratch text-check whose positional window is sized to the old layout fails on the new one —
             the fix belongs in the check, and the review must say so rather than widen the BACKLOG edit.
- [local]    Two Worker slots running `npm run qa:offline` at the same time both spend ~22 minutes inside
             `qa/pt_land_offline.js` (1 302 s in the archived timings); the runs are independent, but a
             Step-0 baseline started while the other slot's run is in that suite is not stalled, just slow.
- [backlog]  `qa/pt_land_offline.js` dominates `qa:offline` wall time (~21.7 min of the full run); a
             QA-hygiene task could split its mutant rows or cache the fixture repo — pending routing (this
             brief limits `BACKLOG.md` to E1–E6).
- [covered]  `withMutantSource` temp-directory leak (453 `ptland-mut-*` directories on this host now) —
             already recorded as a pending `[backlog]` lesson in `work/owner-one-action-gates/review.md`.

LAND-EVIDENCE: qa-offline=PASS 53; targeted=PASS; codex-classI-unresolved=0
