# Task brief: workflow-repair-1-r2 — lifecycle, integrity-chain and protected-path repairs (land tool, hook, integrity, settings, AGENTS.md)

This brief takes effect only when the Owner has approved these exact contents and the brief-only commit records them unchanged. Everything it relies on is written below.

**Status: FINAL-DRAFT r2-rev2, HELD** (COWORK, 2026-10-14). rev2 = rev1 + Bootstrap's corrections C-1 (intermediate pinned-suite outcome, steps 1 and 3) and C-2 (separate docs commit, §4.2).
- **Retry of `task/workflow-repair-1`:** brief rev4 at `d9d0dd3`; aborted before any commit and archived `ABORTED` by the Owner. Retry needed because rev4 planned only one of the six digest re-pins it required.
- **Content:** rev4 (Bootstrap-reviewed) plus the dependency corrections found by the Pre-R11 Readiness Check (PRC): six pins, transcript re-recording, logic suites, R12-safe candidate names and a readiness lock.
- **Planning package:** `_held-briefs/governance/workflow-repair-1-r2/`; the PRC report hash is in its `HANDOFF.md`.

**R11: HOLD** until Bootstrap's independent PRC re-run (same command, same report sha256) and review of this exact file, and the Owner's final approval.

| | |
|---|---|
| Rulings | **Owner, 2026-10-13:** <ul><li>Q-1…Q-10 as amended by R3-D1…D6;</li><li>D7 revised: abandon the orphan after WR-1 PUSH and cleanup, before lifting the freeze;</li><li>**D8 Option A (Strict):** content-exception terminal LANDs are never recordable;</li><li>uncertain R12 → STOP; filter pipes disallowed; git option allowlist;</li><li>R4-D1 / D2 / D3 provisionally accepted.</li></ul> The score-boost-removal-1 terminal LAND is **never back-filled**. **PRC rulings (Owner, 2026-10-14):** <ul><li>OD-1: the minimum viable PRC, incl. sandbox perturbation and substitute evidence (never presented as equivalent to a Windows host run);</li><li>OD-2: the repo-tracked inventory tool is deferred;</li><li>OD-3: **every r2 re-pin stays explicitly scoped**;</li><li>OD-4: Bootstrap runs the held PRC through the ordinary permission prompt;</li><li>**OD-5: explicit Owner approval of the GIT_CONTRACT pin after its batched replay**.</li></ul> Bootstrap's accepted scope decisions SD-1…SD-7 are kept, **except SD-4's `resync` allow, which is withdrawn (E-1)** |
| Backlog | **none** (governance). `BACKLOG.md` not in scope |
| Baseline | the `branch-dev` tip at this brief's commit. **Valid only if** at that tip these blobs equal their `b2393b6` values; otherwise HOLD and re-pin: <ul><li>`.claude/hooks/pretooluse-guard.js` `8c08d8cb6a47e1453bd25a2457611883a402d3de`</li><li>`.claude/hooks/pt-land.js` `2bf6aeaf296b20cafe438dcca2cedd463637cf78`</li><li>`qa/guard_integrity_check.js` `d50bba85782e7ce9fda69b1bdff782b7d4fe5864`</li><li>`.claude/settings.json` `7222327014fcc99807ae1902ba29b09562349d57`</li><li>`AGENTS.md` `39597f56dde403aa213feae0d3f16ca27e930f44`</li><li>`qa/auto_mode_hardening_offline.js` `fab0ba653fa3ec6c96ca49b2d3469d5afe5f4bec`</li><li>`qa/pt_land_offline.js` `e35d76da658621a70fdf87038781e0a4c10a584b`</li><li>`qa/pt_land_resync_offline.js` `8561f820300f6b40b6c3dc0f1e939e068fb526c8`</li><li>`qa/task_base_offline.js` `a721dd1cdb3cae470f5aaaa4cd623404316281f3`</li><li>`qa/land_evidence_check.js` `c6f8a8a107f4af7bc63720c825da724c3a430b1c`</li><li>`qa/land_evidence_check_offline.js` `814c3a012a2e951e5a7a3df3c10653be723070b2`</li><li>`qa/fixture_template_offline.js` `64cffec0ab8f37a8f1d774011eb6e3db1ca5b84b`</li><li>`qa/git_contract_offline.js` `09d1f86f2805996a117a85a3d65ede7d1ea6e765`</li><li>`qa/pt_land_logic_offline.js` `0ada7478caf14aeddd1fd6a84bee3522dfa61cf0`</li><li>`qa/pt_land_resync_logic_offline.js` `3c6bd3d48aca62e436ab7a8a370beea2ea996079`</li><li>`qa/run_isolation_offline.js` `41f4162deb2f1a8d675bcf4235a1800c85eb7fdd`</li><li>`qa/tools/record-git-transcripts.js` `c66b1b98002908f4afde5e4db177d9ac66b0edba`</li><li>`qa/lib/git-transcript.js` `705e432a58b8379bac187e130779dbe12aede793`</li><li>`qa/lib/git-fake.js` `076507886de205b9d2994ebab6a0760c8f45f224`</li><li>tree `qa/fixtures/git-contract` `a2ebec890077f8f1b1c38a3898c72779fb8ee7d2`</li></ul> Only brief-only commits may lie between `b2393b6` and the tip (today: `d9d0dd3`, the rev4 brief, and this brief's own commit). **Readiness lock (PRC-15):** `evidence/prc/readiness-lock.json` (base `d9d0dd3`, every dependency path → blob). **Step 0 verification:** `git diff --name-only d9d0dd3 HEAD` must list only `work/workflow-repair-1-r2/brief.md`; anything else → HOLD. The base assertion inventory (§3.1) was taken from these blobs |
| Branch / slot | `task/workflow-repair-1-r2`, **slot B** (`pt-wt-worker-b`, detached and idle). Slot A still holds the retired `task/workflow-repair-1` branch and is not used. **Timing:** task-start only under the freeze (§5): no other task open; the only other open record allowed is the orphan `task/ai-output-1-s1`. **Retry id**, if this task is aborted or rolled back: `task/workflow-repair-1-r3`, then `-r3`, …, each with a new brief (retired ids are never reused) |
| Mode | **Manual** |
| qa:offline | **+1 suite** (`qa/workflow_lifecycle_offline.js`, auto-discovered): expected count = step-0 count + 1 |
| Parallel with | **none.** It runs alone under the freeze from R11 to P10. One heavy run at a time, each with heavy-lane clearance |

**Objective.** Make the governed lifecycle self-consistent and closed:
- **no** path that silently breaks other tasks' integrity chains;
- a recordable non-content terminal LAND (strict);
- abandon and retired ids;
- protected resync (mode `P`);
- LAND evidence bound to the tested commit (L9 v2);
- one protected-path policy across the hook, the land tool, integrity and settings;
- strict R12 mention classification;
- a documented, tested verb policy.

Unchanged:
- the R11 / PROTECTED / LAND / PUSH Owner gates;
- STOP-6 for `stop`-class denials;
- `ask` for `land` / `push`;
- **`git add` and `resync` prompting**;
- the heavy-lane gate.

---

## 1. Write surface

| Path | Tier today | Route |
|---|---|---|
| `qa/guard_integrity_check.js` | ordinary | **13-pre only.** **Not** in `protected-scope` (the current tool refuses it as a target). A named review item (§10). After 13a the new slot hook protects it, so any later integrity change is a protected-class fix (§4.1) |
| `qa/land_evidence_check.js`, `qa/land_evidence_check_offline.js` | ordinary | 13-pre; post-13a ordinary FIX window allowed (§4.1) |
| `qa/pt_land_offline.js`, `qa/pt_land_resync_offline.js`, `qa/task_base_offline.js`, `qa/workflow_lifecycle_offline.js` (new) | ordinary | 13-pre; post-13a ordinary FIX window allowed |
| `qa/auto_mode_hardening_offline.js` | ordinary | 13-pre; the post-13a **pin-only** commit; the post-13a ordinary FIX window |
| `qa/pt_land_offline.js`, `qa/pt_land_resync_offline.js`, `qa/task_base_offline.js` — `*_CONTRACT_PIN` blocks | ordinary | **also** the post-13a pin-only commit (LAND / RESYNC / TB pins) |
| `qa/fixture_template_offline.js`, `qa/git_contract_offline.js` | ordinary | **post-13a pin-only commit only** (TEMPLATE / GIT_CONTRACT pins); no other line may change (AP-6 PD-PIN) |
| `qa/fixtures/git-contract/*.json` (21 transcripts) | ordinary | **post-13a re-recording** with `node qa/tools/record-git-transcripts.js` on the Worker host (§4 step 7a), then the transcripts commit. Expected changes: at least the verbs whose Git calls change (sandbox spike: 7 of 21 changed for one added read). All 21 are in land-scope so that no re-record result can fall outside the file set |
| `.claude/hooks/pt-land.js`, `.claude/hooks/pretooluse-guard.js`, `.claude/settings.json` | DENY | **13a** |
| `AGENTS.md` | ASK | **13a** |
| `work/workflow-repair-1-r2/review.md` | ordinary | docs commit |

No other path.

## 2. Requirements

<!-- pep-lint:off -->
<!-- (§2 quotes denied command forms, regexes and future verb forms as specification text) -->

### 2.1 `record-land` (land tool; strict D8-A)

**Verbs:**
- `record-land-request task/<id>`: read-only; prints the Owner line.
- `record-land task/<id>`: consumes the Owner line; appends one audit line.

| ID | Requirement |
|---|---|
| RL-1 | The Owner record `pt-record-land-approval` is bound to `task`, `from` and `to`. Single-use; deleted on success and on any refusal after it was read; stale → refuse |
| RL-2 | Exactly one branch-dev reflog move after `from` (old = `from`, new = `to`). Fast-forward; no merge in `from..to` |
| RL-3 | An open, valid record exists; `to` == the task tip |
| RL-4 | `to` == the **current** branch-dev tip, and that move is the latest reflog entry. **Never retroactive; no back-fill** (including score-boost-removal-1) |
| RL-5 | The audit line is `{verb:"land", task, from, to, result:"ok", reason:null, mode:"record-land", reflogTs}` |
| RL-6 | Canonical checkout only; self-integrity, config and hooks clean |
| RL-7 | Tool lock; a full re-check under the lock |
| RL-8 | Refuse if the task already has `land ok` |
| RL-9 | Every open record's chain explains `from` |
| RL-10 | Audit append is mandatory; on failure nothing is recorded |
| RL-11 | **Strict:** the real L6, L7, L8 and L9 checks pass with base = `from`, tip = `to`. A content-exception LAND is never recordable |
| RL-12 | `origin/branch-dev` is an ancestor of `to` |
| RL-13 | The record's `base` == `from` |

