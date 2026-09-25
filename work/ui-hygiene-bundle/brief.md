# Task brief: Entry 9 — UI hygiene bundle

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| Backlog | **Entry 9** · UI hygiene bundle (Visual / UX) · Track: Portfolio Analysis → ARC: Scan & Review surfaces |
| Preparation baseline | **`e2bdfd2`** = `branch-dev` = `origin/branch-dev` |
| Last validated | `e2bdfd2`, 2026-09-25. Every anchor in §2 was re-derived at this commit |
| Branch / worktree | new `task/ui-hygiene-bundle`, separate worktree |
| `qa:offline` | **46 → 47**: one new auto-discovered suite; `qa/run-offline.js` is **not** edited |
| Lane | **B** — touches `index.html`, so one `index.html` task at a time. **Entry 10 must not start before this task LANDs** (Owner, 2026-09-25) |
| Status | **CODE-READY on Owner approval of these exact contents** |

**Objective.** Remove presentation-layer dishonesty from existing surfaces:
- a control that does nothing;
- search copy that under-describes what search matches;
- untranslated Hebrew in an English scan flow;
- two dead locals.

**No behaviour is added and no meaning is redefined.**

---

## 1 · Standing rulings carried in (not reopened)

| Ruling | Source |
|---|---|
| `⇅` control: **REMOVE**. No sort or filter behaviour is invented or specified | Owner D-1, 2026-09-12 |
| Search: **keep the capability and correct the copy.** The predicate is not narrowed and no field is added; the current five fields are the frozen boundary | Owner D-2, 2026-09-12 |
| Included items: dead `⇅` control · its dead CSS · corrected search placeholder copy · the six remaining Hebrew scan-flow strings · dead `rs`/`rsCls` locals · the required `renderMainPanel` caliper re-pin | Owner, 2026-09-25 |
| **Preserve existing product behaviour except for the fixes listed above** | Owner, 2026-09-25 |
| Key Levels name and its HTML comment: **no change**. The comment is `CMP_END`, the structural anchor for `qa/ui1b_cards_offline.js` | WP-P5 prep §3 (BC-5) |

## 2 · Reality check at `e2bdfd2`

| Item | Anchor | State |
|---|---|---|
| **Dead `⇅` control** | CSS `index.html:509-510` (`.sb-wl-filter`, `:hover`) · markup `:917` `<button class="sb-wl-filter" title="Filter">⇅</button>` | `sb-wl-filter` appears on exactly these 3 lines and `⇅` only at `:917`. No id, no handler, no JS reference |
| **Search copy** | `#tickerInput` `:876-884`; `placeholder="Search ticker or company…"` at `:881`; no `title` | The match set is 5 fields: `symbol` · `name` · `exchange` · `sector` · `sectorEtf`. The predicate exists as **three copies** that match the same fields but differ in whitespace: `updateScanColToggle` `:6405-6411` · `toggleAllVisibleScanInclusion` `:7189-7195` · `renderWatchlistRows` `:7215-7221` |
| **Hebrew** | all in `runAnalysis` (`:14956`): `:14974` · `:14994` · `:15003` · `:15051` · `:15080` · `:15085` | These are **the only 6 lines in `index.html` containing Hebrew codepoints.** `:14974` is dead: it targets `[id^="dd-btn-"]`, and the only rendered ids that contain `dd-btn-` are `edgar-dd-btn-…` (`:8153`, `:12766`), which a starts-with selector does not match |
| **Dead locals** | `renderMainPanel` (`:7469`): `const rs = _scoreSt.rs;` `:7509` · `const rsCls = _scoreSt.rsCls;` `:7510` | Neither is referenced anywhere else. `rs`/`rsCls` otherwise appear only as keys of `_ptScoreStates`'s return object (`:6471`, `:6477`), which **stays** |
| **Caliper pin** | `qa/vis_score_caliper_offline.js:86-97` `PROTECTED_FN_HASHES.renderMainPanel` | Hash of the raw extracted source over the **host (CRLF) checkout**. The current pin `d6499b34…` matches the CRLF working copy, not the LF blob. `runAnalysis` is **not** pinned |

## 3 · Scope — exactly these changes

