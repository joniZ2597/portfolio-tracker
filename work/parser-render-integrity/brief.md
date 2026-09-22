# Task brief: 8a — Rating regex de-duplication

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

## Baseline

| | |
|---|---|
| Base | **`1eda72c`** = `branch-dev` |
| Branch / worktree | new `task/rating-regex-dedup`, separate worktree |
| `qa:offline` | **43 spawned suites — 43 → 43, unchanged** |
| Origin | Backlog task 8, **split by Owner ruling 2026-09-22** |
| Scope | **8a only.** 8b (`getS`) is HELD · D-2 (`PT:`) is DROPPED — §7 |
| Revision | **r2** — scope expanded to four files per Owner ruling after Worker 2 gap-check returned **CODE-READY: NO** |

**Objective.** Replace five identical inline `Rating:` parser regex literals in `index.html` with one
shared definition. **No observable behaviour change.**

---

## 1 · Exact current locations

All five are in the single `<script>` block (`index.html:969-15330`), so all five are in one
top-level scope. The literal is byte-identical at every site:

```js
/Rating:\s*(Buy|Neutral|Sell)/i
```

| # | Line | Enclosing top-level function | Receiver | Caliper-pinned? |
|---|---|---|---|---|
| **S-1** | `:6425` | `_srGroupResults` `:6423` | `(r.summary \|\| '')` | **yes** |
| **S-2** | `:6475` | `_srRenderGrouped` `:6451` | `(r.summary \|\| '')` | **yes** |
| **S-3** | `:6673` | `openScanResultsOverlay` `:6628` | `(r.summary \|\| '')` | no |
| **S-4** | `:7378` | `renderMainPanel` `:7360` | `sum` | **yes** |
| **S-5** | `:9991` | portfolio result-row builder (`_renderPortfolioPanel` region) | `(res.summary \|\| '')` | no |

**Not in scope, and not a sixth copy:** `:7895` `actionable.replace(/Rating:.*$/s,'')` is a different
regex doing a different job (trailing-tail strip), and `:5595` / `:5604` / `:5642` are prompt text.

---

## 2 · The finding that determines the fix shape

**The regex is identical at all five sites. The resolution logic around it is not.**

| Sites | Logic | Effect |
|---|---|---|
| **S-1, S-2, S-3** | `r.rating \|\| (rM ? rM[1] : 'Neutral')` | explicit field wins; regex is fallback; default `'Neutral'` |
| **S-4** | `rM ? rM[1] : 'Neutral'` | **no `r.rating` precedence** — regex only |
| **S-5** | `if (rM) { …append span… }` | **no fallback at all** — the rating element is omitted when unmatched |

**Consequence: a `getRating(record)` helper would change behaviour at S-4 and S-5.** S-4 would begin
honouring `r.rating`; S-5 would begin rendering a `'Neutral'` span where it currently renders
nothing. Both are real behaviour changes; neither is in scope.

**Therefore 8a extracts the regex only. Every call site keeps its own resolution logic verbatim.**

> The comment at `:6672` claims the S-3 fallback is the *"same method as renderMainPanel"*. Per the
> table above it is not — S-3 consults `r.rating` first, S-4 does not. **Owner ruling: do NOT fix
> the stale comment.** Carried as a follow-up, out of scope here.

---

## 3 · Chosen shared definition

A single top-level constant, matching the established convention for top-level regex constants in
this file — `TICKER_PATTERN` `:3513`, `SEC_STORE_TICKER_PATTERN` `:3735`,
`FUND_FACTS_READ_TICKER_RE` `:4155`:

```js
var RATING_SUMMARY_RE = /Rating:\s*(Buy|Neutral|Sell)/i;
```

**`var` is load-bearing, not stylistic.** `qa/run-offline.js` extracts top-level declarations with
`extractVarSource(content, name)` (`:138`), which matches the literal prefix `'var ' + name`. A
`const` or `let` declaration **would not be extractable by the existing helper** and would force a
change to that helper — outside this scope. **Declaring it `var` is what keeps §5 minimal.**

