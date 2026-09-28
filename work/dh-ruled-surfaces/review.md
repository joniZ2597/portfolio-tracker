# Review: DH-M2b — ruled display words on three render-only surfaces

## Summary

Implemented per `work/dh-ruled-surfaces/brief.md` §3: three render-only display-word
substitutions through the existing `DH_DISPLAY` table, plus two additive `DH_DISPLAY.surface`
keys. No branch condition, class, colour, tooltip, or DOM structure changed.

## Files changed (exactly the §2 set)

- `index.html`
  - `DH_DISPLAY.surface` (`:2680` block): added `'fx-not-fetched': 'Unavailable (no rate fetched)'`
    and `'scan-date-unknown': 'Unavailable (scan date unknown)'`. All existing groups/keys/values
    byte-unchanged.
  - B1 (`_renderPortfolioPanel`, FX chip, `fxState === 'missing'` branch): literal `'FX unavailable'`
    → `DH_DISPLAY.surface['fx-not-fetched']`.
  - B2 (`_renderPortfolioPanel`, research badge, `!res` branch): literal `'No research'` →
    `_dhLabel('state', 'missing')`.
  - B3 (`checkAndShowStaleBanner`, `timestamps.length === 0` branch): literal
    `'Scan results are from a previous session (date unknown) — re-run scan to get current data'` →
    `DH_DISPLAY.surface['scan-date-unknown'] + ' — results from a previous session · re-run scan for latest data'`.
  - No edit to any out-of-scope site (§4): R2 aged sites (chip `(aged)` at the fxState
    `'aged-but-valid'` branch, total-qualifier `(aged)`), the R1 attention-title / completeness-reason
    / EOD-limitation sites, DH-M1 export reasons, DH-M2 U1–U8, DH-M3, entry 11.
- `qa/dh_ui_vocabulary_offline.js`
  - Added `SITES` entries `B1`/`B2`/`B3` (RB-1/RB-2, reusing the existing per-site
    render/before-literal/control-fixture harness).
  - Added `CONDS` entries `B1`/`B2`/`B3` (RB-3) plus a control mutation (`B2` condition changed) —
    the existing `U4` control (`recon.status`) was left in place, unmodified.
  - `OOS` (UV-4): removed the three now-converted literals; kept `fxLabel + ' (aged)'`,
    `'FX rate unavailable'`, `'USD holdings excluded — FX unavailable'`; added a new pin,
    `"'FX as of '"` (`_renderPortfolioPanel`), to site-scope the `:9774` total-qualifier `(aged)`
    occurrence (see Codex finding below for why this exact literal was chosen, not a bare
    `(aged)` substring). Updated the two OOS control fixtures to use a still-present literal
    (`'FX rate unavailable'` / `'FX as of '`) instead of the now-removed `'No research'`.
  - `SURFACE`/UV-5: expected `surface` group updated to the two DH-M2 entries plus the two new
    §3 entries (four total, additive-only). The existing "changed `state.missing`" control
    (already present at baseline) continues to cover the brief's requested control.

## Targeted QA

- `node qa/dh_ui_vocabulary_offline.js` → **PASS (34 assertions)**.
- `node qa/eod_packet_v0_offline.js` → **PASS (187 asserts)**.
- Full `npm run qa:offline` → **PASS**, 50 suites spawned (matches the recorded Step 0 baseline).

Test-first order followed: RB-1/RB-2/UV-5 assertions were added and confirmed to fail against
the unimplemented baseline (`B1`/`B2`/`B3` renders + missing-ref + before-literal-present, and the
`surface` group short by two entries) before B1–B3 were implemented in `index.html`.

## Worker-launched Codex read-only review

Command: `codex exec --sandbox read-only` against the implementation diff (`index.html` +
`qa/dh_ui_vocabulary_offline.js`).