1. **Dead control.** Delete the markup at `:917` and the two CSS rules at `:509-510`.
2. **Search copy.** On `#tickerInput`:
   - set `placeholder="Search watchlist…"`;
   - add `title="Matches ticker, company, exchange, sector and benchmark ETF"`.

   This is the short fallback from WP-P5 §3a, chosen because the 33-character primary is expected
   to clip in the ~175px field. The complete field list is carried by `title`. **The three
   predicates are not edited.**
3. **Hebrew — six lines in `runAnalysis`:**

   | Line | Change |
   |---|---|
   | `:14974` | **delete the line.** It is a proven no-op (§2) |
   | `:14994` | `'מאתחל...'` → `'Initializing...'` |
   | `:15003` | `` `מנתח ${batch.join(', ')}...` `` → `` `Analyzing ${batch.join(', ')}...` `` |
   | `:15051` | `'הניתוח הושלם!'` → `'Analysis complete!'` |
   | `:15080` | `'שגיאה בהצגת התוצאות: '` → `'Error displaying results: '` |
   | `:15085` | `'שגיאה לא ידועה'` → `'Unknown error'` |

   Keep call structure, arguments and interpolation byte-identical apart from the literal text.
   The `} catch (err) {` and `} finally {` shape that `qa/run-offline.js:1366-1378` extracts is
   unchanged.
4. **Dead locals.** Delete `:7509` and `:7510` only.
5. **Caliper re-pin.** In `qa/vis_score_caliper_offline.js`, change **only** the `renderMainPanel`
   value in `PROTECTED_FN_HASHES`. Compute it with the suite's own `extractFunctionSource` and
   `sha256` over the host checkout, using the same raw-bytes convention as the other nine pins.
   **No newline normalization** — it would invalidate the other nine.
6. **New suite `qa/ui_hygiene_offline.js`** (§6). It is auto-discovered by `OFFLINE_SUITE_RE`
   (`qa/run-offline.js:243`).

**Cross-slice guard (parallel with DH-M0a).** No added or changed line **in `index.html`** may
contain any DH census term: `unavailable` · `Unavailable` · `STALE` · `Stale` · `MISSING` · `Missing` · `FAILED` ·
`Failed` · `DEGRADED` · `insufficient` · `not covered`. The strings in item 3 satisfy this.

## 4 · Out of scope

- Extracting the triplicated predicate into one helper. It was not approved on 2026-09-25; the three copies stay.
- Any change to `_ptScoreStates` or its return keys (pinned, and asserted at `qa/run-offline.js:3748-3765`).
- `:14973` (the `dd-text-` reset line has no Hebrew), and any wider dead deep-dive removal (G6).
- The Key Levels name or comment; `<html lang="he">`; the input's `maxlength`.
- Any sort or filter feature; any entry 10 work; any other caliper pin.

## 5 · Expected implementation files — **3**

```
index.html                          §3 items 1-4
qa/vis_score_caliper_offline.js     §3 item 5 — one hash value
qa/ui_hygiene_offline.js            NEW — §6
work/ui-hygiene-bundle/review.md    NEW — tracked task artifact
```

**QA suites that read in-scope files as text.** 27 `qa/*.js` files read `index.html`. The ones this
diff reaches, and why each still holds:

| Suite | What it checks | Effect |
|---|---|---|
| `vis_score_caliper_offline.js` | `renderMainPanel` pin | **re-pinned by this task**; the other 9 function pins and the CSS pin are untouched |
| `run-offline.js` | `runAnalysis` catch/finally extraction (`:1366-1378`) | survives: structure unchanged |
| `run-offline.js` | `_ptScoreStates` `rs`/`rsCls` values (`:3748-3765`) | survives: keys kept |
| `run-offline.js` | `renderMainPanel` T6 checks (`:3532-3647`) | survives: untouched lines |
| `deep_dive_v0_offline.js` | `renderMainPanel` gated-markup extraction; `runAnalysis(` on a forbidden-call list | survives |
| `ui1b_cards_offline.js` | `CMP_END` and Key Levels | untouched |

The Worker confirms this list against the full 27 at plan time.

## 6 · QA boundary — `qa/ui_hygiene_offline.js`

Static assertions over `index.html`, each with a positive or negative control so the checker is shown
to fire.