**Placement:** top level of the script block, textually **before `:6425`**, grouped with the existing
constant cluster. Exact insertion line is the Worker's, constrained to: top-level scope · before
S-1 · not inside any function · **no `;` anywhere in the declaration before its terminating one**
(`extractVarSource` slices to the first semicolon after the signature).

**Each call site becomes a receiver swap only:**

```js
const m  = (r.summary || '').match(RATING_SUMMARY_RE);      // S-1
const rM = (r.summary || '').match(RATING_SUMMARY_RE);      // S-2, S-3
const rM = sum.match(RATING_SUMMARY_RE);                    // S-4
var  rM  = (res.summary || '').match(RATING_SUMMARY_RE);    // S-5
```

**Nothing else on those lines changes** — `const`/`var`, variable names, alignment whitespace and
every following line stay as they are.

---

## 4 · Proof that semantics remain identical

1. **Same pattern, same flags.** Source `Rating:\s*(Buy|Neutral|Sell)` and flag `i`, byte-identical
   to the five literals. **No `g`, no `y`.**
2. **Sharing one `RegExp` instance is safe.** `lastIndex` is consulted only for `g`/`y` regexes.
   Without them, `String.prototype.match` searches from index 0 on every call regardless of prior
   use. **No cross-call-site state is introduced.**
3. **Declaration order is safe.** All five uses are inside function bodies that run after script
   evaluation; the declaration is top level in the same script block. `var` additionally removes
   any TDZ failure mode.
4. **No resolution logic moves.** Per §2 each site keeps its own `r.rating` precedence and fallback,
   so the three distinct behaviours are preserved exactly.
5. **Behavioural invariant (Owner-required):** pre-change and post-change parser/render behaviour
   must be **identical for the existing QA fixtures**. Phase 13 executes the real `_srGroupResults`
   against real fixtures and asserts its output — **that phase passing unchanged is the behavioural
   evidence**, not a static scan.

**Mechanical check:** `git diff index.html` must show **exactly six changed regions** — one
insertion plus five single-line receiver swaps — **and no other line**.

---

## 5 · Four-file implementation scope

```
index.html                          1 insertion + 5 receiver swaps
qa/ui1b_cards_offline.js            + 1 static drift pin
qa/vis_score_caliper_offline.js     3 source hashes updated (of 10)
qa/run-offline.js                   Phase 13 factory: supply RATING_SUMMARY_RE
```

**No other files.** Explicitly out of scope: `netlify/functions/**` · `services/**` · any
news-catalyst file · any `qa/news_catalysts_*` suite · `qa/fixtures/replay/**` · `package.json` ·
`netlify.toml` · `CLAUDE.md` · `AGENTS.md` · **`BACKLOG.md`** · the Pilot harness trees.

### 5.1 · `qa/ui1b_cards_offline.js` — one static drift pin, no new suite

Host chosen because it already reads all of `index.html`, already owns the Rating-row assertion
(`U09`) and already owns a drift-pin class (`U12`). Add **`U17: drift pin — single Rating parser
regex definition`**:

| Assertion | Expectation |
|---|---|
| inline literal `/Rating:\s*(Buy\|Neutral\|Sell)/i` occurrences | **exactly 0** |
| `RATING_SUMMARY_RE` occurrences | **exactly 6** (1 definition + 5 uses) |
| `var RATING_SUMMARY_RE = /Rating:\s*(Buy\|Neutral\|Sell)/i;` | present **exactly once** |
| `:7895` tail-strip `/Rating:.*$/s` | **still present, unchanged** — proves no over-reach |

### 5.2 · `qa/vis_score_caliper_offline.js` — exactly three hashes move

`PROTECTED_FN_HASHES` (`:86-97`) holds **ten** function pins; a separate CSS-block pin sits at
`:84`. The extraction changes exactly three function bodies:

