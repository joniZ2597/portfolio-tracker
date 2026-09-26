# Review: DH-M1 — EOD readiness block + shared state wording

Base: `6748512` (branch-dev, brief-only commit) · Branch: `task/dh-readiness-block` · Worker A · uncommitted.

## Result

Implementation complete. `npm run qa:offline`: **PASS, 48 spawned suites** (pre-edit baseline: PASS, 48; count unchanged, 1 advisory warning both before and after). `qa/eod_packet_v0_offline.js`: PASS, 187 asserts. `qa/p5_step5_ui_offline.js`: PASS, 48 asserts. `p5_packet` 92, `p5_call1` 102, `p5_call2` 401: PASS unchanged. Raw output: `work/dh-readiness-block/qa.log`.

## What changed (behaviour)

- `_ts1ResolveMarket(tz, sym)` — the one market-identity rule, extracted verbatim from `_ts1FetchRawSeries`; both `_ts1FetchRawSeries` and `_pfLiveNormalize` call it. The timezone literal is now defined once.
- `_pfSessionDateFor(sessionEpoch, market)` — exchange-local `YYYY-MM-DD` from the provider timestamp and the resolved market's calendar `timeZone`; `null` if either is absent. `_pfLiveNormalize` returns `market · marketBasis · sessionDate`; `_pfEodCacheSet` writes them (whole-entry replace, success only). No migration, no backfill.
- `DH_DISPLAY` + `_dhLabel` — the single shared display table (verdict labels, state words, reason wording, `Refresh failed`, `Research recency: not evaluated`).
- `_eodComputeReadiness` (pure) → `packet.readiness` `{verdict, reasons[], dimensions{market, fx, positions, cash, reconciliation, research}}`; `_eodBuildPacket` calls it and emits `readiness` after `status`.
- `_eodReadinessLines` — one projection shared by `_eodPacketToMarkdown` (`## Readiness`, before `## Limitations`) and `_eodPacketToBriefing` (same section, before `## Limitations`).
- `NC_BRIEFING_VOCAB.marketStale` → `'the last refresh of market data failed'` (key names unchanged).
- D3 relabel at the two fetch-failure displays: `_p5RenderPacket` `' (stale)'` → `' (refresh failed)'`; portfolio card tag `'Stale'` → `'Refresh failed'`. `_pfEodIsStale` byte-unchanged (sha256 `251a554a…` pinned, 4 call/definition occurrences as at base). The research badge `'Stale'` (`:10103`, J7-driven) is untouched — DH-M2.

## NB-4 deliberate re-pin (extracted-source diff)

`_eodPacketToMarkdown` extracted source, base `6748512` → now. The complete change (`diff base new`):

```
7a8,10
>   lines.push('## Readiness');
>   _eodReadinessLines(packet.readiness).forEach(function(l) { lines.push(l); });
>   lines.push('');
```

Old pin `b7ea051d1b5c4d682424b5fdde6904cb012bf6577c48e9561b7a457682fc9c03` (kept in the QA file as the documented base); new pin `366f51e36c1fb5c174187ccfd76534e1e7ef4a370a0d92f71c4e16813ccd108b`. A second assertion proves the new pin genuinely differs from the old.

## Narrow P5 re-pin (Owner-approved addition to the file set)

`qa/p5_step5_ui_offline.js` compares every function in `VOCAB_PINNED_FNS` whole-source against commit `36bf497`. The brief's required D3 relabel edits one literal inside `_p5RenderPacket`, which made that pin fail (the brief's §5 expectation "only the literal changes, stays green" was not satisfiable without a QA edit → STOP-1/STOP-5 raised; Owner approved a narrow re-pin). Change, QA-only: for `_p5RenderPacket` alone, the pinned source has `(m.eodStale ? ' (stale)' : '')` replaced one-for-one by `(m.eodStale ? ' (refresh failed)' : '')` before comparing; two new asserts prove the pinned source carries the old literal exactly once and the working tree carries the new literal and not the old. No other pin relaxed; the vocabulary-set pins and the other pinned functions are unchanged.

## Readings taken where the brief was silent

