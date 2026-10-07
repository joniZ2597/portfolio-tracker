# Suite patterns — pointers, not copies

Read the original before reusing a pattern. Each pointer names the suite and the symbol or row;
line numbers are never recorded here. Rules the patterns obey (auto-discovery, planted negatives on
the production source, offline only, real production module, relative counts) are in
`.claude/rules/qa-suites.md`.

## 1. `extractFunctionSource` + `new Function` sandbox

**Where:** `qa/deep_dive_v0_offline.js` — its own `extractFunctionSource(content, name)`, the
`FNS` list, the concatenated body with a `return { name: name, … }` tail, and the
`new Function('document', 'console', 'fetch', body)` factory that supplies the only free names
the functions may touch.

**Use for:** executing real client functions from `index.html` without a browser. Supply every
free name the function reads (document, window, fetch, localStorage, timers, other helpers) or
the sandbox throws. Keep the `FNS` list complete (coupling class (c)).

## 2. The `renderMainPanel` render harness

**Where:** `qa/tech_snapshot_cache_offline.js` — the "Render harness" section (TC-12c, TC-14,
TC-15): `makeNeutral()` (a Proxy that answers every property, call and primitive with an inert
value), `RENDER_REAL` (the real helpers handed to the panel: price, score, setup classification,
display wording), a captured `mainPanel` element whose rows are then parsed back out of the HTML.

**Use for:** proving what the main panel shows for a given item and snapshot — displayed price,
MA distances, setup wording — against the real score and price helpers, with everything else
neutral.

## 3. Stubbed `fetch`, `localStorage` and timers

**Where:** `qa/tech_snapshot_cache_offline.js` (the engine environment: a stub `fetch` that
returns fixture candles, a counting `localStorage`, controllable `Date`) and
`qa/ts1_default_exposure_offline.js` (the T-harness with a gate value, a counting engine call and
an element map).

**Use for:** proving call counts ("zero engine calls when the gate is off", "concurrent fills
share one call"), persistence counts and timer behaviour without the network.

## 4. The private temp root

**Where:** `qa/lib/run-tmp.js` — `isolate(prefix)` gives the calling process its own temp root
and points `TEMP` / `TMP` / `TMPDIR` at it, so concurrent runs never share fixtures.

**Use for:** any suite that writes files (fixtures, fake repos, manifests). Call it before the
first write; `qa/lib/` is never auto-discovered, so the helper itself is not a suite.

## 5. Masked-file pins

**Where:** `qa/analyst_parser_offline.js` — AP-14: `content.slice(0, ext.start) + '/*MASKED*/' +
content.slice(ext.end)` hashed against `PIN_MASKED_FILE`, plus a per-function pin of the sibling
function and a free-name scan of the function under test.

**Use for:** proving that a task changed exactly one function and nothing else in the file. The
pin trips on every other edit to the file (coupling class (b)); a brief that edits `index.html`
elsewhere must name it for re-pin.

## 6. LF vs CRLF pin forms

**Where:** `qa/tech_snapshot_cache_offline.js` — the `norm` (LF) and `crlf` helpers, `BASE_RM_LF`
vs `OLD_RM_CALIPER_PIN`, and TC-10 / TC-11 / TC-13, which prove that the same `renderMainPanel`
text hashes to the TS1 pin in LF form and to the caliper pin in CRLF form.

**Rule:** `qa/vis_score_caliper_offline.js` reads the working-tree file raw (CRLF on this
checkout); `qa/ts1_default_exposure_offline.js`, `qa/high1y_label_offline.js` and
`qa/analyst_parser_offline.js` normalise to LF first. A re-pin computes the value in the suite's
own form, and a revert proof is done once per form.

## 7. Planted negatives with a counted anchor

**Where:** `qa/tech_snapshot_cache_offline.js` — the mutation table (`mut(s, old, new)` rows keyed
by check id) and the `countOf` helper; `qa/ts1_default_exposure_offline.js` — the `mutate(real,
old, new)` rows per TX id with a positive control.

**Use for:** every invariant a suite asserts. The anchor must occur exactly once in the production
source before the mutation; the mutated run must fail on the asserted check and the unmutated run
must pass it.
