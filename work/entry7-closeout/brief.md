# Task brief: P1 — Entry 7 closeout: commit the original closure census, close entries 7 and 11, split the Stale-badge item, remove volatile snapshot fields

This brief has operational effect only when the Owner has approved these exact contents and the brief-only
commit records them unchanged. Everything this brief relies on is written below.

| | |
|---|---|
| Backlog | **Entry 7 — `close`** · **Entry 11 — `close`** · **new Entry 30 — created** (split from 7, Owner ruling 2026-10-03) · **one-time removal of the volatile snapshot/count fields** (Owner ruling 2026-10-03). `BACKLOG.md` is in the file set **and** `land-scope` |
| Baseline | eab818f8fdcff302e680a09e3b5cee22365068d6 = origin/branch-dev (one-line approval gates landed), plus the `work/tech-score-default/brief.md` brief-only commit placed immediately before this one; main = origin/main = fbec2c193346d7afd1dab6fd11a46b5efe55238b. §3 anchors verified at `5c711b1`; `BACKLOG.md` and the land-tests are byte-identical at `eab818f`. The task branch starts at this brief's commit |
| Branch / slot | `task/entry7-closeout`, **Worker A**, created fresh from this brief's commit after the Owner's slot cleanup (which deletes the premature branch at `21315ee`) |
| Mode | **Auto** (attended). Documentation and evidence only; no ASK- or DENY-tier file |
| qa:offline | baseline count measured at Step 0 → unchanged (no code, no suite change) |
| Parallel with | Tech Score default (`task/tech-score-default`, Worker B): shares only `BACKLOG.md`, different entries; only this task touches the snapshot section. P2a (held): `BACKLOG.md`. Whichever task LANDs later needs a Second-LAND rebase in the Owner's terminal |
| Status | CODE-READY on Owner approval of this brief |

Objective. Close BACKLOG entry 7 on the **original, committed** closure census plus its documented
resolution; record entry 11 as landed; keep the census's one undecided item (the ResearchView `Stale` badge)
alive as its own entry; and remove the snapshot fields that go stale on every LAND.

## 1. Rulings (approved; not reopened)

- **Census:** commit the original census files unchanged; never regenerate, edit or reconstruct them.
- **E (Owner ruling 2026-10-03):** remove the obsolete snapshot/count fields from `BACKLOG.md` in this task.
  This is the **approved one-time exception** to step 10a's "Never edit the snapshot table, counts" clause,
  for P1 only. After P1 those fields no longer exist, so the clause has nothing left to protect.
- **I-1 (Owner ruling 2026-10-03):** the unresolved ResearchView `Stale` badge decision is **not** closed with
  entry 7. It becomes **Entry 30**, a separate backlog item for future work.
- **I-2** (API-connectivity status words) stays out of scope, as the census recorded: a different domain.

## 2. Evidence — the original census, preserved byte-for-byte (not regenerated)

| File | sha256 | Bytes | Line endings |
|---|---|---|---|
| `census.md` | `184712079b0cc17fca264e01a5c9c4c7283b8ed8fbdc4eb012ba57301e073f34` | 12 680 | LF |
| `review.md` | `2e841c599de325a58c4ee1f5e81fa58c84dc90b40b485228af09f7c7479a9e1e` | 5 131 | LF |

- **Primary copy:** `C:\Users\Owner\AppData\Local\Temp\claude\C--Users-Owner-Documents-Project-pt-wt-worker-b\875cf034-2962-4c7b-8596-ac8fc638a9a4\scratchpad\dh-entry7-closure-census-setaside\`
- **Durable copy:** `C:\Users\Owner\Documents\Project\_held-briefs\dh-entry7-closure-census-setaside\`
- Both re-verified 2026-10-03 against the hashes above.
- **What it contains:** measured at base `e27ce1c` (post DH-M4b); one gap, **G-1** (the `_eodBuildPacket` `fx`
  limitation line printing raw `fxState`); two out-of-scope items, **I-1** (ResearchView `Stale` badge) and
  **I-2** (API-connectivity words).
- **How G-1 was closed:** DH-M4c (`dd389ba`); see `work/dh-fx-limitation-wording/review.md` and the DH-M4c rows
  in `qa/eod_packet_v0_offline.js`.
- A hash mismatch at both copies is **STOP-2**.

## 3. BACKLOG edits (exact; anchors verified at `5c711b1`; working-tree line endings preserved)

"Old" texts match exactly once when line breaks are read as spaces. Rewrap only edited paragraphs. The `>`
quote markers are not part of the inserted text.

**E1 — Entry 7 heading.**
- Old: `### 7 · EOD data-readiness + data-state presentation contract`
- New: ``### 7 · EOD data-readiness + data-state presentation contract — **DONE** (`dd389ba`)``

