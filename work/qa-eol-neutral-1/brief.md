# Master Brief: qa-eol-neutral-1 — make `eod_packet_v0` line-ending neutral (EOL-2)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL, HELD** (COWORK, 2026-10-13). Swept at `14d6c94a9c1c1dbdeefec1a19a728e6c6dba8208`, which is `branch-dev` = `origin/branch-dev` (host probe 13:26Z: canonical CLEAN). It is placed only on the Owner's R11 approval of this exact hash.

| | |
|---|---|
| Defect (confirmed at `14d6c94`) | `qa/eod_packet_v0_offline.js` hard-codes `\r\n` in three planted-negative mutation anchors (:501 AC16, :576 AC10, :1062 RD-FL1) and matches them against the raw `index.html` read (:77). On an **LF** working tree the anchors are absent: 4 checks FAIL, then RD-FL1 throws `RD-FL1 planted-negative anchor missing` and the suite exits 1. On a **CRLF** working tree it PASSes (196 asserts). Today's host checkouts are CRLF, so no current failure |
| Impact | Any LF checkout (fresh clone without `core.autocrlf`, CI, the sandbox) fails `npm run qa:offline` |
| Backlog | none (EOL-2, Owner EOL decisions 2026-10-13) |
| Baseline | **`14d6c94`**. Valid only if the §TS checks hold at the task-start tip; otherwise HOLD |
| Branch / slot | `task/qa-eol-neutral-1`, **Worker B** (`pt-wt-worker-b`, detached at `14d6c94`, clean), after the normal Bootstrap task-start |
| Mode | **Manual**, attended. QA-only change |
| qa:offline | suite count **unchanged** from step 0 (85 at `14d6c94`). This suite: 196 → **200** asserts |
| Parallel with | `tase-units-1` (Worker A, `task/tase-units-1`): **no shared file** (§P). **One heavy run at a time across both slots** |

## §0 Audit refresh (COWORK, read-only, at `14d6c94`; scratch trees outside the repo)

**Method:** `git archive 14d6c94` extracted twice. One tree is kept as stored (**LF**); in the other every text file is converted to **CRLF** (the `core.autocrlf=true` equivalent). Node v22.23.2.

**Scope of the refresh:** the files changed since the `de5b136` audit are `index.html`, `qa/fixtures/index-pins.json`, `qa/labs_panel_offline.js`, `qa/land_evidence_check_offline.js`, `qa/market_pill_offline.js` and work records. The refresh re-ran the EOL-relevant suites plus every suite added or changed since `de5b136`. The other 89 suites are byte-identical to the `de5b136` audit, which found them EOL-neutral.

| Suite | LF | CRLF |
|---|---|---|
| `eod_packet_v0_offline.js` | **FAIL**: AC16 / AC10 sanity + planted negatives FAIL, then RD-FL1 throws (exit 1) | PASS (196) |
| `eod_preexport_warning_offline.js` | PASS (58 / 58) | PASS (58 / 58) |
| `market_pill_offline.js` (new) | PASS (46) | PASS (46) |
| `labs_panel_offline.js` (changed) | PASS (32) | PASS (32) |
| `land_evidence_check_offline.js` (fixed by LE-2) | PASS (55 / 55) | PASS (55 / 55) |

**Correction to the FINAL-DRAFT:** there are **three** mutation anchors (:501, :576, :1062), not four. :504 is inserted text, not an anchor.