1. Market per-symbol `missing` (no cache entry) is kept distinct from `unknown` (entry lacks valid market/basis/sessionDate, or `ageSessions` unresolvable); the legacy pre-change entry shape reads `unknown`, never `missing`.
2. Market rollup: no holding `current` → `not-representative`; some non-current → `degraded`. So the ruled first export after LAND (all legacy entries) reads `not-representative`.
3. FX: `aged-but-valid` → `degraded`; `missing`/`stale-invalid` with USD holdings → `not-representative`, without USD holdings → `degraded` (named).
4. Cash: `missing/invalid` → `not-representative` (totals depend on it); `old-user-maintained-state` → `degraded`, named, never forcing `not-representative`.
5. Positions: `needs-confirmation` symbols taken from the existing needs-attention `staleness` advisory; contributes `degraded` at most and never excludes a holding from a total.
6. Reconciliation: reported verbatim (`recon.status`) as a coherence signal with no verdict effect.
7. Research: coverage gap → `degraded` with symbols named; recency is `not-evaluated` and excluded from the verdict (brief D4c supersedes Amendment update U2/AC-U2, which would have named `unknown`).
8. A `current` verdict carries the reason `all-dimensions-within-band` so AC2 (no verdict without a reason) holds.
9. Market age is computed against `packet.asOf` (the injected instant as ISO) so the pure builder contains no `new Date(`; `asOf` and `nowMs` are the same instant in `_eodExportPacket`.
10. Display mapping: `aged-but-valid` and `stale-invalid` FX both display `Stale`, with the internal code shown in brackets in the Markdown; positions display the plain words `Needs confirmation` (no D2 word fits, and Amendment 2 forbids "stale" for positions).
11. New assertion labels are `RD-AC1…AC15`, `RD-N`-style N1–N5, `R-J7`, `R-U1`, `R-D3`, `RD-F*`, `RD-C1`, `RD-D2`, `RD-B1`, to avoid colliding with the EOD-v0 AC1–AC17 already in the file. AC16/AC17 (browser) are not asserted (DH-M3).
12. `_ts1FetchRawSeries` refactor: no QA suite references it or pins its region (grep of `qa/`), so equivalence is proven by an 11-case branch table pinned to base behaviour (RD-F2) plus the single-definition scan.

## Codex review

Independent read-only `codex exec -s read-only` run on the real implementation diff (base `6748512`, `work/` excluded), with brief, AGENTS.md, plan and QA log as inputs. Raw output verbatim in `work/dh-readiness-block/codex.md`. Result: **No findings — VERDICT: PASS.**

## Findings ledger (FIX / DEFER / REJECT)

Step-8 review: none. Final check (step 12) returned two class-II findings, no class-I: (1) assertion counts not substantiated in qa.log — FIX: the five targeted-suite runs with their assert counts are now appended to qa.log; (2) "two new asserts" said to be three — REJECT: the diff adds exactly two check() calls (grep count 2) and the suite went 46 -> 48 asserts; the pre-existing per-function pin check was only re-wired, not added. One Worker-found issue resolved before review: the QA harness first missed `_pfEodSaveCache` in its extraction list and tracked source-mutated planted-negative packets as production fixtures — both fixed in the QA file (FIX, self-found, QA re-run green).

## Fresh-context self-review

Re-read the brief and the whole diff against the requirement→test map. Confirmed: no new `*_DAYS`/`*_MS` constant (PF_* declared set pinned), no `fetchedAt` arithmetic in the readiness path, no J7 literal, no `limitations[]` change (12 base entries pinned as literals and still present), no `pt_*` write in packet build (write-spy), CRLF preserved in all three files. No change resulted.

## Files changed
- Implementation (3): index.html, qa/eod_packet_v0_offline.js, qa/p5_step5_ui_offline.js  — third file is the Owner-approved narrow P5 re-pin addition to the brief's file set
- Evidence (tracked): work/dh-readiness-block/brief.md, work/dh-readiness-block/review.md

## Lessons

- [rule] A brief that changes a literal inside a function must first grep `qa/` for suites that pin that function's whole source against an old commit (e.g. `qa/p5_step5_ui_offline.js` vs `36bf497`) and list them in its file set with the exact normalization; "must stay green" cannot hold for such a suite without a QA edit.
- [backlog] After LAND the first export reads market `unknown` (hence `not-representative`) for every holding until each is refreshed once — the pre-export warning (DH-M3) should explain this so it is not read as a defect.
- [covered] QA extractors that cut at the first `;` (`extractVarSource`) — checked: `TS1_POLICY_V1` contains no interior `;`; already visible in the extractor's own source.
- [local] Bash heredocs containing JS quotes broke the shell tool here; patch scripts were written with the file tool and applied with Node to preserve CRLF.

Final check: 1 rounds, 1 class-II finding fixed, 1 REJECT (reason above), self-checked; no implementation change, no QA re-run. VERDICT: PASS, no class-I findings.