**E2 — Entry 7 status paragraph.** Old: the paragraph that starts `*Landed:* DH-M1 readiness block + shared
display table (`98d3d68`);` and ends `until each holding is refreshed once.` New:

> *Closed 2026-10 on the committed closure census (`work/dh-entry7-closure-census/census.md`, base `e27ce1c`, one gap G-1) and its resolution by DH-M4c (`dd389ba`).* Landed slices: DH-M0a vocabulary census (`20a81e2`); DH-M1 readiness block + shared display table (`98d3d68`); DH-M2 U1–U8 display vocabulary (`5ad0a5f`); DH-M2b ruled words R1/R3/R4 (`0522247`); DH-M3 pre-export warning (`6e3e64d`); DH-M4a ruled FX missing/stale export wording (`99d4844`); DH-M4b aged-but-valid FX → `Current · N d old`, no readiness lowering (`e27ce1c`); DH-M4c FX limitation line routed through `DH_DISPLAY` (`dd389ba`). *Split out:* the ResearchView `Stale` badge decision (census I-1) → **entry 30**. *Out of scope by design:* the API-connectivity status words (census I-2; a different domain).

**E3 — Entry 11.**
- Heading. Old: `### 11 · Selected-for-scan visibility`. New:
  ``### 11 · Selected-for-scan visibility — **DONE** (`5a32c4d`)``
- Insert one line immediately after the `**Search / Scan** · small.` line:

  > *Landed:* "Selected only" watchlist toggle (`5a32c4d`; `work/selected-only-watchlist/`).

**E4 — DONE / HISTORY list** (step-10a form, entry-number order):
- Insert immediately after the line ``**6** Technical Score v1 surfacing — `aa62aea` ·``:

  > **7** EOD data-readiness + data-state presentation contract — `work/dh-entry7-closure-census/` ·

- Insert immediately after the line `Risk / Reward column or chips in Scan Results) ·` (the end of the `**10**`
  item):

  > **11** Selected-for-scan visibility — `work/selected-only-watchlist/` ·

**E5 — remove the volatile snapshot/count fields (one-time exception, §1 E).**
- Heading. Old: `## Base snapshot`. New: `## Orientation`.
- Delete the whole five-row table under it (from the `| | |` line through the
  ``| `qa:offline` | **50** effective suites …`` line) and put this line in its place:

  > Commit positions, counts and suite totals are not recorded here — they go stale on every LAND. Read them from Git (`git log`, `git rev-list --count origin/main..branch-dev`) and from `npm run qa:offline`.

- The **Active ARC** and **Activation Register** paragraphs under the heading are unchanged.
- Traceability. Old:
  > *Historical totals are approximate (~40 merged refs, ~50 retired, ~64 done) and deliberately not enumerated line-by-line. The **21** active entries above are exact (numbered entries in NOW, NEXT, LATER, HOLD and HOLD / EXTERNAL; DONE-marked entries excluded).*

  New:
  > *Historical totals are approximate (~40 merged refs, ~50 retired, ~64 done) and deliberately not enumerated line-by-line.*

**E6 — new Entry 30** (I-1 split). Append one row to the LATER table, immediately after the `| 28 | Broker API /
MCP observation producer | …` row:

> | 30 | ResearchView `Stale` badge — shared-contract decision | Data honesty | **Split from entry 7 at its closure (Owner ruling 2026-10-03).** The ResearchView result badge (`'Stale'` / `'Research'` in `_renderPortfolioPanel`) is an independent literal, text-identical to `DH_DISPLAY.state['stale']` but not routed through `_dhLabel`. Decide whether this local vocabulary joins the shared data-state contract (the DH-M0b ownership decision was never made for it); if yes, a small slice routes it through `DH_DISPLAY`. *Evidence:* `work/dh-entry7-closure-census/census.md` (I-1); `work/dh-vocabulary-census/census.md` | — |

**Unchanged:** every other `BACKLOG.md` line.