**Prototype (this brief's §1, applied in both trees):**

| State | LF tree | CRLF tree |
|---|---|---|
| S1 (RED) | exit 1: the pre-existing anchor failures and the RD-FL1 throw (the original defect) | exit 1: **EOL-1a and EOL-1b FAIL** (2 of 200) |
| S2 (GREEN) | **PASS (200 asserts)** | **PASS (200 asserts)** |
| S2 with an identity `loadIndexText` | EOL-1a and EOL-1b FAIL (PN-EOL-1 holds) | — |

## §SCOPE (Owner EOL-2; nothing else)

1. Read `index.html` once through **`loadIndexText(raw)` = `IDX_CORE.normalizeText(raw)`**, the LF normaliser of the pin map (`qa/lib/index-pins-core.js:30`, already required at :37). The three anchors (and the AC16 inserted line) then use `\n`. This is EOL-1 S-1: normalise first; no anchor hard-codes `\r\n`.
2. Hoist the three anchors into named top-level constants that the existing mutation sites use. The site code is unchanged otherwise, and **no existing assertion name or condition changes**.
3. Add the **EOL-row** (EOL-1 S-2) with two planted negatives.

**Allowed files (exactly):**
- `qa/eod_packet_v0_offline.js`
- `work/qa-eol-neutral-1/review.md`

**Forbidden:**
- `index.html`, `qa/fixtures/index-pins.json`, `qa/lib/**` (`normalizeText` is reused, not changed);
- `qa/run-offline.js` (protected), `package.json` (protected);
- `qa/land_evidence_check_offline.js`, `qa/eod_preexport_warning_offline.js`;
- every file in `tase-units-1`'s land-scope (§P);
- `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `.gitattributes` (EOL-5 deferred), `BACKLOG.md`.

## §TS Task-start checks (Bootstrap, read-only, at the task-start tip T)

| # | Check | Value at `14d6c94` |
|---|---|---|
| TS-1 | `git rev-parse T:qa/eod_packet_v0_offline.js` | `a7d6930441b73aa9e34a444b32f98f1f20dbab97` (unchanged since `ac8f39b`) |
| TS-2 | `git rev-parse T:qa/lib/index-pins-core.js` equals the base blob | `a8ae73317d65aa43129b9fe41aa09f4c34d5e888` |
| TS-3 | each §A anchor matches exactly once in `git show T:qa/eod_packet_v0_offline.js` | §A |
| TS-4 | `T` is `14d6c94` or a descendant whose diff from `14d6c94` contains none of the allowed files: `git diff --name-only 14d6c94 T` | — |

Any TS failure → **HOLD, return to COWORK**. An `index.html` change from `tase-units-1` does **not** fail TS. Its effect is covered at step 10 / Second-LAND resync by the EOL-row's anchor-once check.

## §A Anchors (`14d6c94`, `qa/eod_packet_v0_offline.js`; each exactly once)

| Anchor | Line |
|---|---|
| `const content = fs.readFileSync(INDEX_PATH, 'utf8');` | :77 |
| `const FNS = [` | :78 |
| `  // index.html is CRLF-terminated end to end, so the extracted production` | :498 |
| `    const marker = '  var holdings = preload.holdings;\r\n';` (literal backslash-r-backslash-n in source) | :501 |
| `localStorage.setItem('pt_eod_last_export', asOf);\r\n"` | :504 |
| `    const blockMarker = "  lines.push('## Limitations');` | :576 |
| `  const FL1_RAW_AFTER = ` (two-line literal ending `+ '.');";`) | :1062–1063 |
| `console.log(failures === 0` | :1367 |

## §P Parallel-safety with `tase-units-1` (verified at `14d6c94`)

| | `tase-units-1` land-scope | this task |
|---|---|---|
| Files | `index.html`, `qa/tase_units_offline.js`, `qa/tech_snapshot_cache_offline.js`, `qa/labs_panel_offline.js`, `qa/fixtures/index-pins.json` | `qa/eod_packet_v0_offline.js`, `work/qa-eol-neutral-1/review.md` |
| Overlap | **none** | **none** |

- **Semantic coupling (read-only):** `eod_packet_v0` reads `index.html` and is one of `tase-units-1`'s land-tests.
  - `tase-units-1` changes `formatStockContext`, `buildTechSnapshotBlock`, `parsePerplexityContext` and `renderMainPanel`. None of them is `_eodBuildPacket` or `_eodPacketToMarkdown`, which hold the anchors.
  - The suite's pin checks (`_eodPacketToMarkdown`, `_pfEodIsStale`) are not in `tase-units-1`'s pin delta.
- **Order:** whichever task LANDs second does the normal Second-LAND resync (mode R) and re-runs step 10. The resync is conflict-free because no file is shared.
  - This task's brief commit advances `branch-dev` past `tase-units-1`'s base, so `tase-units-1` will resync at LAND in any case.
- **Heavy runs:** this task's step 0, step 10 and the EOL-3 checkpoint must not overlap Worker A's step 0 / 10 / resync / checkpoint runs. The Owner sequences them.

## §1 Slices

**S1 — RED (structure only; behaviour unchanged).**
1. Replace :77 with:
   - `function loadIndexText(raw) { return raw; }` (identity at S1);
   - `const RAW_INDEX = fs.readFileSync(INDEX_PATH, 'utf8');`;
   - `const content = loadIndexText(RAW_INDEX);`.
2. Directly above `const FNS = [`, add the three constants, **still in their current `\r\n` form**, each byte-identical to today's literal: `AC16_MARKER`, `AC10_BLOCK_MARKER` and `FL1_RAW_AFTER_SRC`. Then point the three sites at them:
   - `const marker = AC16_MARKER;`
   - `const blockMarker = AC10_BLOCK_MARKER;`
   - `const FL1_RAW_AFTER = FL1_RAW_AFTER_SRC;`
3. Add the **EOL-row** immediately before the final `console.log(failures === 0 …`:
   - `lfRaw = RAW_INDEX.replace(/\r?\n/g, '\n')`, `crlfRaw = RAW_INDEX.replace(/\r?\n/g, '\r\n')`;
   - `anchorsOnce(t, ac16)` is true only when, in `extractFunctionSource(t, '_eodBuildPacket')`, `ac16` and `FL1_RAW_AFTER_SRC` each occur exactly once **and** `AC10_BLOCK_MARKER` occurs exactly once in `extractFunctionSource(t, '_eodPacketToMarkdown')`;
   - `eolRow(loader, ac16)` returns `{ same: loader(lfRaw) === loader(crlfRaw), anchors: anchorsOnce(loader(lfRaw), ac16) && anchorsOnce(loader(crlfRaw), ac16) }`;
   - **EOL-1a** `eolRow(loadIndexText, AC16_MARKER).same`;
   - **EOL-1b** `eolRow(loadIndexText, AC16_MARKER).anchors`;
   - **PN-EOL-1** `eolRow(identity, AC16_MARKER).same === false` (no normalisation is caught by EOL-1a);
   - **PN-EOL-2** `eolRow(loadIndexText, '  var holdings = preload.holdings;\r\n').anchors === false` (a CRLF-literal anchor is caught by EOL-1b).
4. **RED evidence** (record which applies in `review.md`):
   - on a **CRLF** checkout: exit 1 with **exactly EOL-1a and EOL-1b FAIL**, `FAIL (2 of 200 asserts failed)`;
   - on an **LF** checkout: exit 1 with the pre-existing AC16 / AC10 failures and the RD-FL1 throw (the original defect).

**S2 — GREEN.**
1. `loadIndexText` becomes `return IDX_CORE.normalizeText(raw);`, with a two-line comment: `qa-eol-neutral-1: one EOL-neutral read of index.html (LF via the pin-map normaliser), so the mutation anchors hold on LF and CRLF checkouts alike.`
2. In the three constants and in the AC16 inserted line (:504), `\r\n` becomes `\n`. **Nothing else in those literals changes.**
3. Replace the stale two-line comment at :498–499 with: `// index.html is read through loadIndexText (LF-normalised), so markers use \n on every checkout.`
4. `node qa/eod_packet_v0_offline.js` → **`EOD PACKET V0: PASS (200 asserts)`**. All 196 existing asserts keep their names and pass.
5. Run `node qa/eod_preexport_warning_offline.js` → PASS (58 / 58), as a control.
6. **Second-form proof:** the EOL-row runs the loader on both an LF and a CRLF copy of the real `index.html` in memory. No checkout change and no `core.autocrlf` change is allowed or needed.

**§2 Continuation:** S1 → S2 when:
- RED is recorded as in S1.4;
- `git diff --stat` lists only the suite;
- Codex (step 8, S1 diff) has no unresolved Class I.

**Program STOP:**
- any change outside the two allowed files;
- any existing assertion name or condition edited or removed;
- an assert count other than 200 at S2;
- a second concurrent heavy run;
- any hook denial or refusal (STOP-6);
- any live / DEV / Netlify action;
- any `git config` / checkout-EOL change.

## §C Hard constraints

| Constraint |
|---|
| **EOL safety (S-1).** Every source text this task's QA code reads is normalised first (`IDX_CORE.normalizeText`). No anchor, marker or expected string hard-codes `\r\n`, or a `\n` that must match raw working-tree bytes. The pin checks keep hashing LF-normalised text (`normalizeText` is idempotent on the already-normalised `content`) |
| **EOL-row (S-2)** runs the loader on both an LF and a CRLF in-memory copy of the real input and produces the same result; its planted negatives bite |
| The suite's existing 196 asserts are unchanged in name and condition; the only existing-code changes are the read at :77, the three anchor sites (now constant references), the :504 inserted line ending and the :498–499 comment |
| The suite stays read-only: no write, no Git, no network |
| `npm run qa:offline` PASS with the suite count equal to step 0 |

## §3 Codex review (independent; read-only)

- **Step 8 (S1 diff) and step 12 (final), on the real diff.** Codex confirms:
  - only the two allowed files changed;
  - `loadIndexText` is `IDX_CORE.normalizeText` at S2 and every `index.html` read goes through it;
  - **EOL checklist (EOL-1):** every read of repository text in the changed QA code is EOL-neutral, with no `\r\n`- or `\n`-only literal anchor matched against raw bytes. The EOL-row exercises both LF and CRLF versions of the **real** input, and both planted negatives bite;
  - no existing assertion name or condition changed; the count is 200;
  - the AC16 / AC10 / RD-FL1 planted negatives still bite after the anchor change.
- **Prompt rule:** the Codex prompt text must **not** contain the path of the protected hook script (it causes an R12 denial). Refer to it as "the L9 hook".

## §ET (ET-1; non-blocking)

About **30 min**: setup 8 min, S1 about 6 min, S2 about 4 min, closure 12 min. Plus the Owner gates and any heavy-lane wait for Worker A.

## §CMD Command card (one command per Bash call; Bash only; absolute canonical root)

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git diff --stat
git diff --cached --stat
node qa/guard_integrity_check.js --task task/qa-eol-neutral-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
npm run qa:offline
node qa/eod_packet_v0_offline.js
node qa/eod_preexport_warning_offline.js
git commit -m <message>
git log -1 --format=%h%x20%aI
node qa/guard_integrity_check.js --task task/qa-eol-neutral-1 --root C:/Users/Owner/Documents/Project/portfolio-tracker
node .claude/hooks/pt-land.js land-request task/qa-eol-neutral-1
node .claude/hooks/pt-land.js push-request
<!-- cmd:end -->

- **B (expected prompts):**
  - `git add qa/eod_packet_v0_offline.js work/qa-eol-neutral-1/review.md`;
  - optionally `node qa/land_evidence_check.js --root C:/Users/Owner/Documents/Project/portfolio-tracker --task task/qa-eol-neutral-1` (prompts; no allow rule).
- **C (Owner gates):** R11, R12 LAND, R12 PUSH.
- **Never:** `curl`, `WebFetch`, `netlify`, PowerShell, `git config`, any `core.autocrlf` change.
- **L9 readiness:** before the step-13 commit and again before `land-request`, run the Grep-tool checks on `work/qa-eol-neutral-1/review.md`:
  - E1: exact line = 1;
  - E2: `LAND-EVIDENCE\s*:` = 1;
  - E3: integrity-output lines = 0.

## §X Closure

1. Step 10: full `npm run qa:offline` PASS on the final tree; the suite count equals step 0. **Coordinate the heavy run with Worker A.**
2. `review.md`:
   - the §0 refresh as observed on the slot's own checkout form;
   - RED (which form) and GREEN 200;
   - the EOL-row and PN-EOL-1 / PN-EOL-2;
   - the Codex ledger;
   - `## Timing` (step 0 / step 10 start and end);
   - `## Backlog reconciliation` (none);
   - **the LAND-EVIDENCE line (L9).**
     - `review.md` contains **exactly one** line, on its own, starting at column 1, with no bullet, backticks, bold or trailing spaces: `LAND-EVIDENCE: qa-offline=PASS <N>; targeted=PASS; codex-classI-unresolved=0`.
     - `<N>` = the step-10 suite count.
     - Write it only when step 10, every land-test and Codex (no unresolved class I) passed.
     - Commit it in the same commit as the final implementation. It is the only occurrence of `LAND-EVIDENCE:` in `review.md`.
     - The integrity-check output is **not** written into `review.md`; it goes only in the step-13 STOP report.
     - **After an L9 refusal: STOP-6.** No recovery commit without an explicit, incident-specific Owner ruling.
3. Final Codex check (step 12).
4. Step 13 commit; the integrity check (`guard_integrity_check.js` with the task record); R12 LAND (Owner approval).
5. **EOL-3 checkpoint:** canonical `npm run qa:offline` PASS on `branch-dev` after LAND, with the heavy lane free, **before** the Owner writes the PUSH record. FAIL → HOLD: no PUSH, no cleanup; return to COWORK.
6. R12 PUSH (Owner approval); cleanup.

## §PEP / §UER

- **§PEP:** expected prompts are the `git add` staging and the two R12 verbs.
- **§UER:** **ATTENDED-ONLY**.

## §Y Files, land-scope, land-tests

```
qa/eod_packet_v0_offline.js       loadIndexText (normalizeText) · 3 anchor constants (\n) · EOL-1a/1b · PN-EOL-1/2
work/qa-eol-neutral-1/review.md   evidence
```

<!-- land-scope:begin -->
qa/eod_packet_v0_offline.js
work/qa-eol-neutral-1/review.md
<!-- land-scope:end -->
<!-- land-tests:begin -->
node qa/eod_packet_v0_offline.js
node qa/eod_preexport_warning_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required.

**§L:** if S2 cannot complete, do not LAND the S1 RED state; return to COWORK.