### 2.2 `abandon`, retired ids, archive markers

**Verbs:** `abandon-request task/<id>` (read-only); `abandon task/<id>`.

| ID | Requirement |
|---|---|
| AB-1 | The Owner record `pt-abandon-approval` is bound to `task`, the record's raw sha256 and the task tip. Single-use |
| AB-2 | Refuse if the task tip is an ancestor of branch-dev |
| AB-3 | Refuse if the branch is checked out in any worktree |
| AB-4 | Move the record to `pt-task/archive/<enc>.<YYYYMMDDTHHMMSSZ>.ABANDONED.json`, then append `{verb:"abandon", task, result:"ok", recordSha256}`. Never delete the branch, evidence or audit lines |
| AB-5 | **Id reuse (task-start / adopt):** in addition to RT-1, `task-start` (T4), `adopt-request` and `adopt` refuse an **used** id: an ok `land` audit line, or `work/<id>/review.md` on branch-dev → `RETIRED: ID USED (<reason>)`. Continuation needs a new id and brief |
| AB-6 | Lock; mandatory audit with rollback: the record is restored if the append fails |
| AB-7 | Superseded by RT-1 / RT-2: an abandoned id is one RETIRED state, and the prefix is `RETIRED:` everywhere (rev3's `ABANDONED:` is withdrawn) |
| AB-8 | An open record is required; an invalid open record may be abandoned |
| AB-9 | No other record's verdict changes |

**Retired-id enforcement — RT (Y-2; reconciles AB-5, AB-7 and T-9b).**

| ID | Requirement |
|---|---|
| RT-0 | **`retiredState(commonDir, task)`** returns the **first** match in this order, or `null`: <ol><li>`ABANDONED`: archive marker `<enc>.<ts>.ABANDONED.json`, or an ok `abandon` line;</li><li>`ABORTED`: marker `<enc>.<ts>.ABORTED.json`;</li><li>`ROLLEDBACK`: marker `<enc>.<ts>.ROLLEDBACK.json`;</li><li>`CLEANED`: an ok `cleanup` line, or a plain cleanup archive `<enc>.<ts>.json`.</li></ol> Markers match `^<enc>\.\d{8}T\d{6}Z(\.(ABANDONED\|ABORTED\|ROLLEDBACK))?\.json$` exactly (a near-miss id such as `<id>.b` never matches). **`land ok` alone is not retired:** a landed task must still push and clean up |
| RT-1 | **Every task verb and the integrity check** refuse a retired id **before any other check or I/O beyond the read**, with reason text `RETIRED: <STATE> (task/<id>)`. The verbs: <ul><li>integrity (`runIntegrity` with `--task`): `ok:false`, never PASS, never the generic usage refusal;</li><li>`land-request` / `land`;</li><li>`protected-request` / `protected-commit`;</li><li>`resync`;</li><li>`cleanup`;</li><li>`task-start`, `adopt-request` / `adopt`;</li><li>`record-land-request` / `record-land`;</li><li>`abandon-request` / `abandon`.</li></ul> `push-request` / `push` are task-less and unaffected. `log` never refuses; it shows the RETIRED state in its listing. Refusals append the usual refuse line and change nothing else |
| RT-2 | **The record-less legacy path is closed for retired ids.** A retired id can never be LANDed, resynced, PROTECTED-approved or cleaned through the tool as a record-less task, even if its branch was kept |
| RT-3 | **Parity:** `retiredState` is implemented once in the land tool and once in `qa/guard_integrity_check.js`. Both must return identical results over the RT fixture matrix (T-row RT-PAR). Drift fails QA |

### 2.3 Protected resync — mode `P`

**Trigger:** `resync task/<id>` (Bootstrap; **prompting**, E-1) when the audit holds a `protected-commit ok` for the task whose `to` is an ancestor of the tip. Today that is refused with R2.

| ID | Requirement |
|---|---|
| RP-1 | Slot clean (R1); otherwise refuse, nothing changed |
| RP-2 | The dropped set D = the audited `to` commits in `mb..tip`. Each touches only its approved targets, else refuse `R2-P` |
| RP-3 | Every non-dropped commit touches no protected path, else refuse `R2-P`. Replay only the non-dropped commits in the temporary worktree |
| RP-4 | Per target: `oldBaseBlob = mb:T`, `newBaseBlob = branch-dev:T`. Action `REUSE-CONTENT` if equal, else `REGENERATE` |
| RP-5 | After a mode-P resync, `protected-request` shows each candidate's diff against `newBaseBlob`, and refuses a REGENERATE candidate equal to the previously approved blob |
| RP-6 | A fresh 13a is required (L8: the old `to` is not an ancestor) |
| RP-7 | Post-resync heavy-lane → step 10 → a new docs commit with an L9 v2 line naming the post-13a (or later) tested commit |
| RP-8 | No automatic 3-way merge |
| RP-9 | Conflict → refuse `R3 conflict`; nothing moved; the temporary worktree is removed |
| RP-10 (R4-P) | Non-dropped count and pairwise patch-ids equal; linear on branch-dev; brief blob equal; no target changed by the replay; the non-target file set equal. Otherwise refuse `R4-P` |
| RP-11 | Integrity history predicate accepts `mode ∈ {null,"F","R","P"}` |

**Record history entry:** `{ts, verb:"resync", mode:"P", from:<old base>, to:<new base>}`. The record `base` = the new base.

**Audit line:** `{verb:"resync", task, mode:"P", from:<old tip>, to:<new tip>, base:<new base>, result:"ok", reason:null, recordSha256, droppedProtected:[…], targets:[{path, oldBaseBlob, newBaseBlob, approvedBlob, action}]}`.

**`printResync` mode-P text** (exact; values filled in):

    RESYNC (mode P): task/<id> replayed onto branch-dev <new base>; dropped protected commit(s): <oids>.
    The previous PROTECTED approval is void. Targets:
      <path>  old-base <blob>  new-base <blob>  approved <blob>  -> REUSE-CONTENT | REGENERATE
    Next (Worker, in this order):
      1. Rebuild every candidate from the new-base blob (a REGENERATE target must not equal the approved blob).
      2. protected-request -> Owner PROTECTED record -> protected-commit.
      3. Heavy-lane clearance -> step 10 full qa:offline on the post-13a tree.
      4. Docs commit: one L9 v2 line naming the tested commit.
      5. Integrity (record form) -> land-request.

**Recovery:** any `R2-P`, `R3` or `R4-P` refusal leaves nothing moved. Then either fix the cause and re-run, or abandon the task and restart it under a new id. An Owner-terminal rebase is not a recovery path (the record would be STALE).

### 2.4 L9 v2 and the shared checker (B-4, E-4)

- **v2 line:** `LAND-EVIDENCE: qa-offline=PASS; tested=<40-hex>; targeted=PASS; codex-classI-unresolved=0`.
- **Check:**
  - exactly one LAND-EVIDENCE line of either form;
  - `tested` is an ancestor of the tip and a descendant of the task base;
  - `git diff --name-only tested tip` ⊆ {`work/<id>/**`, `BACKLOG.md`}.
- **v1 line:** accepted only when the record's `briefCommit` is an ancestor of, or equal to, `L9_V1_CUTOFF`.
- **`L9_V1_CUTOFF` (E-4)** = this task's `history[0].to`, i.e. the write-once task-start base.
  - It is not `base`, which moves on resync.
  - The Worker reads it from `node qa/guard_integrity_check.js --task task/workflow-repair-1-r2 --root <canonical> --print-record` and writes it into the candidate as a 40-hex literal.
  - T-7 asserts that it equals the record's `history[0].to`.
- **The line can never name the commit that adds it**, so a v2 task always ends with a separate docs commit.
- **Shared function, compatible with the pre-export tool (B-4):** the land tool exports `landEvidenceVerdict({G, root, task, base, tip, briefCommit})`, and L9 calls the same function. `qa/land_evidence_check.js`:
  1. reads `<root>/.claude/hooks/pt-land.js` **as text**;
  2. if the text contains the exact export line below, it `require`s that canonical file and calls the function, under the no-write / no-spawn instrumentation → `MODE: verdict`;
  3. **otherwise** — the pre-export tool, e.g. the canonical `b2393b6` tool during this task — it uses the existing text-extraction path unchanged (v1 regex) → `MODE: legacy`;
  4. the mode is printed on every run.

  The existing LE-* rows stay and now cover the legacy path. New rows cover the verdict path and checker == L9 parity.
- **Exact export-detection pattern (X-4).**
  - The candidate tool contains **exactly one** line, at column 1, LF-terminated:

        module.exports.landEvidenceVerdict = landEvidenceVerdict;

  - The checker detects it with `/^module\.exports\.landEvidenceVerdict = landEvidenceVerdict;$/m`, on the CRLF-normalised text, and **requires exactly one match**.
    - 0 matches → `MODE: legacy`.
    - more than 1 → refuse `NOT READY: ambiguous export`, exit 1.
  - A mention anywhere else (comment, string, a `module.exports = {…}` object member) does **not** count.
  - **Ordering (Y-5):** the export line must come **after** the last `module.exports = {` assignment in the file, which would otherwise replace it. Otherwise refuse `NOT READY: export overwritten`.
- **No-write / no-spawn / no-network assertion (X-4, broadened Y-5).**
  - In verdict mode, the checker loads the canonical tool and calls the verdict function in a **child process**.
  - **Before `require`,** every function in the families below is replaced by a **throwing stub**, so a forbidden call never takes effect.
  - **Instrumented families:**
    - **`fs` sync:** `writeFileSync`, `appendFileSync`, `writeSync`, `writevSync`, `openSync` (any flag other than `r`), `mkdirSync`, `mkdtempSync`, `renameSync`, `unlinkSync`, `rmSync`, `rmdirSync`, `copyFileSync`, `cpSync`, `truncateSync`, `ftruncateSync`, `chmodSync`, `fchmodSync`, `lchmodSync`, `chownSync`, `fchownSync`, `lchownSync`, `symlinkSync`, `linkSync`, `utimesSync`, `futimesSync`, `lutimesSync`.
    - **`fs` callback:** the same names without `Sync`, plus `write` / `writev`.
    - **`fs.promises`:** the same names, plus `open` with a write / append flag, and `FileHandle` write methods.
    - **Streams:** `fs.createWriteStream`.
    - **Processes:** `child_process` `spawn`, `spawnSync`, `exec`, `execSync`, `execFile`, `execFileSync`, `fork`; `worker_threads.Worker`; `cluster.fork`.
    - **Network:** `net.connect`, `net.createConnection`, `net.createServer`, `net.Socket.prototype.connect`; `tls.connect`; `http.request`, `http.get`, `http.createServer`; the same three on `https`; `http2.connect`; `dgram.createSocket`; `dns.lookup` and the `dns.resolve*` family, including `dns.promises`; the global `fetch` and `WebSocket` (if defined).
    - **`process`:** `process.dlopen`; `process.binding`.
  - **During `require`:** zero calls in any family.
  - **After `require`:** assert `typeof mod.landEvidenceVerdict === 'function'`, else `NOT READY: export is not a function`.
  - **During the verdict call:** only the land tool's git runner may spawn, and only `git` with first argument in {`rev-parse`, `merge-base`, `show`, `diff`, `cat-file`, `log`} and no `--output`. Every other stubbed call stays forbidden.
  - **Any forbidden call** → refuse `NOT READY: side effect during evidence check`, naming the family.
- **Verified vs not verified.**
  - COWORK observed the `if (require.main === module)` guard in the `b2393b6` tool **by text only**.
  - **A full top-level side-effect scan of any tool version was not verified** (Bootstrap's earlier scan was blocked).
  - The runtime assertion above is therefore the control, tested by row CK-SE (§3.2).
  - In legacy mode the checker never `require`s the tool, so the `b2393b6` tool's load-time behaviour is never exercised.
- **This task itself uses the v1 form** (the pre-task tool judges its LAND). Its checker runs in legacy mode against the canonical tool.

### 2.5 R12 classifier v4, the commit-message exemption and `log`

- **Classification only labels;** every R12-triggered command stays denied. The deny reason ends with `[class=mention] use the Read/Grep tool or: node .claude/hooks/pt-land.js log`, or with `[class=stop]`.
- **`mention`** = every criterion of `_held-briefs/governance/workflow-repair-1/evidence-r4/proto4.js` `classifyR12`:
  - no control or non-ASCII characters;
  - none of `$ \` ; | & < > ( ) { } * ? [ ] \ ! ~` (all pipes → stop);
  - exact single-space tokens; no `VAR=` prefix;
  - no token with basename `pt-land.js`;
  - program and every option on the allowlists, including the git subcommand option allowlist.

  Anything else → `stop`.
- **Commit-message exemption:** only an exact `^git commit -m '([^'\x00-\x1f\x7f]{1,500})'$`. Only the message is removed from the R12 trigger input; every other rule evaluates the full command.
- **`log`** (read-only; X-5 restores the full requirement): `log` and `log task/<id>`.
  - Prints the audit-log lines (all, or only those of `task/<id>`) as stored.
  - Then prints the **open-record list**: every `pt-task/<enc>.json` outside `archive/`, with `valid` / `invalid` and the record's task.
  - **No writes, no lock, no Owner record, no ref or index access beyond reads.** It works from the canonical checkout and from a slot.
  - Exit 0 on success, 3 on usage.
  - `VERB_POLICY` tier `allow`. A non-exact form (extra argument, trailing space, wrapper) is denied by R12 like every other verb.
- **The continuation cap is advisory.**

### 2.6 Protected paths (+ R4-D1)

- **Land tool table:** `PROTECTED_PATH_RES` / `PROTECTED_TARGET_RES` add `.claude/skills/`, `.claude/commands/`, `.claude/agents/` and **`qa/guard_integrity_check.js`**; the three `.claude/*` directories become approvable.
- **Hook:** write-guard and staged-deny cover the full table. Since the table includes `^\.claude\/`, the hook staged-deny covers every `.claude/` path; this is permitted delta PD-A4.
- **Integrity C6** staged-deny equals the hook staged-deny.
- **Settings:** `ask Edit(...)` covers every table path that is not already `deny` (§2.7).
- **Parity drift (X-5 restored):** the T-6 parity rows compare the land-tool table, the hook write-guard, the hook staged-deny, the integrity C6 set and the settings Edit tiers. **Any drift between them fails QA** — a path added to one place but not the others.
- **Effective at this task's LAND (X-5 restored):**
  - the new table governs only after WR-1 LANDs;
  - this task's own `qa/guard_integrity_check.js` edits are ordinary 13-pre commits, because the old tool cannot approve the file;
  - from 13a onward the new slot hook protects the file, so any later integrity change is a protected-class fix (§4.1);
  - after LAND, any task changing it needs a `protected-scope` entry and 13a.
- **Blob check:** before L10, P7 and resync load the integrity module, its canonical blob must equal `branch-dev:qa/guard_integrity_check.js`, else refuse `L2: integrity module differs from branch-dev`. It fails closed and cannot lock Bootstrap out (L4 / P3 require canonical clean == branch-dev).

### 2.7 `VERB_POLICY`, settings and AH-8 (C-8, E-1)

**`VERB_POLICY` lives in `.claude/hooks/pt-land.js`** as a frozen object exported through `module.exports`:

    VERB_POLICY = {
      allow:  ['brief-request','protected-request','land-request','push-request','cleanup','task-start',
               'protected-commit','record-land-request','abandon-request','log'],          // 10
      ask:    ['land','push','record-land','abandon'],                                    // 4
      prompt: ['resync','adopt-request','adopt']                                           // 3  (resync keeps prompting - E-1)
    }   // 17 verbs = the main() dispatch set

**Settings delta.** Nothing is removed; `deny` is unchanged; there is **no** `resync` entry and **no** `git add` entry.

| List | Entries added |
|---|---|
| `allow` +7 | <ul><li>`Bash(node .claude/hooks/pt-land.js task-start *)`</li><li>`Bash(node .claude/hooks/pt-land.js protected-commit *)`</li><li>`Bash(node .claude/hooks/pt-land.js record-land-request *)`</li><li>`Bash(node .claude/hooks/pt-land.js abandon-request *)`</li><li>`Bash(node .claude/hooks/pt-land.js log)`</li><li>`Bash(node .claude/hooks/pt-land.js log *)`</li><li>`Bash(node qa/land_evidence_check.js *)`</li></ul> |
| `ask` +6 | <ul><li>`Bash(node .claude/hooks/pt-land.js record-land *)`</li><li>`Bash(node .claude/hooks/pt-land.js abandon *)`</li><li>`Edit(./qa/guard_integrity_check.js)`</li><li>`Edit(./.claude/skills/**)`</li><li>`Edit(./.claude/commands/**)`</li><li>`Edit(./.claude/agents/**)`</li></ul> |

**AH-8:**
- `WR1_ALLOW_ADDED` (7) and `WR1_ASK_ADDED` (6).
- Totals at `b2393b6`: allow **54 → 61**, ask **43 → 49**, deny **50 → 50**.
- New planted negatives: any WR1 entry missing; `record-land *` or `abandon *` in allow; **`resync *` in allow**; `git add *` in allow; `log *` in ask.

**Hook `R12_FORM_RE` adds:** `record-land-request task/…`, `record-land task/…`, `abandon-request task/…`, `abandon task/…`, `log`, `log task/…`.

### 2.8 Other code

- R11 / G1 accept only `A.`: remove `M.` in the hook's brief-commit gate and the land tool's G1 (Q-10).
- Main dispatch, usage text and exports cover the five new verbs.

### 2.8a Git subcommand constraint (r2, PRC finding)

- The new land-tool code may invoke **only** Git subcommands that `qa/lib/git-fake.js` already classifies:
  - **read-only:** `rev-parse`, `status`, `log` (incl. `log -g` for the reflog), `rev-list`, `cat-file`, `show`, `ls-files`, `ls-tree`, `for-each-ref`, `show-ref`, `merge-base`, `diff`, `diff-tree`, `patch-id`, `worktree list`, `symbolic-ref`, `hash-object` without `-w`, the config read flags;
  - plus the mutating ones the tool already uses.
- **Why:** GC-2 requires every subcommand in every recorded transcript to be classified, and `qa/lib/git-fake.js` is not in this task's file set.
- Reading the reflog directly from `.git/logs/…` (as the r4 reference does) also satisfies it.
- **A design that needs another subcommand → STOP-1** (new brief id).

### 2.9 `AGENTS.md` (13a candidate)

1. **Three-stage step 13:**
   - 13-pre;
   - 13a;
   - forced replay + pin commit;
   - **step 10 on the final implementation tree**;
   - 13-final docs commit;
   - integrity;
   - 14.

   "The same commit as any final implementation touch-ups" becomes "the last commit before land-request", including in the fingerprint-pairing rule.
2. **L9:** v1 / v2, the cutoff = `history[0].to`, "never names itself", the checker's legacy / verdict modes.
3. **STOP-6 classes:** `[class=stop]` → STOP-6; `[class=mention]` → record it and continue once with the named form; the cap of 3 is advisory.
4. Reconcile :258 / :269 (`ask` is not a boundary). Tier table: Edit / Write protection is settings-tier; the hook covers shell writers.
5. **Heavy-lane clearance (kept):** Bootstrap grants it; `HEAVY-LANE: cleared by Bootstrap <ISO>` in `qa.log` before each full or forced run; one heavy run across slots. Baseline reuse is removed.
6. **Verbs table:** 17 verbs, forms and `VERB_POLICY` tier. `!` kinds add `record-land` and `abandon`.
7. **Lifecycle:**
   - mode-P resync with the printed steps;
   - record-land (strict); abandon;
   - retired ids + archive markers;
   - "record open" = `pt-task/<enc>.json` outside `archive/`, valid or invalid;
   - the stuck-task table;
   - **the exception-LAND open-record preflight (§7 verbatim)**;
   - protected-task serialisation;
   - manual disposition (§6);
   - **post-13a protected fixes = rollback + new id (§4.1).**
8. **K3 wording:** the tip is an ancestor of `branch-dev` and `origin/branch-dev`; no audit line is read.
9. Codex prompts and file names say "the land tool"; its log is read with Read / Grep or `log`.

<!-- pep-lint:on -->

## 3. QA requirements

### 3.1 Assertion preservation (B-2)

**Every modified existing suite keeps every existing assertion, test input and planted negative,** except the explicit permitted deltas below.

| ID | Check | Tool / evidence |
|---|---|---|
| AP-1 | Every base row label (`check` / `heavy` / `test` / `expectAll` / `denyAll`, templates normalised) is still present | `_held-briefs/governance/workflow-repair-1-r2/evidence/ap/assertion-inventory.js --compare` against `base-assertion-inventory.d9d0dd3.json` + `permitted-deltas.json` |
| AP-2 | Every base mutant (`mutantCatches*`) is still present, and its anchor-text hash is unchanged unless listed | same |
| AP-3 | Every base test-input string in a top-level `const NAME = [...]` array is still present unless listed | same |
| AP-4 | Every base row still **passes** at the candidate (step 3, step 10) | suite runs |
| AP-5 | Base counts (`d9d0dd3`): <ul><li>`pt_land_offline` 66 rows</li><li>`pt_land_resync_offline` 16</li><li>`task_base_offline` 24</li><li>`auto_mode_hardening_offline` 407 rows / 128 mutants / 76 arrays</li><li>`land_evidence_check_offline` 25</li><li>`fixture_template_offline` 19</li><li>`git_contract_offline` 34 rows / 2 arrays</li></ul> Candidate counts are ≥ these, minus the PD removals | the inventory output in `qa.log` |
| **AP-6 (Y-1, diff-based)** | **Removed-line audit, all seven modified suites:** `git diff -U0 <task base> <tip> -- <suite>` (`--no-color --no-ext-diff --no-textconv`). <ul><li>Every `-` line (trimmed) must match a permitted `removedLines` entry `{text, count}` for that suite; **each entry is consumed at most `count` times** (all `count: 1`).</li><li>**AP-6b:** an **added** line that opens dead code (`if (false\|0\|!1\|!true\|null\|undefined\|void 0)`, `while (false\|0)`, an unclosed `/*`, a bare `return;`) fails unless listed in `addedDeadCodeOk` (empty).</li><li>The rev3 set-based comparison is withdrawn.</li></ul> | `assertion-inventory.js --ap6 permitted-deltas.json --repo <root> <base> <tip> <suites…>`; self-test mode `--files`; `evidence/ap-selftest.sh` / `.out` |

**AP planted negatives (`evidence/ap-selftest.out`):**

| Case | Edit | AP-1…3 | AP-6 |
|---|---|---|---|
| C0 | none | PASS | PASS |
| BS-1 | an `assert` line deleted, labels unchanged | PASS | **FAIL** (removed line) |
| BS-2 | a `check` predicate weakened, label unchanged | PASS | **FAIL** |
| BS-3 | an inline `push(...)` input removed | PASS | **FAIL** |
| **DC-1** | **Bootstrap's demonstrated bypass:** a unique assertion deleted and re-added elsewhere inside `if (false) { … }`. The rev3 set-based tool reports `AP PASS` (shown in the same output) | PASS | **FAIL** (removed line + dead-code opener) |
| DC-2 | an assertion wrapped **in place** in `if (false) { }` (additions only) | PASS | **FAIL** (AP-6b) |
| DC-3 | an assertion commented out | PASS | **FAIL** |
| P1 | the PD-A1 edit (permitted lines, count 1 each) | PASS | PASS |
| P2 | the PD-A6 pin edit | PASS | PASS |
| **CNT-1** | a line permitted once (test PD) removed at both of its 2 occurrences | PASS | **FAIL** (permitted count exceeded) |
| N1 | an unlisted row renamed | **FAIL** | **FAIL** |

`--repo` mode was also run read-only on the real repo: `b2393b6..b2393b6` → PASS; `7888fa5..b2393b6` over the unchanged suites → PASS.

**`removedLines` scope:**
- auto_mode_hardening: the 23 rev4 lines (PD-A1…A6), each `count: 1`.
- **PD-PIN (r2):** exactly the inner lines of each other pinned suite's `*_CONTRACT_PIN` block — `pt_land_offline` 226–227, `pt_land_resync_offline` 258–259, `task_base_offline` 282–283, `fixture_template_offline` 227–230, `git_contract_offline` 397–399 — each `count: 1`.
- `land_evidence_check_offline`: `[]`.
- Any other removed or edited line → STOP-1.
- `--files` self-tests: rev4's `ap-selftest.out` (same tool) and r2's `evidence/ap/ap-r2-pin-selftest.out`: pin edits → PASS; a deleted GC-4 assertion → FAIL.

**Permitted-delta inventory (complete; `permitted-deltas.json`):**

| PD | Suite | Delta | Reason | Replacement that must exist |
|---|---|---|---|---|
| PD-A1 | AH | row `check: AH-19-2 valid amendment: one M. entry -> allow` removed | Q-10: R11 accepts only `A.` | row `AH-19-2 amendment: one M. entry -> deny (Q-10)` |
| PD-A2 | AH | mutant `R11 XY tier widened (D. accepted)`: anchor text changes | the `entry.xy` predicate becomes `A.`-only | the same label; the mutant re-accepts `M.` and must be caught |
| PD-A3 | AH | mutant `R12 trigger dropped (the whole gate is skipped)`: anchor text changes | the trigger now reads the commit-exemption text | the same label; dropping the trigger must be caught |
| PD-A4 | AH | mutant `protected staged pattern made nested-equivalent (root-relative semantics broadened)`: anchor changes; `STAGED_ALLOW` item `.claude/notes.md` removed | staged-deny = the full table (`^\.claude\/`) | the same label; `.claude/notes.md` appears in `STAGED_DENY` |
| PD-A5 | AH (body only, no AP-visible change) | the AH-24 / AH-25 / AH-26 differential bodies first substitute the WR-1 `R12_FORM_RE` line by the post-ATB line (`WR1_POST_LINE` → `ATB_POST_LINE`), as earlier tasks did | the on-disk regex line changes | labels and asserted decision sets unchanged; **new AH-30 differential:** WR-1 vs ATB differ only on the allow forms of the five new verbs |
| PD-A6 | AH (constants) | `EXPECT_ALLOW` / `EXPECT_ASK_R11` gain `WR1_*`; `AH_CONTRACT_PIN` values | §2.7; the pin commit | AH-8 rows pass |
| PD-PIN | LAND / RESYNC / TB / TEMPLATE / GIT_CONTRACT suites | the inner lines of the `*_CONTRACT_PIN` block (comment, `source`, `environments`) | §4 step 7d | the suite's SKIP line at step 8 |

**`removedLines` per PD** (base `b2393b6` = `d9d0dd3` line numbers for AH; exact text in `permitted-deltas.json`):

| PD | Lines |
|---|---|
| PD-A1 | 2540, 2543, 2544 |
| PD-A2 | 2778, 2779 |
| PD-A3 | 3156 |
| PD-A4 | 1707, 1708 (mutant); 1221, 1222 (`STAGED_DENY`); 1223, 1224 (`STAGED_ALLOW`) |
| PD-A5 | 3078, 3132, 3228, 3277, 3351, 3354 — the `ATB_POST_LINE` references; now AP-6-checked, so no longer review-only |
| PD-A6 | 92, 93 (pin); 1845, 1846 (`EXPECT_ALLOW`); 1866 (`EXPECT_ASK_R11`) |

Anything else that AP reports → **STOP-1**.

### 3.2 Requirement → assertion → planted negative (B-3)

<!-- pep-lint:off -->
<!-- (§3.2 quotes denied command forms as test inputs) -->

Real verbs; real git fixtures under `os.tmpdir()`. **Every row has a planted negative that must flip it.**

| Req | Suite § | Assertion (real) | Planted negative |
|---|---|---|---|
| RL-1 | PL-RL | missing / stale / mismatched (task, from, to) Owner line → refuse; consumed after success and after a refusal | owner-line binding ignores `to` |
| RL-2 | PL-RL | two-move ff → refuse; merge in range → refuse; one ff → pass | latest-entry check skipped |
| RL-3 | PL-RL | no open record / archived → refuse; `to` ≠ tip → refuse | record check removed |
| RL-4 | PL-RL | branch-dev moved after the ff → refuse; **back-fill of an older move → refuse** | current-tip check removed |
| RL-5 | PL-RL | the audit line has exactly the RL-5 fields and `mode:"record-land"` | `mode` field omitted |
| RL-6 | PL-RL | run from a Worker slot → refuse | caller-kind check removed |
| RL-7 | PL-RL | lock held → refuse; branch-dev moves between preflight and lock → refuse; lock released | re-check under lock removed |
| RL-8 | PL-RL | a second record-land for the task → refuse | duplicate check removed |
| RL-9 | PL-RL | a broken open record blocks; after abandoning it → pass | open-record loop skipped |
| RL-10 | PL-RL | audit not writable → refuse; log byte-identical | append made best-effort |
| RL-11 | PL-RL | refuse each of: L8 outside scope (score-boost shape), L8 unapproved protected, L9 missing, L6 brief edited; a non-content case passes | RL-11 skipped |
| RL-12 | PL-RL | origin behind / == from / == to → pass; diverged → refuse | origin check removed |
| RL-13 | PL-RL | record base ≠ from → refuse | base check removed |
| AB-1 | PL-AB | missing / mismatched (task, sha256, tip) line → refuse; single-use | sha256 binding ignored |
| AB-2 | PL-AB | landed tip → refuse | ancestry check removed |
| AB-3 | PL-AB | branch checked out in a worktree → refuse | worktree check removed |
| AB-4 | PL-AB | archive name matches the marker regex; branch, evidence and audit lines intact | archive renamed without the timestamp |
| AB-5 | TB-R | **Id reuse:** `task-start`, `adopt-request` and `adopt` refuse an id with `land ok` → `RETIRED: ID USED (land ok)`, and an id with `review.md` on branch-dev → `RETIRED: ID USED (review.md)`; a fresh id passes | the id-used check removed → the `land ok` row passes |
| AB-6 | PL-AB | audit append fails → the record is restored, no ABANDONED file | restore removed |
| AB-7 | — | superseded by RT-1 / RT-2 below (prefix `RETIRED:`) | — |
| AB-8 | PL-AB | no record → refuse; an invalid record → abandon succeeds | invalid records rejected |
| AB-9 | PL-AB | another open record's integrity verdict is identical before and after | n/a (control) + abandon writes to the other record (planted) |
| **RT-0** | TB-RT | `retiredState` on a fixture matrix: each marker suffix (`ABANDONED` / `ABORTED` / `ROLLEDBACK` / a plain cleanup archive) and each audit state (`abandon ok`, `cleanup ok`) → the right state, in the right precedence; `land ok` only → `null`; the near-miss id `<id>.b` next to `<id>.<ts>.ABORTED.json` → `null` | the marker regex widened to a prefix → the near-miss row flips; `land ok` counted as retired → the land-ok row flips |
| **RT-1 neg** | PL-RT (real verbs) | **For each of the 4 retired states × each verb** — integrity `--task`, `land-request`, `land`, `protected-request`, `protected-commit`, `resync`, `cleanup`, `task-start`, `adopt-request`, `adopt`, `record-land-request`, `record-land`, `abandon-request`, `abandon` → the refusal text starts `RETIRED: <STATE>`; refs, records, approval files and the slot are byte-identical; only a refuse audit line is appended | each verb's guard removed in turn → that verb's rows flip; integrity returning the generic usage refusal → the integrity rows flip |
| **RT-1 pos** | PL-RT | positive controls: <ul><li>a live recorded id passes the guard in every verb (the verb then proceeds to its own checks);</li><li>a landed, not yet cleaned id (`land ok` only) can still `push` and `cleanup`;</li><li>`push-request` is unaffected by any retired id;</li><li>`log` lists a retired id with its state and exits 0</li></ul> | `land ok` treated as retired → the cleanup-after-land row flips |
| **RT-2** | PL-RT | a retired id with **no record and a kept branch** cannot `land-request` / `land`, `resync`, `protected-request` or `cleanup` through the record-less legacy path → `RETIRED:` | the guard placed after the legacy branch → the record-less rows pass |
| **RT-PAR** | WL-RT | the land tool's and the integrity module's `retiredState` give identical results over the full RT-0 matrix | one implementation changed → the parity row flips |
| RP-1 | RS-P | slot dirty → refuse; nothing changed | R1 skipped in mode P |
| RP-2 | RS-P | a dropped commit touching a non-target → refuse `R2-P` | the check removed |
| RP-3 | RS-P | a non-dropped commit touching a protected path → refuse `R2-P` | the check removed |
| RP-4 | RS-P | REUSE-CONTENT and REGENERATE fixtures report the right action and blobs | the comparison inverted |
| RP-5 | RS-P | REGENERATE + the stale approved blob → protected-request refuses; the diff vs new-base is shown | the stale check removed |
| RP-6 | RS-P | after mode P, land-request refuses L8 until a fresh 13a; passes after | approval reuse planted |
| RP-7 | RS-P | after mode P, the old v2 L9 line → refuse; new tested + docs → pass | the L9 ancestry check removed |
| RP-8 | RS-P | an overlapping target change is never auto-merged (REGENERATE reported, no merge commit) | auto-merge planted |
| RP-9 | RS-P | conflict → refuse; task ref, slot and branch-dev untouched; temporary worktree gone | cleanup of the temporary worktree removed |
| RP-10 | RS-P | R4-P: count, patch-id, target leak, file set each refuse; the clean case passes; old R4 refuses the mode-P replay | R4-P replaced by R4 |
| RP-11 | TB-R | a record with history mode `P` → valid; round trip write → `loadTaskRecord` | predicate without `P` |
| RP-print | RS-P | the CLI prints exactly the §2.3 mode-P text | text changed |
| RP-audit | RS-P | the audit line has the §2.3 fields | a field omitted |
| RP-cleanup | RS-P | cleanup after a mode-P task: K3 PASS, the id retired | — (scenario) + K3 bypass planted |
| VP-1 | PL-VP | dispatch set == hook-form set (17) | a verb added to dispatch only |
| VP-2 | PL-VP + AH-8 | `VERB_POLICY` covers each verb once; settings tiers == policy; **`resync` has no allow entry** | `resync *` added to allow |
| VP-3 | PL-VP | the AGENTS.md verbs table == the dispatch set | a table row dropped |
| VP-4 | PL-VP | each AGENTS.md form matches `R12_FORM_RE` | a form typo |
| T-4 | AH-28 | the 64-row classifier corpus as AH rows (deny + expected tag; exempt commit not R12-denied); commit-gate interaction rows | pipe allowed as mention; option prefix matching |
| T-6 | AH-29 | protection parity (hook write-guard / staged-deny == integrity C6 == table; settings Edit tiers); the integrity blob check refuses a mismatch; AH-8 totals 61 / 49 / 50 | the integrity file dropped from staged-deny; the Edit ask removed |
| T-7 | LE + PL-L9 | v2 rows (r3 A-semantics); v1 cutoff before / after; **cutoff == `history[0].to` after a resync moved `base`**; **checker `MODE: legacy` against the `b2393b6` tool text == old L9**; `MODE: verdict` == new L9 on every row | the checker hard-codes a regex; cutoff read from `base` |
| T-8 | WL-1 | every historical audit line shape + the new lines parse; historical chain verdicts unchanged | a reader throws on an unknown field |
| T-9 | WL-2 | end-to-end clone scenarios (r1 list) | each stage's guard removed in turn |
| **T-9b (X-6; aligned with RT, Y-2)** | WL-3 | **Post-13a abort → retry, real verbs on a fixture.** <ol><li>Task `task/wr-x` makes a protected-commit (approved fixture target); its branch is **kept**.</li><li>The test applies the §6 D disposition exactly: move the record to `archive/wr-x.<UTC>.ABORTED.json`, no audit line.</li></ol> Assert, each exactly as RT-1 / RT-2 require: <ul><li>`task-start task/wr-x` → `RETIRED: ABORTED`;</li><li>`protected-request task/wr-x` → `RETIRED: ABORTED`;</li><li>`land-request task/wr-x` → `RETIRED: ABORTED` (the record-less legacy path is not reached);</li><li>`resync task/wr-x` → `RETIRED: ABORTED`;</li><li>integrity `--task task/wr-x` → `ok:false` with `RETIRED: ABORTED`, never PASS;</li><li>`task-start task/wr-x-r2` (fresh brief) → PASS;</li><li>the audit log is byte-identical except for the refuse lines the verbs append</li></ul> | the RT guard removed from `land-request` → the kept-branch row reaches the legacy path; the marker check removed → `task-start task/wr-x` passes |
| — | (procedure) | **"No second 13a in this task" (§4.1)** stays a documented brief rule. The tool does not refuse a second protected-commit; T-9b tests the recovery path that the rule requires | — |
| **LOG-1 (X-2; strengthened Y-4)** | PL-LOG | real fixture: <ul><li>`log` prints every audit line + the open-record list with validity and RETIRED states; `log task/<id>` prints only that task's lines; exit 0; `log extra` → exit 3.</li><li>**Run from a slot cwd** (the slot of a live task) as well as from canonical: identical output.</li><li>Directory tree (incl. the slot), audit log, records and refs are byte-identical before and after; no lock file is created.</li><li>**Approval-record confidentiality:** with every approval-record file present in the common dir — `pt-land-approval`, `pt-push-approval`, `pt-brief-approval`, `pt-protected-approval`, `pt-adopt-approval`, `pt-record-land-approval`, `pt-abandon-approval` — each holding a unique sentinel string, **no sentinel and no approval-record payload appears in stdout or stderr** (canonical and slot runs), and each file is byte-identical and still present afterwards</li></ul> | `log` creates the lock file → the no-lock row flips; `log` prints the common dir's files → a sentinel row flips; `log` refuses from a slot cwd → the slot row flips |
| **LOG-2 (X-2)** | AH-30 | hook: `node .claude/hooks/pt-land.js log` and `… log task/x` allowed (slot and canonical cwd); `log task/x extra`, `log;`, `log \| cat`, an env prefix → deny | `log` alternative widened to `log.*` → a deny row flips |
| **SK-1 (X-2)** | PL-SK + AH-29 | **Protected `.claude/skills/**`, `commands/**`, `agents/**` on real fixtures:** <ul><li>hook write-guard denies Edit / Write and shell writers to `.claude/skills/x/SKILL.md`, `.claude/commands/x.md` and `.claude/agents/x.md` from a slot;</li><li>staged-deny refuses committing them in a slot;</li><li>L8: without a `protected-scope` entry → refuse; with the entry + 13a → land-request passes;</li><li>`protected-request` accepts them as targets (approvable);</li><li>settings `ask Edit` present for all three</li></ul> | `.claude/agents/` dropped from `PROTECTED_TARGET_RES` → the approvable row flips; dropped from the hook write-guard → the deny row flips |
| **CL-MUT (X-2)** | AH-28 | **mention → allow mutation:** a `mutantCatches` that changes the classifier's mention branch to return `allow` must be caught. Every `mention` corpus row asserts `decision === 'deny'` | the mutant itself; it must be caught |
| **CM-MUT (X-2)** | AH-28 | **widened commit-message exemption:** `mutantCatches` variants must each be caught. <ul><li>(a) double quotes accepted: `git commit -m "x pt-land"`;</li><li>(b) a second `-m` accepted;</li><li>(c) the trailing anchor `$` dropped: `git commit -m 'x' && node .claude/hooks/pt-land.js land task/y`;</li><li>(d) control characters accepted: a message with a newline</li></ul> | the mutants themselves; each must be caught |
| **CK-SE (X-2, X-4; strengthened Y-5)** | LE-V | **Checker load and call side effects, real fixture:** <ul><li>the canonical tool copy with the exact export line placed **after** the `module.exports = {…}` assignment → `MODE: verdict`, `typeof landEvidenceVerdict === 'function'` after `require`, zero calls to every §2.4 instrumented family during `require`, only allow-listed read-only git during the call;</li><li>**one planted tool per instrumented family**, each doing that call at top level: sync write; `fs.promises` write; callback write; `createWriteStream`; `writeSync` via `openSync`; `truncate`; `symlink`; `chmod`; `rename` / `unlink` / `rm`; `child_process` spawn; `worker_threads.Worker`; `net.connect`; `http.request`; `https.get`; `tls.connect`; `dgram.createSocket`; `dns.lookup`; global `fetch`. Each → `NOT READY: side effect during evidence check`, **and the side effect did not happen** (no file, no mode or link change, no child, no socket attempt reaches the OS);</li><li>the export line **before** the `module.exports = {…}` assignment → `NOT READY: export overwritten`;</li><li>the export assigning a non-function → `NOT READY: export is not a function`;</li><li>an export only in a comment or as an object member → `MODE: legacy`;</li><li>two export lines → `NOT READY: ambiguous export`</li></ul> | each family's stub removed in turn → its planted row passes; the ordering check removed → the before-assignment row reaches verdict mode; the `typeof` check removed → the non-function row passes |
| **TR-1 (r2)** | WL / host run | after the step-7a re-recording on the Worker host: the recorder ends `153 scenario(s) recorded, 0 failed`; `pt_land_logic_offline` and `pt_land_resync_logic_offline` PASS with the new transcripts and the new land tool | stale transcripts (any one reverted to the base file) → the logic suites must FAIL `UNSCRIPTED_GIT` (shown in the sandbox spike: 15/103) |
| **PIN-1 (r2)** | step 8 (`qa:offline`) | all six pinned suites print `SKIP (contract pinned: …)` with the new pins; none prints `re-pin required` | one pin reverted to its base value → that suite must fail `re-pin required` |

<!-- pep-lint:on -->

### 3.3 Substitute evidence for Linux-masked suites (OD-1)

COWORK's sandbox perturbation (`evidence/prc/perturbation.json`) cannot observe suites that already fail at base on Linux. For the affected ones the PRC relies on the following substitute evidence. **It is NOT equivalent to a Windows host run.** The host runs in §4 steps 7a–8 remain the only proof.

| Suite | Why masked on Linux | Substitute evidence (COWORK) | Host proof (Worker) |
|---|---|---|---|
| `qa/git_contract_offline.js` (`GIT_CONTRACT_PIN`) | the recorded transcripts encode Windows paths; GC-4 mismatches real Git on Linux at base | static inventory: its declared source parts include the land tool, integrity, the land / resync fixture builders and all 21 transcripts (PRC-4 / PRC-5) | step 7c batched replay + OD-5 approval; step 8 SKIP |
| `qa/pt_land_logic_offline.js` | Windows path tokens (`<canon:bs>`) in the transcripts | spike: on a CRLF sandbox clone, one added Git read changed 7 of 21 transcripts; stale transcripts → FAIL 15/103; re-recorded → PASS 103/103; recorder unchanged (`evidence/spike/`) | step 7a re-record + PASS; step 8 |
| `qa/pt_land_resync_logic_offline.js` | same | same spike: PASS 33/33 with re-recorded transcripts | step 7a; step 8 |

## 4. Slices and ordering

<!-- pep-lint:off -->
<!-- (steps 13-16 use forms that exist only after this task's LAND; protected-commit prompts today) -->

| Step | Who | Action |
|---|---|---|
| 0 | Worker | **Readiness lock:** `git diff --name-only d9d0dd3 HEAD` lists only `work/workflow-repair-1-r2/brief.md` (else HOLD). Then heavy-lane → full `npm run qa:offline` (`qa.log` line 1). `/plan` → `plan.md` (CLAUDE.md checklist). **AP baseline:** copy `assertion-inventory.js`, `base-assertion-inventory.d9d0dd3.json`, `permitted-deltas.json` (sha256 as in the package) to `/tmp/pt-workflow-repair-1-r2/` |
| 1 | Worker | **S1, ordinary:** integrity, checker, suites (T-rows RED against the current tool / hook). **Expected outcome (C-1):** <ul><li>the new rows are RED against the current tool / hook, by design;</li><li>every pre-existing row passes;</li><li>a pinned suite whose source changed may also print the expected `re-pin required: source <64> environment <64>` line. That line is acceptable at this intermediate step and is not a failure.</li></ul> Any other failure → STOP. Full GREEN is not expected until step 8 |
| 2 | Worker | **S2 candidates:** flat LF files under `<os.tmpdir()>/pt-workflow-repair-1-r2/protected/` + `manifest.json`, with these **exact flat names** (none contains the land tool's name or a protected basename, so no R12 / write-guard denial): `cand-land-tool.js` → `.claude/hooks/pt-land.js`; `cand-guard-hook.js` → `.claude/hooks/pretooluse-guard.js`; `cand-settings.json` → `.claude/settings.json`; `cand-agents.md` → `AGENTS.md` |
| 3 | Worker | **Candidate proving** (heavy-lane): `PT_LAND_TOOL_PATH` / `AH_HOOK_PATH` / `AH_SETTINGS_PATH` → all GREEN; against the current files the new rows are RED. **AP-1…AP-5 PASS** (record the output). **"GREEN" at this step (C-1):** <ul><li>every test row passes;</li><li>a pinned suite is GREEN here when its only failure is the expected `re-pin required: source <64> environment <64>` line, because its source digest has changed and pins are re-set only in 7b–7d.</li></ul> Any other failure → FIX before 13a. **Full GREEN after re-pinning is unchanged:** at step 8, all six pinned suites print `SKIP (contract pinned: …)` and none prints `re-pin required` (PIN-1) |
| 4 | Worker | Codex on the S1 diff + candidates (§10). Classify; FIX before 13a |
| 5 | Worker | **13-pre commit(s)** (r9) |
| 6 | Worker → Owner | **13a (E-5; A-12 closed by X-7):** <ol><li>protected-request. **Bootstrap confirmed** that it prints the approved **tree oid** `<T>`, each target's **blob oid** and each candidate's **sha256**, and that candidate-vs-HEAD diffs are available.</li><li>The Worker reports **before** any Owner record: <ul><li>those printed values, verbatim;</li><li>`sha256sum` of every flat candidate and the manifest, which must equal the printed sha256 values (any mismatch → STOP);</li><li>`git diff --stat HEAD <T>`;</li><li>the full `git diff HEAD <T>`;</li><li>the **Codex verdict on exactly that diff** (no unresolved Class I).</li></ul></li><li>Only then the **Owner PROTECTED record**.</li><li>protected-commit (prompts).</li><li>Verify each committed blob = the printed blob oid, and its content sha256 = the candidate sha256.</li></ol> |
| 7a | Worker | **Transcript re-recording** (heavy-lane; **on the Worker host only**: the transcripts encode Windows paths and CRLF anchors): `node qa/tools/record-git-transcripts.js` (post-13a, so it records the new land tool) → must end `153 scenario(s) recorded, 0 failed` → `node qa/pt_land_logic_offline.js` and `node qa/pt_land_resync_logic_offline.js` PASS → **transcripts commit** (r9; only `qa/fixtures/git-contract/*.json`) |
| 7b | Worker | **Five E1 forced replays**, one heavy-lane clearance each, sequential: `PT_QA_FORCE_HEAVY=1 node qa/<suite>.js` for `auto_mode_hardening_offline` (`AH_CONTRACT_PIN`), `pt_land_offline` (`LAND_CONTRACT_PIN`), `pt_land_resync_offline` (`RESYNC_CONTRACT_PIN`), `task_base_offline` (`TB_CONTRACT_PIN`), `fixture_template_offline` (`TEMPLATE_CONTRACT_PIN`). Each valid only if every row passes and the only failure is the expected `re-pin required: source <64> environment <64>` line; record the printed digests; independent source-digest recompute in scratch |
| 7c | Worker → Owner | **GC-4 batched real replay** (heavy-lane): `node qa/git_contract_offline.js` replays all 153 scenarios in 16 resumable batches of 10 (memory floor 2048 MB; state in `pt-work-artifacts/qa-stage2-git-contracts/`). Valid only when all 16 batches complete identical and the only failure is the re-pin line. **OD-5: the Owner approves the `GIT_CONTRACT_PIN` values from that completed replay** (one explicit line) before the pin commit |
| 7d | Worker | **One pin commit** (r9): pin-only edits of the six `*_CONTRACT_PIN` blocks (`AH_CONTRACT_PIN`, `LAND_CONTRACT_PIN`, `RESYNC_CONTRACT_PIN`, `TB_CONTRACT_PIN`, `TEMPLATE_CONTRACT_PIN`, `GIT_CONTRACT_PIN`) with the printed source / environment digests. AP-6 permits exactly those lines (PD-A6, PD-PIN) |
| 8 | Worker | heavy-lane → **step 10** full `npm run qa:offline` **on the pin commit** = the **tested commit**; count = step 0 + 1; **all six pinned suites print their SKIP (contract pinned) line**; both logic suites PASS. AP-4 |
| 9 | Worker | step 11 `review.md`, then step 12 final Codex. A Class I finding goes through §4.1 |
| 10 | Worker | **docs commit** (`review.md` only; separate from the tested commit, authorized as in §4.2): v1 L9 (`qa-offline=PASS <N>`); `Tested commit: <oid>`; the integrity hunk list; the replay / pin / AP evidence. Then `node qa/land_evidence_check.js --root <canonical> --task task/workflow-repair-1-r2` → `MODE: legacy`, READY |
| 11 | Bootstrap (canonical) | `git diff --name-only <tested> task/workflow-repair-1-r2` = `work/workflow-repair-1-r2/review.md` only; integrity (record form, old module); record `PRE_LAND_OID` / `WR1_TIP`; pre-fill the §6 commands |
| 12 | Bootstrap + Owner | land-request (**old tool**) → **Owner LAND** → land |
| 13 | Bootstrap (Manual) | V-checks: `node .claude/hooks/pt-land.js log`; a mention-tag denial; a skills Edit in a slot is denied / prompted; `node qa/pt_land_offline.js` PASS; sane push-request |
| 14 | Bootstrap + Owner | push-request → **Owner PUSH** → push |
| 15 | Worker | cleanup |
| 16 | Bootstrap + Owner | **P9:** abandon-request / **Owner ABANDON** / abandon `task/ai-output-1-s1` |
| 17 | Owner | **P10:** freeze lifted |

<!-- pep-lint:on -->

### 4.1 Fixes after 13a (B-1)

- **Protected-class fix.** Any needed change to a 13a path (land tool, hook, settings, AGENTS.md), **or** to `qa/guard_integrity_check.js` (which the new slot hook protects after 13a), means:
  - **STOP**;
  - **no second 13a in this task**;
  - rollback per §6 window **P3–P4** (`ABORTED`; retired id, enforced by RT-1);
  - restart as `task/workflow-repair-1-r3` with a new brief carrying the fix.
- **Ordinary-class FIX window (reconciled with SH-3).** One Class I FIX round is allowed after 13a and before the docs commit:
  - **paths ⊆** {`qa/pt_land_offline.js`, `qa/pt_land_resync_offline.js`, `qa/task_base_offline.js`, `qa/workflow_lifecycle_offline.js`, `qa/auto_mode_hardening_offline.js`, `qa/land_evidence_check.js`, `qa/land_evidence_check_offline.js`};
  - one r9 commit;
  - then **steps 7a–7d again in full** (a suite FIX can change the fixture builders that the transcripts, GC-4 and FT digest), then step 8 (new tested commit) and AP-1…AP-6 again;
  - then the one scoped Codex re-pass.

  A second FIX round, or any path outside that set → protected-class handling above.
- **SH-3 (amended):** the P4 window allows exactly steps 7a–10 **plus** this one ordinary FIX round. Anything else, or any denial → STOP-6 → §6.

### 4.2 Separate docs commit and the AGENTS.md wording conflict (C-2)

**The conflict.** `AGENTS.md` at the baseline (blob `39597f56…`) says:
- `review.md` is committed "in the same commit as any final implementation touch-ups";
- "a task's final commit includes `work/<id>/review.md`";
- the governed commit shape is "a final implementation + `review.md` commit".

This task's step 10 instead makes a **separate docs commit** (`review.md` only) after the tested commit (step 8). The reason is that the L9 line names the tested commit and can never name the commit that adds it (§2.4). The §2.9 item 1 candidate changes this wording for future tasks. It does not govern this task before LAND.

**Precedent: score-boost-removal-1** (on `branch-dev` and `origin/branch-dev`).

| Commit | Content |
|---|---|
| `28677dc` | The last implementation commit: a pin fix plus `review.md`. It is the step-10 tested commit (`qa:offline` PASS 87) |
| `b2393b6` | A separate commit touching only `work/score-boost-removal-1/review.md`. It adds the `LAND-EVIDENCE: qa-offline=PASS 87; …` line and the step-10 result |

`b2393b6` was then landed and pushed. That terminal LAND stays **non-recordable and is never back-filled** (D8-A, RL-4); it is cited only as the commit-shape precedent.

**Resolution.** The Owner's approval of this exact brief (the R11 approval of its brief-only commit) **authorizes this task's step-10 separate docs commit** as the resolution of that `AGENTS.md` wording conflict, within these limits:
- **One commit, after the tested commit,** containing only `work/workflow-repair-1-r2/review.md`. A non-docs commit after the tested commit stays STOP (§9).
- **Nothing else is authorized.** It does not authorize starting the task, any execution step, or the commit itself outside its gate:
  - the docs commit still goes through the r9 Worker commit gate;
  - R11, task-start, PROTECTED, heavy-lane, OD-5, LAND, PUSH and ABANDON each keep their own Owner gate.
- **It does not amend `AGENTS.md`** and sets no standing rule for other tasks.

## 5. Self-hosting phase table

| Phase | Steps | Hook | Land tool | Integrity |
|---|---|---|---|---|
| P0 R11 / P1 task-start | — | old | old | — |
| P2 | 0–5 | old (slot) | old; candidates in tests only | slot ordinary copy (tests) |
| P3 13a | 6 | old | old | — |
| **P4** | **7a–10 (+ §4.1 FIX)** | **new** (slot) | slot copy refuses (self-integrity) | — |
| P5 LAND | 11–12 | old until the ff | **old** (Bootstrap, canonical) | **old** (L10) |
| P6 / P7 / P8 | 13–15 | new | new | new |
| P9 orphan abandon / P10 | 16–17 | new | new | — |

SH-1…SH-10 (r3 §4.6) apply, with SH-3 as amended in §4.1.

## 6. Rollback, backup and retired ids (C-4, E-2)

<!-- pep-lint:off -->
<!-- (Owner-terminal procedures; Git Bash) -->

All Owner-terminal steps start with **C0** (Y-3: the working directory is fixed first; every later path is absolute or relative to it):

    cd /c/Users/Owner/Documents/Project/portfolio-tracker

**Building blocks:**

- **B — backup** of records, audit log and refs:

      mkdir -p /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>
      cp -p .git/pt-task/*.json .git/pt-land-log /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/
      sha256sum .git/pt-task/*.json .git/pt-land-log > /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/SHA256SUMS.txt
      git rev-parse branch-dev origin/branch-dev main > /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/refs.txt

- **D — manual record disposition** (R4-D2; `<REASON>` = `ABORTED` or `ROLLEDBACK`):

      mv .git/pt-task/workflow-repair-1-r2.json .git/pt-task/archive/workflow-repair-1-r2.<UTC>.<REASON>.json
      sha256sum .git/pt-task/archive/workflow-repair-1-r2.<UTC>.<REASON>.json

  - The hash must equal the backup's line.
  - **No audit line is written.** The file name is the RT-0 marker, so every task verb then refuses the id with `RETIRED: ABORTED` / `RETIRED: ROLLEDBACK` (RT-1).
  - Board entry: reason, `PRE_LAND_OID` (P5+) or `BRANCH_DEV_OID` (P0–P4), `WR1_TIP`, UTC, and the backup path(s).

- **W — find the task slot:**

      git worktree list --porcelain

  `<x>` is the slot whose `branch` line is `refs/heads/task/workflow-repair-1-r2`.

- **E — back up the slot's task evidence, then remove an untracked `review.md`** (absolute paths):

      mkdir -p /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/slot-evidence
      cp -p /c/Users/Owner/Documents/Project/pt-wt-worker-<x>/work/workflow-repair-1-r2/* /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/slot-evidence/
      sha256sum /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/slot-evidence/* > /c/Users/Owner/Documents/Project/owner-local-backups/workflow-repair-1-r2-<UTC>/slot-evidence/SHA256SUMS.txt
      git -C /c/Users/Owner/Documents/Project/pt-wt-worker-<x> ls-files --error-unmatch work/workflow-repair-1-r2/review.md

  - **If** the last command fails (`review.md` untracked): `rm /c/Users/Owner/Documents/Project/pt-wt-worker-<x>/work/workflow-repair-1-r2/review.md`.
  - **If** it succeeds (tracked): leave it.
  - Any **other** untracked path in the slot → STOP. The Owner preserves it elsewhere first.

- **S — clean check:**

      git status --porcelain --untracked-files=all
      git -C /c/Users/Owner/Documents/Project/pt-wt-worker-a status --porcelain --untracked-files=all
      git -C /c/Users/Owner/Documents/Project/pt-wt-worker-b status --porcelain --untracked-files=all

  - **S-canon** is the first line only; **S-all** is all three.
  - The required lines must print nothing. Otherwise STOP; never stash or reset inside a slot.

**Per window:**

| Window | Order |
|---|---|
| **P0–P2** (before 13a; the slot holds only old-hook files and ordinary work) — **Y-3: the slot is not touched** | C0 · S-canon · B · `git rev-parse branch-dev` → the board as `BRANCH_DEV_OID` · D (`ABORTED`) · the Worker session ends. <ul><li>The slot is left exactly as it is (branch, work tree and evidence untouched).</li><li>The kept branch is retired by RT, so it can never be landed, resynced, approved or cleaned through the tool.</li><li>The slot is reused only through the retry's normal Bootstrap slot preparation.</li></ul> |
| **P3–P4** (after 13a; the slot holds the new hook / tool / settings files) | C0 · W · E · S-all · B · `git rev-parse branch-dev` → `BRANCH_DEV_OID` · D (`ABORTED`) · `git -C /c/Users/Owner/Documents/Project/pt-wt-worker-<x> switch --detach branch-dev` · `git -C /c/Users/Owner/Documents/Project/pt-wt-worker-<x> rev-parse HEAD` (= `BRANCH_DEV_OID`). The slot must not keep the new-hook files checked out; keep the branch |
| P5–P6 (landed, not pushed) | C0 · W · E · S-all · B · `git rev-parse branch-dev` (= `WR1_TIP`) · `git reset --hard <PRE_LAND_OID>` · `git rev-parse branch-dev` (= `PRE_LAND_OID`) · D (`ROLLEDBACK`) · detach the slot as in P3–P4 |
| P7–P9 (pushed) | C0 · S-all · B · `git revert --no-edit <PRE_LAND_OID>..<WR1_TIP>` → R12 push-request / Owner PUSH / push (old tool) or a terminal push → old-tool cleanup |
| **After P10 (E-2)** | **Condition: zero open records.** `ls .git/pt-task` must list only `archive`. If any `*.json` is listed, those tasks are completed (cleanup) or abandoned with the new tool **before** the revert. Then as P7–P9 |

**Retry id:** `task/workflow-repair-1-r3` (then `-r4`, …), each with a new brief. Every `ABORTED`, `ROLLEDBACK`, `ABANDONED` or cleaned-up id is retired. After a rollback to the old tool the markers are not tool-checked, so the written rule (R4-D3) applies.

<!-- pep-lint:on -->

## 7. Exception-LAND open-record preflight (C-6)

**Before any Owner-terminal exception LAND**, Bootstrap runs from the canonical checkout, read-only:

<!-- cmd:begin -->
ls .git/pt-task
node qa/guard_integrity_check.js --task task/<id> --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
<!-- cmd:end -->

The second command runs once per listed record.

**Proceed only if** `.git/pt-task` lists exactly `<stuck-id>.json` (plus `archive`). **Otherwise STOP;** the Owner chooses:
- wait for the other tasks to LAND and be cleaned up; or
- abandon them and restart them under new ids.

There is **no record-land** afterwards (D8-A). The listing output goes into the STOP report and onto the board. AGENTS.md carries this paragraph verbatim.

## 8. Command card, steps 0–10 (E-3)

All lines are allow-listed today; the pre-placement lint checks this. Items that prompt (**B**) or are gates (**C**) are listed under each block.

**Preflight (every session start):**

<!-- cmd:begin -->
git branch --show-current
git status --short --branch
git log --oneline -3
git log --oneline origin/main -1
git log --oneline origin/branch-dev -1
git diff --stat
git diff --cached --stat
<!-- cmd:end -->

**Step 0** (the first line is the readiness-lock check):

<!-- cmd:begin -->
git diff --name-only d9d0dd3 HEAD
node qa/guard_integrity_check.js --task task/workflow-repair-1-r2 --root C:/Users/Owner/Documents/Project/portfolio-tracker --print-record
ls -l --time-style=full-iso package-lock.json node_modules/.package-lock.json
npm run qa:offline
<!-- cmd:end -->

- **C:** heavy-lane clearance before `npm run qa:offline`.
- **B:** copying the three AP files from `_held-briefs` to `/tmp/pt-workflow-repair-1-r2/` (one batch).

**Steps 1, 3 — targeted suites:**

<!-- cmd:begin -->
node qa/pt_land_offline.js
node qa/pt_land_resync_offline.js
node qa/task_base_offline.js
node qa/land_evidence_check_offline.js
node qa/auto_mode_hardening_offline.js
node qa/workflow_lifecycle_offline.js
node qa/pt_land_logic_offline.js
node qa/pt_land_resync_logic_offline.js
node qa/run_isolation_offline.js
node qa/fixture_template_offline.js
node qa/git_contract_offline.js
<!-- cmd:end -->

- **B:** `PT_LAND_TOOL_PATH=<candidate> node qa/pt_land_offline.js`, `AH_HOOK_PATH=<candidate> node qa/auto_mode_hardening_offline.js`, `AH_SETTINGS_PATH=<candidate> node qa/auto_mode_hardening_offline.js` (env prefix).
- **B:** `node /tmp/pt-workflow-repair-1-r2/assertion-inventory.js --compare /tmp/pt-workflow-repair-1-r2/base-assertion-inventory.d9d0dd3.json /tmp/pt-workflow-repair-1-r2/permitted-deltas.json qa/pt_land_offline.js qa/pt_land_resync_offline.js qa/task_base_offline.js qa/auto_mode_hardening_offline.js qa/land_evidence_check_offline.js qa/fixture_template_offline.js qa/git_contract_offline.js` (scratch script).
- **B:** `node /tmp/pt-workflow-repair-1-r2/assertion-inventory.js --ap6 /tmp/pt-workflow-repair-1-r2/permitted-deltas.json --repo . <task base> HEAD qa/pt_land_offline.js qa/pt_land_resync_offline.js qa/task_base_offline.js qa/auto_mode_hardening_offline.js qa/land_evidence_check_offline.js qa/fixture_template_offline.js qa/git_contract_offline.js` (AP-6, diff-based; run from the slot, read-only git).
- **C:** heavy-lane clearance for step 3.

**Steps 4, 9 — Codex** (one single-quoted prompt; it says "the land tool", never its file name):

<!-- cmd:begin -->
codex exec --sandbox read-only <prompt>
<!-- cmd:end -->

**Steps 5, 7, 9, 10 — commits:**

<!-- cmd:begin -->
git status --short --branch
git diff --cached --stat
git commit -m <message>
git log -1 --format=%h%x20%aI
<!-- cmd:end -->

**B:** `git add <explicit in-scope paths>` (prompting retained; never `-A` or `.`).

**Step 6 — 13a (E-5):**

<!-- cmd:begin -->
node .claude/hooks/pt-land.js protected-request task/workflow-repair-1-r2
git diff --stat HEAD <tree>
git diff HEAD <tree>
sha256sum <protected-dir>/<flat-file>
<!-- cmd:end -->

- `<tree>` is the tree oid printed by protected-request.
- **C:** Codex verdict on that diff, then the Owner PROTECTED record.
- **B:** `node .claude/hooks/pt-land.js protected-commit task/workflow-repair-1-r2` (prompts today).

**Step 7a — transcripts** (**C:** heavy-lane):
- **B:** `node qa/tools/record-git-transcripts.js` (not allow-listed: one prompt).
- Then the two logic suites (block above, **A**) and the transcripts commit (the commit block).

**Step 7b — five forced replays** (**C:** heavy-lane each), all **B** (env prefix):
- `PT_QA_FORCE_HEAVY=1 node qa/auto_mode_hardening_offline.js`
- `PT_QA_FORCE_HEAVY=1 node qa/pt_land_offline.js`
- `PT_QA_FORCE_HEAVY=1 node qa/pt_land_resync_offline.js`
- `PT_QA_FORCE_HEAVY=1 node qa/task_base_offline.js`
- `PT_QA_FORCE_HEAVY=1 node qa/fixture_template_offline.js`

**Step 7c — GC-4:**
- `node qa/git_contract_offline.js` (block above, **A**; **C:** heavy-lane; **C:** OD-5 Owner approval of the pin values).

**Step 7d:**
- The six pin blocks are edited with the Edit tool; the scratch digest recompute is **B**; the commit uses the commit block.

**Step 8:**

<!-- cmd:begin -->
npm run qa:offline
git log -1 --format=%H
<!-- cmd:end -->

**C:** heavy-lane.

**Step 10:** after the docs commit, `node qa/land_evidence_check.js --root C:/Users/Owner/Documents/Project/portfolio-tracker --task task/workflow-repair-1-r2`. This is **B** under today's settings; it is allow-listed by this task's own settings after 13a.

## 9. STOP (in addition to STOP-1…6)

- Any path outside §1.
- A committed protected blob ≠ its candidate sha256.
- `qa/guard_integrity_check.js` in `protected-scope`.
- An Owner PROTECTED record requested without the step-6 diff / hashes / Codex report.
- Any protected-class fix after 13a (→ §4.1 rollback + new id).
- A second post-13a FIX round.
- The step-0 readiness-lock check listing anything besides this brief.
- Transcripts recorded anywhere but the Worker host, or the recorder reporting any failed scenario.
- A GC-4 memory-floor STOP or batch mismatch that does not resolve on resume.
- A `GIT_CONTRACT_PIN` edit without the Owner's OD-5 approval line.
- At step 8, any of the six pinned suites not printing its SKIP line, or either logic suite failing.
- A flat candidate name other than the four in step 2.
- GC-2 failing on an unclassified Git subcommand in the re-recorded transcripts (§2.8a).
- AP FAIL (AP-1…AP-6), or any delta not in `permitted-deltas.json`.
- A step-6 `sha256sum` that differs from the value protected-request printed.
- The evidence checker reporting `NOT READY: side effect …` or `ambiguous export`.
- Any T / RL / AB / RP / VP row without its planted negative flipping.
- Proving not RED on the current files, or not GREEN on the candidates (GREEN as defined at step 3, C-1).
- The forced replay not valid.
- Step 10 not on the pin commit.
- A non-docs commit after the tested commit.
- Two heavy runs at once.
- Any audit-log edit; any record file written outside the tool except §6 D by the Owner.
- Any back-fill.
- A run-offline discovery change needing `qa/run-offline.js` (STOP-1).
- `resync` or `git add` made allow-listed.

## 10. Mandatory review items (C-2)

Codex (steps 4, 6, 9) and the **Owner LAND review** cover, with the hunks listed in `review.md` and the STOP report:
1. **`qa/guard_integrity_check.js`, every hunk:** mode `P`, `retiredState` + the `RETIRED:` refusal (RT-0 / RT-1 / RT-3), C6 parity; no other `explainChain` change.
2. **The land tool:** RL-4 / RL-9 / RL-11 / RL-13, R4-P, `retiredState` in every task verb (RT-1 / RT-2) and AB-5 id reuse, the blob check, `VERB_POLICY`, R11 `A.` only, `landEvidenceVerdict`.
3. **The hook:** the classifier never allows; the exact commit exemption; the R12 forms; staged-deny / write-guard parity.
4. **Settings:** exactly the §2.7 delta.
5. **AGENTS.md:** §2.9 items 1–9.
6. **The AP output** (AP-1…AP-6) and every PD use.
7. **The evidence checker:** the exact export line and pattern; the throwing-stub instrumentation; the legacy path is byte-for-byte unchanged.

<!-- land-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
.claude/settings.json
AGENTS.md
qa/guard_integrity_check.js
qa/land_evidence_check.js
qa/land_evidence_check_offline.js
qa/pt_land_offline.js
qa/pt_land_resync_offline.js
qa/task_base_offline.js
qa/auto_mode_hardening_offline.js
qa/workflow_lifecycle_offline.js
qa/fixture_template_offline.js
qa/git_contract_offline.js
qa/fixtures/git-contract/cdx.json
qa/fixtures/git-contract/cleanup.json
qa/fixtures/git-contract/g1.json
qa/fixtures/git-contract/g2.json
qa/fixtures/git-contract/g3.json
qa/fixtures/git-contract/mutland.json
qa/fixtures/git-contract/mutrs.json
qa/fixtures/git-contract/pl10.json
qa/fixtures/git-contract/pl11.json
qa/fixtures/git-contract/pl13.json
qa/fixtures/git-contract/pl17.json
qa/fixtures/git-contract/pl18.json
qa/fixtures/git-contract/pl3.json
qa/fixtures/git-contract/pl6.json
qa/fixtures/git-contract/pl7.json
qa/fixtures/git-contract/pl8.json
qa/fixtures/git-contract/pl9.json
qa/fixtures/git-contract/rs10.json
qa/fixtures/git-contract/rs13.json
qa/fixtures/git-contract/rsa.json
qa/fixtures/git-contract/shape.json
<!-- land-scope:end -->
<!-- protected-scope:begin -->
.claude/hooks/pt-land.js
.claude/hooks/pretooluse-guard.js
.claude/settings.json
AGENTS.md
<!-- protected-scope:end -->
<!-- land-tests:begin -->
node qa/pt_land_offline.js
node qa/pt_land_resync_offline.js
node qa/task_base_offline.js
node qa/land_evidence_check_offline.js
node qa/auto_mode_hardening_offline.js
node qa/workflow_lifecycle_offline.js
node qa/instruction_layer_offline.js
node qa/run_offline_discovery_offline.js
node qa/git_contract_offline.js
node qa/fixture_template_offline.js
node qa/pt_land_logic_offline.js
node qa/pt_land_resync_logic_offline.js
node qa/run_isolation_offline.js
<!-- land-tests:end -->

**Skills:** `pt-offline-suite` Required. `/plan` mandatory.

**Rollback:** §6.
