# Task brief: 8a — Rating regex de-duplication

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

## Baseline

| | |
|---|---|
| Base | **`1eda72c`** = `branch-dev` |
| Branch / worktree | new `task/rating-regex-dedup`, separate worktree |
| `qa:offline` | **43 spawned suites — unchanged by this task** |
| Origin | Backlog task 8, **split by Owner ruling 2026-09-22** |
| Scope | **8a only.** 8b (`getS`) is HELD · D-2 (`PT:`) is DROPPED — §7 |

**Objective.** Replace five identical inline `Rating:` parser regex literals in `index.html` with one
shared definition. **No observable behaviour change.**

---

## 1 · Exact current locations

All five are in the single `<script>` block (`index.html:969-15330`), so all five are in one
top-level scope. The literal is byte-identical at every site:

```js
/Rating:\s*(Buy|Neutral|Sell)/i
```

| # | Line | Enclosing context | Receiver |
|---|---|---|---|
| **S-1** | `:6425` | `_srGroupResults` → `rRank` | `(r.summary \|\| '')` |
| **S-2** | `:6475` | scan-results card renderer | `(r.summary \|\| '')` |
| **S-3** | `:6673` | second card renderer | `(r.summary \|\| '')` |
| **S-4** | `:7378` | `renderMainPanel` | `sum` |
| **S-5** | `:9991` | portfolio result-row builder | `(res.summary \|\| '')` |

**Not in scope, and not a sixth copy:** `:7895` `actionable.replace(/Rating:.*$/s,'')` is a different
regex doing a different job (trailing-tail strip), and `:5595` / `:5604` / `:5642` are prompt text.

---

## 2 · The finding that determines the fix shape

**The regex is identical at all five sites. The resolution logic around it is not.** Three distinct
behaviours:

| Sites | Logic | Effect |
|---|---|---|
| **S-1, S-2, S-3** | `r.rating \|\| (rM ? rM[1] : 'Neutral')` | explicit field wins; regex is fallback; default `'Neutral'` |
| **S-4** | `rM ? rM[1] : 'Neutral'` | **no `r.rating` precedence** — regex only |
| **S-5** | `if (rM) { …append span… }` | **no fallback at all** — the rating element is omitted when unmatched |

**Consequence: extracting a `getRating(record)` helper would change behaviour at S-4 and S-5.** S-4
would begin honouring `r.rating`; S-5 would begin rendering a `'Neutral'` span where it currently
renders nothing. Either is a real behaviour change and neither is in scope.

**Therefore 8a extracts the regex only. Every call site keeps its own resolution logic verbatim.**

> A related inaccuracy, reported not fixed: the comment at `:6672` says the S-3 fallback is the
> *"same method as renderMainPanel"*. Per the table above **it is not** — S-3 consults `r.rating`
> first and S-4 does not. **Owner micro-decision in §8.**

---

## 3 · Chosen shared definition

A single top-level frozen constant, matching the established convention in this file for top-level
regex constants — `TICKER_PATTERN` `:3513`, `SEC_STORE_TICKER_PATTERN` `:3735`,
`FUND_FACTS_READ_TICKER_RE` `:4155`:

```js
var RATING_SUMMARY_RE = /Rating:\s*(Buy|Neutral|Sell)/i;
```

**Placement:** top level of the script block, textually **before `:6425`** and grouped with the
existing constant cluster. Exact insertion line is the Worker's, constrained to: top-level scope ·
before S-1 · not inside any function.

**Each call site becomes a receiver swap only:**

```js
const m  = (r.summary || '').match(RATING_SUMMARY_RE);      // S-1
const rM = (r.summary || '').match(RATING_SUMMARY_RE);      // S-2, S-3
const rM = sum.match(RATING_SUMMARY_RE);                    // S-4
var  rM  = (res.summary || '').match(RATING_SUMMARY_RE);    // S-5
```

**Nothing else on any of those lines changes** — `const`/`var`, variable names, alignment
whitespace and every following line stay as they are.

---

## 4 · Proof that semantics remain identical

1. **Same pattern, same flags.** Source and flags are byte-identical to the five literals; only the
   number of definitions changes.
2. **Sharing one `RegExp` instance is safe here.** `lastIndex` is consulted only for `g`/`y`
   regexes. This regex has neither, so `String.prototype.match` performs an unanchored search from
   index 0 on every call regardless of prior use. **No cross-call-site state is introduced.**
3. **Declaration order is safe.** All five uses are inside function bodies that run after script
   evaluation, and the constant is declared at top level in the same script block — it is
   initialized before any of them can execute.
4. **`var` avoids a TDZ class of failure entirely** and matches the neighbouring constants.
5. **No resolution logic moves.** Per §2, each site keeps its own `r.rating` precedence and
   fallback, so the three distinct behaviours are preserved exactly as they are today.

**Mechanical check the Worker must run:** `git diff` must show **exactly six changed regions** —
one insertion plus five single-line receiver swaps — and **no other line in `index.html`**.

---

## 5 · Deterministic offline QA — no new suite

Host: **`qa/ui1b_cards_offline.js`** — it already reads all of `index.html`, already owns the Rating
row assertion (`U09`) and already owns a drift-pin test class (`U12`). **Suite count stays 43.**

Add one static test, **`U17: drift pin — single Rating parser regex definition`**:

