# Live-scan protocol (ordered)

Used by `/browser-integrity-qa` when the approved scenario includes a scan or another live action on
DEV. The brief supplies: the DEV URL, the approved action count, the permitted `pt_*` changes
(typically `pt_date` and the scanned entries of `pt_results`), the tickers allowed for temporary
add / remove, and the evidence fields to extract. Written by action, not by tool name; the same
steps apply in Claude in Chrome and in the Claude Code browser tools.

| Step | Action | Rule |
|---|---|---|
| 1 | In the page, record the complete `localStorage` key inventory and compute a sha256 for every key (the `pt_*` keys and every other key), keeping the hashes in `sessionStorage` scratch keys (outside `localStorage`, so never part of the comparison). Print only key names and hash prefixes, never values. Record `pt_results` byte-count separately. | Baseline. Values never leave the page. |
| 2 | Record the scan selection (`inScan` per ticker, from the in-memory watchlist) and the active ticker. | Baseline for restore. |
| 3 | Narrow the scan by toggling `inScan` through the UI's own handler, one ticker at a time; verify the resulting selection equals the approved set before any scan. | Selection-only: never remove a ticker from the watchlist to exclude it; never touch holdings, cash, FX or `pt_active_ticker`. |
| 4 | Optional temporary add, only if the brief names the ticker: add through the UI, record it, and plan its removal through the explicit removal action in step 7. | A ticker not named in the brief is never added. |
| 5 | Perform exactly one approved action (one scan, one request). Before any retry: re-check state — a scan in progress, a changed selection, a new entry in the results store — and retry only when the state proves the action did not happen. If the state cannot be read, stop here and report. | **I-3** (a stale element reference click did not fire) and **I-4** (the renderer froze on a CDP timeout after the action had succeeded): check state before any retry; never re-trigger blindly, so a live action is never duplicated. |
| 6 | Extract the evidence fields the brief lists from the result objects and memory stores (`_cockpitResults`, `_techCache`, `_pplxDebug`, the parser debug fields) in chunks of at most 950 characters; strip URLs and the characters `?`, `&`, `=` from every string before output; never print secrets, raw keys or whole `pt_*` values. | **I-1** (output truncated at about 1,000 characters) → chunked extraction. **I-2** (output containing URLs / query strings blocked) → strip before output. |
| 7 | Restore: remove any temporary ticker with the explicit removal action; restore `inScan` for every ticker to the step-2 record; restore the active ticker if a panel open changed it. | Byte-identical selection where required. |
| 8 | Re-hash every `localStorage` key and compare with step 1, key inventory included. List every key whose hash changed and every added or removed key, whatever its prefix, and mark each permitted (on the brief's list) or not. | Any change outside the permitted list is a FAIL — a changed, new or removed non-`pt_*` key included; `pt_results` changed only in the scanned entries when a scan was the approved action. |
| 9 | Clear the session scratch keys written in step 1. | Leave no QA residue. |

## Incident → rule map

| Incident (recorded on DEV) | Rule | Step |
|---|---|---|
| I-1 JavaScript output truncated at about 1,000 characters | chunked extraction, ≤ 950 characters per chunk | 6 |
| I-2 output containing URLs / query strings blocked by the tool | strip URLs and `?`, `&`, `=` before output | 6 |
| I-3 stale element-reference click on "Run scan" did not fire | state check (no scan running, selection correct, no new result) before any retry | 5 |
| I-4 renderer froze after a watchlist action (CDP timeout) although the action had succeeded | same state-check-before-retry rule; never repeat an action blindly | 5, 7 |

## STOP conditions (Skill-level)

- any unapproved live request would be needed;
- any holdings, cash or FX change, or a `pt_*` change outside the permitted list;
- restore not byte-identical where required;
- a state check that cannot confirm whether an action already happened (report; do not retry).
