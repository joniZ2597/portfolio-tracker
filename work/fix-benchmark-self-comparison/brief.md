# Brief — Fix benchmark self-comparison scoring defect

Branch: `branch-dev` @ `20b4b31` (no separate worktree — small, single-branch fix).

## Problem

Relative-strength (RS) benchmark comparison logic computes a real numeric value even when the
holding symbol IS the benchmark (e.g. holding = QQQ, benchmark = QQQ). A series compared to
itself always returns an RS delta of exactly `0`, which is then treated as a valid, available
comparison rather than being excluded — so it contributes RS coverage/points in
`runTechScoreV1`'s scoring path and renders a misleading "IN LINE" label in the live Comparison
panel, instead of correctly reporting the benchmark as unavailable/not applicable.

## Root cause (two independent code paths compute RS the same way)

1. **SCORE-V1 gated scorer** (`window.PT_ENABLE_TECH_SCORE`, manual/console-only today):
   `_ts1RsValue(holding, bench, policy)` (~line 1743) has no self-comparison guard. Called
   from `_ts1BuildSnapshot` (~line 1830-1832) for all three benchmark slots (spy/qqq/sector).
   `runTechScoreV1` (~line 2142-2177) fetches `SPY`/`QQQ` unconditionally regardless of the
   requested symbol, so requesting `QQQ` or `SPY` itself produces a self-comparison benchmark.
   `scoreTickerTech` (~line 1984-2009) then treats a finite (but meaningless, always-zero)
   `rsSpy`/`rsQqq`/`rsSector` as available and awards RS component points for it.
2. **Live technical panel** (`computeTechnicalSnapshot`, ~line 1128, used in production —
   feeds the Comparison card render at ~line 7897-7920 and the AI prompt snapshot text via
   `buildTechSnapshotBlock`, ~line 1108): `rsSector`/`rsSPY`/`rsQQQ` (~line 1186-1188) are
   computed via `computeRelativePerf(tc, candles[etf|'SPY'|'QQQ'], LOOKBACK)` with no check for
   `sym === etf`, `sym === 'SPY'`, or `sym === 'QQQ'`.

Both paths already normalize symbols to trimmed-uppercase before comparison is possible
(`_ts1FetchRawSeries` line ~2084 uppercases; `computeTechnicalSnapshot` line ~1129/1138
uppercases `sym`/`etf`), so a plain `===` guard is sufficient — no case-folding needed at the
guard site itself.

## Implementation scope

- **`index.html`** — two small guard additions, no other logic changed:
  1. In `_ts1RsValue` (~line 1743-1745): return the existing null/no-value result immediately
     when `bench.symbol === holding.symbol`, before any of the existing continuity/pairing
     computation runs. This single shared function feeds all three benchmark slots
     (spy/qqq/sector) in the SCORE-V1 path, so one guard covers all three.
  2. In `computeTechnicalSnapshot` (~line 1186-1188): skip `computeRelativePerf` (yield `null`)
     for `rsSector` when `etf === sym`, for `rsSPY` when `sym === 'SPY'`, and for `rsQQQ` when
     `sym === 'QQQ'`.
- **`qa/run-offline.js`** — add focused offline assertions (existing `phaseTechScore`, Phase
  12) covering:
  - `_ts1RsValue` returns `{ value: null }` when `bench.symbol === holding.symbol` (both for a
    flat and for a non-trivial trending series, to prove it's the identity guard — not
    coincidentally a "0 return" — that suppresses the value).
  - `_ts1BuildSnapshot` with `benchmarks.qqq` (or `.spy`) matching `holding.symbol` produces
    `snap.rsQqq === null` (`.rsSpy === null`), while an unaffected benchmark slot on the same
    snapshot still computes normally (proves no over-suppression of valid comparisons).
  - `scoreTickerTech` on that snapshot does NOT award RS points for the self-compared slot
    (missingFields includes it; `subCoverage`/`availablePoints` reflect only the valid
    benchmark(s)), while a normal (non-self) full RS snapshot still scores unchanged
    (regression guard for existing valid-comparison behavior).

## Explicitly not in scope

- No change to RS weights, bands, other components (SMA/high52w/volume), coverage-floor,
  freshness, or any other scoring rule.
- No change to `computeRelativePerf`, `rsLabel`, or the Comparison card render block itself
  (~line 7897-7920) — once `computeTechnicalSnapshot` yields `null` for a self-compared slot,
  the existing "RS unavailable" render path already handles `null` correctly with no change.
- No change to `runTechScoreV1`'s benchmark-fetch loop (still fetches SPY/QQQ/sector
  unconditionally) — suppressing the self-compared value at the single shared `_ts1RsValue`
  computation point is the smaller, equally-correct fix.
- No change to persistence, Actionable Take, normal scan, or any other scoring engine
  (`orchestrate`, `analyzeChunk`, `enforceScoreConsistency`, `_techCache`) — untouched.
- No `main`/production, Netlify, or deploy action — lands on `branch-dev` only, after Owner
  LAND approval.

## Validation

- `npm run qa:offline` (full gate) must pass, including the extended Phase 12 tech-score
  assertions above.
- No existing Phase 12 assertion changes value/meaning — new assertions only, verifying prior
  valid-comparison behavior is unchanged (e.g. existing `norm full`/`fractional S+R` truth-table
  cases in `qa/run-offline.js` around line 3144-3178 must still pass unmodified).

## Definition of done

- `_ts1RsValue(holding, bench, policy).value === null` whenever `bench.symbol === holding.symbol`,
  for any policy/candle inputs — this is the strict QA benchmark; any snapshot or score that
  still shows a numeric self-compared RS value is a defect, not a warning.
- `computeTechnicalSnapshot` never returns a non-null `rsSPY` when `symbol === 'SPY'`, non-null
  `rsQQQ` when `symbol === 'QQQ'`, or non-null `rsSector` when `sectorEtf === symbol`.
- All pre-existing Phase 12 assertions in `qa/run-offline.js` continue to pass unchanged.