**Finding (Codex-raised, Class I as raised):** "The QA diff does not add the required site-scoped
pin for the `:9774` total qualifier, `totalQualifier.textContent` ending in `'(aged)'`. It adds an
`FX as of` pin instead."

**Resolution: REJECT, with justification.**

The literal `'(aged)'` (and the bare suffix `' (aged)'`) occurs **twice** in `index.html` — once at
the FX-chip `aged-but-valid` branch (`fxChipVal.textContent = 'FX ' + fxLabel + ' (aged)';`) and
once at the total-qualifier site (`totalQualifier.textContent = 'FX as of ' + ... + ' (aged)';`).
The `OOS` mechanism in this suite (`qa/dh_ui_vocabulary_offline.js:count`/`oosFailures`) requires
each pinned literal to occur **exactly once file-wide** — that is the existing, pre-DH-M2b design
(see the file's own header comment: "site-scoped ... exactly once, and exactly once file-wide").
A pin on the bare `'(aged)'` (or `' (aged)'`) substring would report `count !== 1` and fail
`UV-4` immediately, even against an untouched baseline — it is not a viable pin under this
mechanism, and using it would break the suite rather than protect the site.

This is exactly why the pre-existing DH-M2 pin for the *chip's* occurrence of `(aged)` is not the
bare substring either — it is the compound `fxLabel + ' (aged)'`, which is unique because of the
`fxLabel +` prefix. The new `'FX as of '` pin follows the identical, already-established pattern:
it is the unique static prefix that disambiguates the total-qualifier's `(aged)` occurrence from
the chip's, and it sits inside `_renderPortfolioPanel` exactly once, file-wide exactly once,
verified via `node "<scratchpad>/check_aged.js"` (`count '(aged)': 2`, `count fxLabel + aged: 1`,
`count FX as of: 1`) before landing this choice. Functionally, any tampering with the
`:9774` total-qualifier assignment (its text, its function, or its removal) is detected by this
pin exactly as required by brief §5 UV-4 — the underlying intent (site-scoped preservation of the
total-qualifier surface) is met; only the literal substring differs from Codex's suggested
wording, for the uniqueness reason above.

No other finding was raised. Codex explicitly confirmed: the three after-texts match §3, all
three branch conditions are present unchanged in both baseline and current `index.html`, the
`DH_DISPLAY.surface` additions are additive-only, and no out-of-scope render site was touched.

## Codex final check on the task diff

Second, independent `codex exec --sandbox read-only` invocation, after this `review.md` was
written, re-verified the REJECT reasoning above by independently computing occurrence counts in
`index.html`: `' (aged)'` → 2 (lines 9753 and 9777), `fxLabel + ' (aged)'` → 1 (line 9753, chip),
`'FX as of '` → 1 (line 9777, total-qualifier). Codex confirmed the bare `(aged)` pin is not
viable under the suite's exactly-once mechanism and that `'FX as of '` correctly, uniquely
site-scopes the total-qualifier occurrence. Codex also confirmed the diff touches exactly
`index.html` and `qa/dh_ui_vocabulary_offline.js`, with `work/dh-ruled-surfaces/review.md` as the
sole untracked file — matching brief §2 exactly.

**Result: PASS. No unresolved Class I findings.**

## Definition of Done — checked against brief §8

- [x] B1–B3 render exactly the §3 after-text (RB-1, `qa/dh_ui_vocabulary_offline.js` PASS).
- [x] `DH_DISPLAY.surface` has exactly four entries; all other groups byte-equal to baseline (UV-5
      PASS).
- [x] `qa/dh_ui_vocabulary_offline.js` and `qa/eod_packet_v0_offline.js` PASS; full `qa:offline`
      PASS 50.
- [x] Codex: no unresolved Class I finding (one raised, resolved REJECT with documented
      justification above).
- [ ] One gated task-branch commit containing exactly the §2 files — pending (Step 13, next).
- [ ] Integrity check PASS — pending (Step 13, next).