| ID | Assertion |
|---|---|
| **UH-1** | `sb-wl-filter` occurs **0** times and `⇅` occurs **0** times. *Control:* a fixture containing the old button fails |
| **UH-2** | **Disclosure matches behaviour.** Take the field set from each predicate, and the disclosed set from `#tickerInput`'s `placeholder` ∪ `title` via the fixed mapping `symbol`→ticker · `name`→company · `exchange`→exchange · `sector`→sector · `sectorEtf`→benchmark. Every matched field must be disclosed, and nothing disclosed may be unmatched. *Controls:* a fixture omitting a field fails; a fixture disclosing an extra field fails |
| **UH-3** | **Field set frozen.** Each of the **three** predicates (in `updateScanColToggle`, `toggleAllVisibleScanInclusion`, `renderWatchlistRows`) matches exactly the 5 fields — no more, no fewer — and all three sets are equal. *Control:* a 4-field or 6-field fixture fails |
| **UH-4** | **Zero Hebrew codepoints** (`\p{Script=Hebrew}`) in `index.html`. *Control:* a fixture with one Hebrew character fails |
| **UH-5** | The five replacement strings in §3 item 3 each appear exactly once inside `runAnalysis`; no `[id^="dd-btn-"]` selector remains; no template renders an id beginning with `dd-btn-` (which proves the deletion was a no-op) |
| **UH-6** | `renderMainPanel` contains no `rsCls` and no `const rs `. `_ptScoreStates`'s return object still has keys `rs`, `rsCls`, `riskState`, `riskCls`, `reward`, `rewardCls`, `fillCls`. *Control:* a fixture with the dead locals fails |
| **UH-7** | **Nothing else moved.** The `CMP_END` comment `<!-- KEY LEVELS (Entry / Invalidation / Risk) — span 6 -->` occurs exactly once. `pc-card-title">Key Levels` is present. `runAnalysis` still contains `} catch (err) {` and `} finally {`. The number of `localStorage.setItem` calls inside `runAnalysis` and inside `renderMainPanel` equals the `e2bdfd2` baseline |

**Caliper:** `vis_score_caliper_offline.js` PASS, with only `renderMainPanel`'s hash value changed.

## 7 · STOP conditions

1. Any file beyond the three in §5, or `review.md` missing from the implementation commit.
2. Any change to a predicate, a searchable field, `_ptScoreStates`, the Key Levels markup or comment, or any other caliper pin.
3. Any added or changed line containing a DH census term (§3 cross-slice guard).
4. Any change to scoring, ranking, persistence, `pt_*` keys, gates, `netlify/functions/**` or `services/**`.
5. Any edit to `qa/run-offline.js` or `qa/ui1b_cards_offline.js`.
6. Any entry 10 work, or any change to `renderMainPanel` beyond deleting `:7509-7510`.
7. A pre-edit `qa:offline` baseline that is not 46 suites green (diagnose under M4 first).

## 8 · Lifecycle / CLOSE and Actor-to-Evidence Closure Check

| closeCondition | Evidence | Actor | Possessable before CLOSE? |
|---|---|---|---|
| Five fixes present | UH-1…UH-6 | Worker | **YES** |
| No drift | UH-7 + caliper (9 pins unchanged) + unchanged suites | Worker | **YES** |
| Re-pin is exactly the two deleted lines | in `review.md`: old→new hash, and the diff of the extracted `renderMainPanel` source (only `:7509-7510` removed) | Worker | **YES** |
| `qa:offline` PASS, 47 suites | full gate run | Worker | **YES** |
| Diff reviewed | Codex (step 8 + final check) | Worker / Codex | NO — gate after CODE-READY |
| LAND | approval | Owner | NO — by design |

**SATISFIABLE offline.** No deploy, credential or live call. After LAND, an optional Owner DEV check:
- no `⇅` in the sidebar;
- the placeholder is unclipped and the tooltip lists the five fields;
- scan progress and error text are English.

## 9 · Definition of done

- The five approved fixes are in `index.html`.
- `renderMainPanel` is re-pinned, and only it.
- `qa/ui_hygiene_offline.js` passes UH-1…UH-7 with controls.
- `npm run qa:offline` is green at **47** suites.
- `review.md` carries the re-pin evidence, `## Lessons`, the files-changed block and the final-check line.
- **Entry 10 may start only after this task LANDs.**