## 4. Scope — exactly 4 files

```
work/dh-entry7-closure-census/census.md   ORIGINAL, byte-identical copy (sha256 in §2)
work/dh-entry7-closure-census/review.md   ORIGINAL, byte-identical copy (sha256 in §2)
BACKLOG.md                                E1–E6 only
work/entry7-closeout/review.md            NEW — ## Backlog reconciliation; ends with the LAND-EVIDENCE line
```

<!-- land-scope:begin -->
BACKLOG.md
work/dh-entry7-closure-census/census.md
work/dh-entry7-closure-census/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/dh_ui_vocabulary_offline.js
node qa/eod_packet_v0_offline.js
<!-- land-tests:end -->

- The census files are **LF** and stay LF in the commit. Before committing, the Worker verifies that the
  staged blob sha256 equals §2, using `git cat-file blob :<path>`.
- No `index.html`, QA, `AGENTS.md` or `CLAUDE.md` edit. The census is **not** re-run.
- **QA suites that read in-scope files as text:** none read `BACKLOG.md` (`qa/arc_registry_offline.js`
  mentions the word but is denylisted) or the census files.

## 5. G-1 closure check (read-only, recorded in the task's `review.md`)

- at the task base, the `_eodBuildPacket` `fx` limitation branches take their words from `DH_DISPLAY` /
  `_dhLabel` (cite the anchor);
- the pinned fixture row no longer ends `…, fresh.`;
- `node qa/eod_packet_v0_offline.js` PASS.

Any failure → **STOP-2**. No new census rows.

## 6. QA

- Step 0 `qa:offline` baseline.
- Land-tests PASS (unchanged suites).
- Census: staged blob sha256 equal §2 exactly; G-1 closure check PASS.
- **BACKLOG text checks** (scratch under `/tmp/pt-entry7-closeout/`, deleted after use; results in
  `review.md`):
  - E1–E6 new texts present exactly once; every E-old text absent;
  - no `Base snapshot`, `Normalized`, `112 commits ahead`, `effective suites` or `**21** active entries`
    text remains;
  - entries 7 and 11 marked DONE; the DONE list reads `**6**` → `**7**` → `**8a**` and `**10**` → `**11**` →
    `**S2 slices**`;
  - entry 30 exists exactly once, in LATER, after 28; no other entry, table row or paragraph changed (diff
    hunks limited to E1–E6);
  - every SHA written resolves to a commit (`git cat-file -t`);
  - line endings preserved; `git diff --stat` shows only the §4 files.
- Full `qa:offline` at the Step-0 count.
- Codex read-only review: every BACKLOG claim is supported by the census, `git log` and the landed review
  files; entry 30 faithfully states I-1.

## 7. Flow, STOP, Definition of Done

**Flow:** AGENTS.md steps 0–16 in attended Auto:
1. Step 0;
2. copy the two census files byte-for-byte from the §2 primary copy (falling back to the durable copy) and
   verify their sha256;
3. the G-1 closure check;
4. step 10a: E1–E6;
5. QA and Codex;
6. `review.md` with `## Backlog reconciliation` (row: 7 close, 11 close, 30 created, one-time snapshot
   removal; action `closed` + `updated`; each affected heading before → after; one line confirming the BACKLOG
   text matches the diff, QA and census) and
   `LAND-EVIDENCE: qa-offline=PASS <n>; targeted=PASS; codex-classI-unresolved=0`;
7. Codex final check (a missing or incorrect reconciliation is Class I);
8. gated commit; post-commit integrity (reported only);
9. LAND request → Owner `!` → LAND → push request (public DEV deploy notice) → Owner `!` → push → cleanup.

**STOP:**
- STOP-1..6;
- a census hash mismatch at both copies, or a failed G-1 closure check (STOP-2; do not fix it here);
- any file outside §4; any BACKLOG wording beyond E1–E6;
- any edit, regeneration or reconstruction of the census files;
- entry 30 missing, or I-1 described as closed.

**Definition of Done:**
- the original census committed byte-identical (§2 hashes); G-1 closure confirmed;
- E1–E6 exact; text checks PASS; QA PASS at the baseline count;
- `review.md` includes the `## Backlog reconciliation` section;
- Codex: no unresolved Class I finding;
- LANDed, pushed and cleaned through steps 14–16 with the Owner's two `!` lines.
