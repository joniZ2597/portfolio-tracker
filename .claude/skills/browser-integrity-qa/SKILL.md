---

name: browser-integrity-qa
description: Read-only browser/runtime integrity verification for Portfolio Tracker DEV phases, including the approved live-scan validation used by pilots. Checks persisted state, memory stores, console findings, gate evidence, and applicable network or visual behavior after approved DEV work. Human-triggered only, at the brief's approved live step.
disable-model-invocation: true
---

# Browser Integrity QA

Run manually after an approved DEV phase using available Claude Code browser/plugin/runtime tools. Gate and scope context comes from the approved brief's live-actions section and the task's `plan.md`: the DEV URL, the approved scenario and request limit, the permitted `pt_*` changes, the tickers allowed for temporary add / remove, and the evidence fields to extract. Do not repeat Git pre-flight here. Supporting files: `references/live-scan-protocol.md` (the ordered protocol) and `templates/report.md` (the report).

1. Confirm the tested URL, deployed commit or build marker, the approved scenario being exercised, the approved number of live actions, and the brief's permitted-change list. If any of these is not in the brief or `plan.md`, report it as missing and perform no live action.

2. Capture baseline before interaction (State snapshot, protocol steps 1–2):

   * `pt_results` byte-count and hash
   * `localStorage` key inventory
   * a sha256 per `localStorage` key — the `pt_*` keys and every other key — computed in the page and kept in `sessionStorage` scratch keys (outside `localStorage`, so never part of the comparison); values are never printed
   * the current scan selection (`inScan` per ticker) and the active ticker
   * observed `PT_ENABLE_*` client gate state

3. Run always-required integrity checks:

   * Require `pt_results` byte-identical before/after only when the approved scenario must not update persisted results. Report `N/A` with reason when a scan or intentional result update is the tested action.
   * Require no unexpected `localStorage` writes or new keys. Name any explicitly permitted change in the report.
   * Confirm `pt_scan_telemetry` is absent unless explicitly in scope and approved.
   * After fresh reload, confirm applicable memory-only stores such as `_edgarDebug`, `_financeSearchDebug`, `_capitalReturnsDebug`, and `_crDisplay` are absent or `undefined`, unless explicitly expected by the tested scenario.
   * Report observed client gate flags on fresh load and distinguish hostname-enabled behavior from manually set flags.
   * Report app-level console errors; classify browser-extension-origin or known message-channel noise separately.

4. Run only scope-conditional checks:

   * For Function, endpoint, or probe work: list expected endpoints, HTTP statuses, and call counts; confirm only approved requests occurred.
   * For an active canary or live API scenario: validate and report it only when that exact scenario and request limit were separately approved before invocation. Record HTTP status, latency, response shape, and call count. Never initiate a canary or live API request through this Skill.
   * For UI, CSS, or display work: validate applicable requirements from `<frontend_aesthetics>` in `CLAUDE.md` without duplicating those rules here.

5. Scan-selection protocol (protocol steps 3–4), only when the approved scenario includes a scan:

   * Change only the in-memory scan selection, through the UI's own toggle handler (`toggleScanInclusion`), ticker by ticker; never edit the watchlist to narrow a scan.
   * Add a ticker temporarily only when the brief names it as allowed, and remove it afterwards with the explicit removal action; record both.
   * Never touch holdings, cash, FX or `pt_active_ticker`; if opening a panel changed the active ticker, restore it.
   * Restore the full selection before the final re-hash.

6. Evidence extraction (protocol step 6):

   * Read structured results from the memory stores (`_cockpitResults`, `_techCache`, `_pplxDebug`) and from the result objects — not from screenshots — in bounded chunks of at most 950 characters each (rule I-1: the tool truncates longer output).
   * Strip URLs and the characters `?`, `&`, `=` from any string before output (rule I-2: output containing query strings is blocked).
   * Never print secrets, raw API keys or whole `pt_*` values.

7. One-action discipline (protocol step 5):

   * Perform exactly the approved number of live scans or requests. Count each one in the report.
   * Before any retry of a click or action that appears not to have fired (a stale element reference, a timeout, a frozen renderer), re-check state first: is a scan already running, did the selection or result change, did the action already succeed (rules I-3 and I-4). Never repeat an action blindly; a state check that cannot confirm whether the action happened ends the scenario and is reported.

8. Report server gate state with evidence:

   * Use the documented gate state from the brief's live-actions section or `plan.md`.
   * Report runtime-verified server gate state only when the approved QA scenario provides direct evidence, such as an endpoint response proving a disabled or enabled path or an approved Netlify/environment inspection.
   * When direct evidence is absent, report runtime gate state as `NOT VERIFIED`.
   * Do not infer Netlify server environment-variable values from browser DevTools or the absence of visible network requests.

9. Restore and compare (protocol steps 7–9): restore the selection and the active ticker, re-hash every `localStorage` key and compare hashes and key inventory with the baseline, and clear the session scratch keys. Every key whose hash changed and every added or removed key, whatever its prefix, must be on the brief's permitted-change list; any other change is a FAIL.

10. State limitations, including scenarios not exercised, time-gated market sessions, live checks not approved, unrendered UI, or deferred validation.

11. Return one compact QA report (`templates/report.md`) containing:

   * tested URL and deployed commit/build marker
   * approved scenario, approved action count, and the actions actually performed with counts
   * always-required results: `PASS`, `FAIL`, or `N/A` with reason
   * scope-conditional results: `PASS`, `FAIL`, or `NOT IN SCOPE`
   * the pre/post `pt_*` table: per key changed / unchanged, and whether the change was permitted
   * restore result: `PASS` or `FAIL`
   * documented gate state versus runtime-verified state or `NOT VERIFIED`
   * console findings
   * limitations
   * required closeout action or `NONE`

`/browser-integrity-qa` is read-only verification. It does not authorize live SEC, Perplexity, or external API canaries; server-gate activation or restoration; Netlify environment-variable changes; deploys; repeated runtime requests beyond what was explicitly approved; commits; pushes; merges; or any `main`/production action. Each requires separate explicit approval.