| Assertion | Expectation |
|---|---|
| Occurrences of the inline literal `/Rating:\s*(Buy\|Neutral\|Sell)/i` in `index.html` | **exactly 0** |
| Occurrences of `RATING_SUMMARY_RE` | **exactly 6** (1 definition + 5 uses) |
| `var RATING_SUMMARY_RE = /Rating:\s*(Buy\|Neutral\|Sell)/i;` | **present exactly once** |
| `:7895` tail-strip `/Rating:.*$/s` | **still present, unchanged** — proves the sweep did not over-reach |

> **Honest limitation.** `ui1b_cards_offline.js` is scoped to three card-grid regions, and this pin
> is a whole-file property — the fit is imperfect. It is still the best existing host on the
> Owner's "do not add a suite for convenience" rule, and it is a **static** pin, so it cannot
> demonstrate that rendering behaviour is unchanged. **Behavioural equivalence rests on §4 and on
> diff review, not on QA.** That is acceptable precisely because this is a no-behaviour-change
> extraction; it would not be acceptable for 8b.

**Full gate:** `npm run qa:offline` **PASS at 43**.

---

## 6 · File scope

```
index.html                    modify — 1 insertion + 5 receiver swaps
qa/ui1b_cards_offline.js      modify — 1 added static test
```

**Nothing else.** Explicitly out of scope: `netlify/functions/**` · `services/**` · any
news-catalyst file · any `qa/news_catalysts_*` suite · `qa/fixtures/replay/**` · `qa/run-offline.js`
· `package.json` · `netlify.toml` · `CLAUDE.md` · `AGENTS.md` · **`BACKLOG.md`** · the Pilot
harness trees.

---

## 7 · Split record — what this task is not

| Item | Ruling | Status |
|---|---|---|
| **8b · `getS`** (`:7371-7374`) | **HOLD.** Code-reading concerns are observations, not a demonstrated defect. **Do not change a parser because the implementation looks fragile.** Re-opens on a reproducible failing summary string, **or** committed evidence establishing the intended parser contract | **follow-up, not scheduled** |
| **D-2 · `PT:` case-sensitivity** | **DROPPED.** `:7379` and `:3109` both carry `i`; the claimed defect is not reproducible at `1eda72c`. No replacement defect invented. May re-open as a separate task only if `BC-3a` evidence proves a distinct problem | **closed / dropped** |
| **`BACKLOG.md` "second copy" → five** | **Do not modify in this task.** Tracked file, separate governed documentation update | **housekeeping follow-up** |

---

## 8 · Dependencies, pins, and A1 overlap

**Dependencies: none.** Backlog records `Deps: none`; nothing here touches task 5's RS repair or
task 9's `rs`/`rsCls` locals.

**Structural pins: none expected.** The Worker must confirm at gap-check that **no pin in
`qa/run-offline.js` moves** — including the `callCount === 2` pin at `:3459`, which belongs to
backlog task 6, not here. Any pin movement is a STOP.

**Zero overlap with A1 — confirmed:**

| | A1 | 8a |
|---|---|---|
| Files | `qa/news_catalysts_replay_offline.js`, `qa/fixtures/replay/**` | `index.html`, `qa/ui1b_cards_offline.js` |
| Domain | news-catalyst evidence pipeline | research/analysis render path |
| Suite count | 43 → **44** | 43 → **43** |

**No file, function, fixture or pin is shared. Because 8a adds no suite, the parallel-lane
suite-count collision does not arise** — A1 can land at 44 before or after 8a with no re-baselining
in either direction.

**Owner micro-decision:** correct the false comment at `:6672`, or leave it? **Recommend correcting
it** — it is one comment line, zero behaviour, and leaving a comment that misdescribes the fallback
is how the next reader builds the wrong `getRating` helper. **Default if no ruling: leave it
untouched** and carry it as a follow-up.

## 9 · STOP conditions

1. Any file beyond `index.html` and `qa/ui1b_cards_offline.js`.
2. **Any change to resolution logic** — `r.rating` precedence, `'Neutral'` fallbacks, or the S-5
   conditional render. The regex moves; nothing else does.
3. **Any `getRating()`-style shared helper.** Per §2 it changes S-4 and S-5 behaviour.
4. Any change to `:7895` `/Rating:.*$/s` or to the prompt text at `:5595` / `:5604` / `:5642`.
5. Any `getS` change (8b is HELD) or any `PT:` change (D-2 is DROPPED).
6. Any edit to `BACKLOG.md`.
7. Any change to `qa/run-offline.js`, any pin movement, or any suite-count change.
8. A diff showing anything other than exactly six changed regions in `index.html`.
9. Any scoring, persistence, identity, contract, env, Netlify or deploy change.
10. Any new suite file.

## 10 · Definition of done

One `var RATING_SUMMARY_RE` definition exists in `index.html`; the five inline literals are gone;
all five call sites reference it with their own resolution logic byte-unchanged. `:7895` untouched.
`qa/ui1b_cards_offline.js` gains `U17` with the four assertions in §5. `npm run qa:offline` **PASS
at 43**. No pin moved. Diff = two files, exactly six regions in `index.html`. `review.md` carries a
`## Lessons` section, the two-row "Files changed" block, and the final-check line.

**Not claimed:** that any parsing behaviour improved. **8a removes four redundant definitions and
changes nothing a user can observe.**
