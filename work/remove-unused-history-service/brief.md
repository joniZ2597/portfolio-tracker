# Brief — Remove unused `services/history.js`

Branch: `task/remove-unused-history-service` (worktree `pt-wt-remove-history`), based on
`branch-dev` @ `5de84a9`.
Backlog ref: `BACKLOG.md` #3 · "Remove unused `services/history.js`" (legacy ref `HYG-1`).

## Goal

Delete the standalone, dead file `services/history.js`. No other file changes.

## Evidence (PREP, read-only, complete)

- **Unused — confirmed by full-repo reference sweep:** no `require()`, `import`, or
  `module.exports` of it anywhere; no `<script src>` reference (index.html has no external
  script tags at all). Grep for `history\.js|fetchHistoricalCandles|clearHistoricalCache|
  getHistoricalCacheStats|historicalCache` across the repo returns only: the file itself,
  its own inlined copy in `index.html:970-1397`, `BACKLOG.md`/`work/canonical-backlog/
  brief.md` (this same pre-existing backlog item), and two prose-only comment mentions
  (`services/research-evidence-client.js:205`, `CHECKPOINT.md:5949/5989`) that cite it only
  as a naming/inlining-convention precedent, not as a dependency.
- **No QA dependency:** no suite in `qa/*.js` requires, globs, or `fs.readFileSync`s
  `services/history.js` (unlike `services/fund-facts-read-client.js` and
  `services/sec-evidence-store-client.js`, which have live BEGIN/END-VERBATIM parity tests
  against their `index.html` inlined block — `history.js` has no such parity test and never
  did).
- **Stale versus the live inlined implementation:** `services/history.js` still targets the
  `allorigins.win` public CORS proxy (`_HIST_YAHOO_PROXY = 'https://api.allorigins.win/
  raw?url='`). The inlined copy actually running in `index.html:970-1397` was migrated off
  that proxy to first-party `/.netlify/functions/market-data` and `/.netlify/functions/
  av-proxy` and contains zero occurrences of `allorigins`/`YAHOO_PROXY`. The standalone file
  predates that migration and was never updated or deleted afterward — it is not just
  unreferenced, its logic no longer matches production behavior.
- **Provider-policy gate scope confirmed:** `qa/run-offline.js` Phase 14 ("Provider policy",
  `phaseProviderPolicy`, denylist check at current lines ~3787-3803) asserts `index.html`
  contains zero occurrences of `allorigins.win` and no `YAHOO_PROXY`/`_YAHOO_PROXIES`
  identifiers. It reads only `index.html` (`read('index.html')`) — it does not read, scan,
  or otherwise depend on anything under `services/`. Deleting `services/history.js` cannot
  affect this gate's pass/fail in either direction.

## Implementation scope — exactly one file

- **Delete `services/history.js`.** No edit to any other file.

## Explicitly not in scope

- `BACKLOG.md` and `work/canonical-backlog/brief.md` (marking item #3 done) — Owner has
  ruled these are closeout metadata, updated only after successful implementation/QA/LAND,
  not part of the code-change scope.
- `index.html` — its inlined copy (already the live, divergent implementation) is untouched.
- `qa/run-offline.js` or any QA suite — none reference the deleted file; no suite needs
  updating.
- `services/research-evidence-client.js`, `CHECKPOINT.md` — their comment mentions of
  `services/history.js` describe the inlining *convention* generically, not this file's
  contents; they remain accurate as convention references after deletion and are not edited.
- `main`/production — untouched; this task lands on `branch-dev` only, after Owner LAND
  approval.

## Validation

- Full gate: `npm run qa:offline` must pass, including Phase 14 provider-policy, with the
  file deleted.
- Reference/dependency confirmation (post-delete): re-run the same repo-wide grep used in
  PREP (`history\.js|fetchHistoricalCandles|clearHistoricalCache|getHistoricalCacheStats|
  historicalCache`). Because `BACKLOG.md` and `work/canonical-backlog/brief.md` are
  explicitly out of scope, they — along with `index.html` (the live inlined implementation),
  `services/research-evidence-client.js`, and `CHECKPOINT.md` — will still legitimately
  match; that is expected and not a failure. The check is not "grep returns nothing outside
  the deleted file" but: every remaining match is one of these five known non-runtime /
  convention / already-tracked-backlog references or the live inlined implementation, and
  none of them is an `import`/`require()`/`module.exports`/`<script src>`/file-path
  dependency that resolves to `services/history.js` on disk. In other words: no reference
  that previously resolved to the deleted file still attempts to resolve to it after
  deletion (a broken path/require would be the failure condition, not the mere existence of
  a comment or backlog-doc mention).
- `git status` after deletion shows exactly one removed file (`services/history.js`), no
  other modified/untracked paths.

## Definition of done

`services/history.js` no longer exists on disk or in the working tree; `git diff --stat`
against `branch-dev` shows a single-file deletion with no other changes; `npm run
qa:offline` passes with the same suite/assertion counts as the pre-task baseline (no suite
gained, lost, or changed assertion count as a result of this deletion); the post-delete
reference grep's matches are limited to the five known non-runtime references identified
above (`index.html`'s inlined implementation, `BACKLOG.md`, `work/canonical-backlog/
brief.md`, `services/research-evidence-client.js`, `CHECKPOINT.md`), with zero
import/require/script-src/path dependency resolving to the deleted file. Any deviation (a
second file touched, a QA count changing, a new or surviving runtime dependency on the
deleted path, or `index.html`/`BACKLOG.md` edited as part of this task) is a task failure.
