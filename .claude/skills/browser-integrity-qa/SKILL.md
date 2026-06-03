---

name: browser-integrity-qa
description: Read-only browser/runtime integrity verification for Portfolio Tracker DEV phases. Checks persisted state, memory stores, console findings, gate evidence, and applicable network or visual behavior after approved DEV work.
disable-model-invocation: true
---

# Browser Integrity QA

Run manually after an approved DEV phase using available Claude Code browser/plugin/runtime tools. Assume `/phase-start` has already confirmed branch, refs, approved scope, approval boundaries, and stop conditions. Do not repeat Git pre-flight here.

1. Confirm the tested URL, deployed commit or build marker, and the approved scenario being exercised.

2. Capture baseline before interaction:

   * `pt_results` byte-count and hash
   * `localStorage` key inventory
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

5. Report server gate state with evidence:

   * Use documented gate state supplied by `/phase-start`, or read only the relevant gate-state entry from local-only `CHECKPOINT.md` if it was not included in the pre-flight report.
   * Report runtime-verified server gate state only when the approved QA scenario provides direct evidence, such as an endpoint response proving a disabled or enabled path or an approved Netlify/environment inspection.
   * When direct evidence is absent, report runtime gate state as `NOT VERIFIED`.
   * Do not infer Netlify server environment-variable values from browser DevTools or the absence of visible network requests.

6. State limitations, including scenarios not exercised, time-gated market sessions, live checks not approved, unrendered UI, or deferred validation.

7. Return one compact QA report containing:

   * tested URL and deployed commit/build marker
   * approved scenario
   * always-required results: `PASS`, `FAIL`, or `N/A` with reason
   * scope-conditional results: `PASS`, `FAIL`, or `NOT IN SCOPE`
   * documented gate state versus runtime-verified state or `NOT VERIFIED`
   * console findings
   * limitations
   * required closeout action or `NONE`

`/browser-integrity-qa` is read-only verification. It does not authorize live SEC, Perplexity, or external API canaries; server-gate activation or restoration; Netlify environment-variable changes; deploys; repeated runtime requests beyond what was explicitly approved; commits; pushes; merges; or any `main`/production action. Each requires separate explicit approval.