| Pin | Action |
|---|---|
| `_srGroupResults` `b15709ae…6df57` | **UPDATE** — contains S-1 |
| `_srRenderGrouped` `f4372e1f…b9aea` | **UPDATE** — contains S-2 |
| `renderMainPanel` `cd15e31c…2dd1e55` | **UPDATE** — contains S-4 |
| `_ptScoreNorm` · `_ptScoreText` · `_ptScoreCmp` · `_ptScoreAvg` · `_ptScoreStates` · `_ptScoreFillHtml` · `_ptScoreDial` | **UNCHANGED — all seven** |
| protected CSS block `b4c63e69…828d5` `:84` | **UNCHANGED** |

**S-3 and S-5 are not inside any pinned function** (`openScanResultsOverlay`, `_renderPortfolioPanel`
region), which is why only three of five sites move a pin.

**Any pin movement beyond these three is a STOP.** The Worker reports the three new hashes and an
explicit unchanged-confirmation for the other seven plus the CSS pin.

> **CRLF — read this before regenerating hashes.** The caliper hashes **working-tree bytes** read
> from `index.html`. Host `core.autocrlf=true` means the worktree carries **CRLF** while the blob
> carries LF. **Hashes must be regenerated on the host, from the host working tree, by running the
> suite and reading its reported values — never computed in a sandbox or from `git show`.** A
> sandbox-derived hash will be LF-based and will fail on the host. The comparison of record for any
> diff review remains `git diff --ignore-cr-at-eol`.

### 5.3 · `qa/run-offline.js` — Phase 13 only

**Why it is necessary.** `phaseScoreContract` (`:3542`) builds a closed sandbox with `new Function`
from extracted sources only, then **executes the real `_srGroupResults`** at `:3714`. After the
extraction, that function body references `RATING_SUMMARY_RE`, which does not exist inside that
environment → **`ReferenceError` at call time.** The real source must receive the constant; the
alternative (leaving the literal in `_srGroupResults`) would defeat the task.

**Exact adjustment — two edits, both inside `phaseScoreContract`:**

1. Add one entry to the `pieces` object at `:3560-3563`:

```js
pieces = {
  bullTier: extractConstSource(content, '_SR_BULLISH_TIER'),
  bearTier: extractConstSource(content, '_SR_BEARISH_TIER'),
  ratingRe: extractVarSource(content, 'RATING_SUMMARY_RE')
};
```

2. Prepend it to the factory body at `:3572-3576`, alongside the two tier constants:

```js
const factory = new Function(
  pieces.ratingRe + '\n' +
  pieces.bullTier + '\n' + pieces.bearTier + '\n' +
  ALL.map(function (n) { return pieces[n]; }).join('\n') +
  '\nreturn { ' + ALL.map(function (n) { return n + ': ' + n; }).join(', ') + ' };'
);
```

**Nothing else in Phase 13 changes.** In particular:

- The existing `missingPieces` guard (`:3565`) iterates `Object.keys(pieces)`, so a failed
  extraction **fails the phase loudly with no new code**. The test is not weakened.
- `extractVarSource` already exists at `:138`; **no helper is added or modified**.
- **No expected value, fixture, assertion or output changes.** `_srGroupResults` still runs as real
  extracted source, never a reimplementation.

**Verified negative — no fifth file is needed.** `qa/deep_dive_v0_offline.js` mentions
`renderMainPanel` only in a comment and extracts a `PT_ENABLE_DEEP_DIVE` markup sub-expression far
from `:7378`; its `FNS` list (`:97`) contains none of the five enclosing functions, and it never
extracts or executes them. **No other suite sandboxes any of the five sites.**

---

## 6 · Dependencies, pins, and A1 overlap

**Dependencies: none.** Nothing here touches task 5's RS repair or task 9's `rs`/`rsCls` locals.

**Unrelated pin — corrected reference.** The `runTechScoreV1 structurally uncalled` pin
`callCount === 2` is at **`qa/run-offline.js:3523`** (previously cited in this brief as `:3459` —
**stale, corrected**). It belongs to backlog task 6 and **must not move.** It sits in a different
phase from `phaseScoreContract` (`:3542`); the §5.3 edits do not reach it.

**Zero overlap with A1 — confirmed:**

| | A1 | 8a |
|---|---|---|
| Implementation file | none (QA-only) | `index.html` |
| QA files | `qa/news_catalysts_replay_offline.js`, `qa/fixtures/replay/**` | `ui1b_cards`, `vis_score_caliper`, `run-offline` |
| Domain | news-catalyst evidence pipeline | research/analysis render path |
| Suite count | 43 → **44** | 43 → **43** |

**Zero implementation-file overlap. No shared QA file, fixture or pin.** Because 8a adds no suite,
**no suite-count collision arises** — A1 can land at 44 before or after 8a with no re-baselining in
either direction. **A1 may continue independently.**

---

## 7 · Split record — what this task is not

| Item | Ruling | Status |
|---|---|---|
| **8b · `getS`** `:7371-7374` | **HOLD.** Code-reading concerns are observations, not a demonstrated defect. **Do not change a parser because the implementation looks fragile.** Re-opens on a reproducible failing summary string, **or** committed evidence establishing the intended parser contract | follow-up, unscheduled |
| **D-2 · `PT:` case-sensitivity** | **DROPPED.** `:7379` and `:3109` both carry `i`; not reproducible at `1eda72c`. No replacement defect invented | closed |
| **`BACKLOG.md` "second copy" → five** | **Do not modify in this task.** Tracked file, separate governed update | housekeeping follow-up |
| **Stale comment `:6672`** | **Do not fix.** Owner ruling | follow-up |

---

## 8 · STOP conditions

1. Any file beyond the four in §5.
2. **Any change to resolution logic** — `r.rating` precedence, `'Neutral'` fallbacks, or the S-5
   conditional render.
3. **Any `getRating()`-style shared helper.**
4. Any change to `:7895` `/Rating:.*$/s`, or to prompt text at `:5595` / `:5604` / `:5642`.
5. Any `getS` change, any `PT:` change, any `BACKLOG.md` edit, any `:6672` comment edit.
6. **Any caliper pin movement beyond the three named in §5.2**, including the CSS pin.
7. **Any `qa/run-offline.js` change outside `phaseScoreContract`**, any change to `extractVarSource`,
   any movement of the `:3523` `callCount === 2` pin, any weakened guard, any changed expected
   value or fixture.
8. Any suite added or removed; any count other than 43.
9. A diff showing anything other than exactly six changed regions in `index.html`.
10. Hashes regenerated anywhere but the host working tree; any line-ending churn in the diff.
11. Any scoring, persistence, identity, contract, env, Netlify or deploy change.

## 9 · Definition of done

One `var RATING_SUMMARY_RE` definition exists in `index.html`; the five inline literals are gone;
all five call sites reference it with their resolution logic byte-unchanged; `:7895` untouched.
`qa/ui1b_cards_offline.js` gains `U17`. `qa/vis_score_caliper_offline.js` carries exactly three
updated hashes, host-generated, with the other seven and the CSS pin confirmed unchanged.
`qa/run-offline.js` Phase 13 supplies the constant via the two §5.3 edits and nothing else.
`npm run qa:offline` **PASS at 43**, with **Phase 13 passing on the same fixtures and the same
expected output as before the change** — the behavioural invariant. Diff = four files, exactly six
regions in `index.html`, no line-ending churn. `review.md` carries a `## Lessons` section, the
two-row "Files changed" block, and the final-check line.

**Not claimed:** that any parsing behaviour improved. **8a removes four redundant definitions and
changes nothing a user can observe.**
