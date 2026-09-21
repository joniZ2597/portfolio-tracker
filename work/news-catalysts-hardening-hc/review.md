# Task review: news-catalysts S1.5.1 hardening — H-C (prompt-only)

Base `336ff96` (last code commit, H-B) · brief-only commit `889bf9f` (approved at SHA256
`b1399d5f…6c2c`, staged blob hash identical) · worktree `pt-wt-news-catalysts-hardening-hc`, branch
`task/news-catalysts-hardening-hc` cut from `889bf9f`.

**Status: READY FOR COMMIT APPROVAL.** Implementation matches the approved brief; all completion gates
green; one Codex round, two P2 findings — one FIX applied (NP46 assertion tightened, QA re-run green),
one documentation fix applied to this file. Not committed, not pushed, not landed; no live call; Pilot 4
not run.

## Origin

Pilot 3 (run `20260921T2045Z`, three live Agent calls at `4a61959`) found two blocking behavioural
failures that H-A's prompt did not close: (1) the MRNA convertible-notes `eventDate` reproduced as the
completion/indenture date (`2026-09-01`) against the shipped R-1 rule; (2) **Q-3** — the NVDA Q2 FY27
earnings event was in the Evidence Set and was emitted, but was lost `INVALID_SOURCE_URL` because the
model supplied a `sourceUrl` it had never retrieved. Owner ruling 2026-09-22: H-C = C-1 + C-2, prompt
text only; C-3 deferred; no mechanism.

Owner count correction (2026-09-22, acknowledged, brief deliberately not amended): the provider suite
baseline is **45/45** (NP01–NP45), not 44; expected after H-C **48/48**. NP48 reserved, unused.

## Implementation vs. the approved brief

- `netlify/functions/lib/news-catalysts-provider.js` — two insertions, both inside `buildRequestBody`
  (hunks at 271 and 314), nothing else:
  - **C-2** (four concatenated fragments) appended to the `sourceUrl` field instruction, immediately after
    "and sourceUrl (the https URL of the source reporting the event)." and before "earnings_event covers":
    *sourceUrl must be copied exactly from a URL actually returned to you by search or page fetch for this
    event. Do not construct, infer, guess, shorten, normalise or recall a URL from memory, even if you are
    confident the page exists. If no retrieved URL supports the event, omit the event rather than
    substituting a different real URL.*
  - **C-1** (six fragments) inserted directly after the retained R-1 sentence ("…only when it is itself
    materially distinct.") and before the unchanged reiteration sentence: *For a multi-stage financing or
    corporate action — for example a convertible or debt offering, an equity offering, a tender or exchange
    offer, or a merger or acquisition — the catalyst is the announcement, pricing or decision, and eventDate
    is that date. A later closing, completion, settlement, indenture or effectiveness date is not the
    catalyst's date, and must not be used merely because a later filing or article carried it. If the
    completion is itself materially distinct — terms changed, size changed, the transaction failed — it is a
    separate catalyst with its own date.*
  - The R-1 wording is byte-for-byte retained (the only "−" line in each hunk is the split of the
    pre-existing `'distinct. A routine analyst…'` fragment into `'distinct. …'` + C-1 + `'A routine
    analyst…'`; every character of the original survives, and NP46 now pins the whole sentence as one
    contiguous literal).
- `qa/news_catalysts_provider_offline.js` — the NP01 literal mirrors the same two insertions
  character-for-character (NP01 deep-equals and stringify-equals the live request body, so both copies
  are proven identical by the suite itself); **NP46**, **NP47**, **NP49** appended after NP45 and before
  the fetch-guard restore. NP48 intentionally skipped. No existing test moved.
  - NP46 — presence: the complete original R-1 sentence (as shipped at `336ff96`) present verbatim,
    contiguous and exactly once; C-1 span located and proven to start **after** it; event classes
    `convertible`, `debt offering`, `equity offering`, `tender`, `merger or acquisition`; trap terms
    `closing`, `completion`, `settlement`, `indenture`, `effectiveness`; the "announcement, pricing or
    decision … eventDate is that date" and "must not be used merely because a later filing or article
    carried it" clauses; no digit/%/$ in the C-1 span.
  - NP47 — presence: four C-2 markers, including the omit-rather-than-substitute clause, located inside
    the `sourceUrl` field instruction (between the field clause and "earnings_event covers"); no digit/%/$.
  - NP49 — behavioural, deterministic Q-3 pin: a well-formed https, same-host, plausible sibling of a
    retrieved URL (shape of the Pilot 3 NVDA case; grounding carries a sibling `url_citation` and a
    second-host `search_results` entry) ⇒ `items: []`, `skippedItems: [{ reason: 'INVALID_SOURCE_URL' }]`;
    control: the byte-identical candidate, once present in grounding, survives with the grounding entry's
    raw URL persisted.

**Reading recorded (brief §3):** the brief quotes the rule text with markdown emphasis (`**…**`) and
code spans (`` `eventDate` ``, `` `sourceUrl` ``). The destination is a plain JS prompt string in which
existing field names already appear bare, so those markers are rendered as plain text; the wording is
otherwise character-identical to §3 (including "normalise"). Surfaced here for the Owner at commit approval.

Frozen/untouched, re-verified on the diff (added/removed lines grep = 0 for each): `SKIP_REASONS` (still
12, NP44 green) · validation ladder · `resolveGrounded` · `appendEvidenceEntry` · `buildNewsKey` ·
`NEWS_KEY_RE` · `IDENTITY_SCHEMA_VERSION` / identity tuple · `REQUEST_SCHEMA` · `tools` · `preset` ·
`PPLX_ENDPOINT` · `response_format` · `DEFAULT_TIMEOUT_MS` (45000, NP02 pin green) · `module.exports`
(surface 16). No retry, no Evidence Set read, no dedup, no C-3 wording (`same-theme` / `conference` /
`volume` / `count-based` absent from the diff). `news-catalysts-core.js`, `qa/news_catalysts_core_offline.js`,
`news-catalysts-preflight.js`, `evidence-contract.js`, `news-catalysts.mjs`, `qa/run-offline.js`,
`netlify.toml`, `package.json`, `index.html`: zero diff. Gate `PT_ENABLE_NEWS_CATALYSTS_SERVER` untouched
and unset. No live Perplexity call.

## QA / verification evidence (raw in `qa.log`)

| Check | Result |
|---|---|
| Step-0 pre-edit baseline @ `889bf9f` (fresh worktree, `npm ci`) | `qa:offline` **PASS, 43 spawned suites**; provider **45/45**; core **30/30** |
| Red run (NP46/NP47/NP49 added, prompt unpatched) | **NP46 FAIL, NP47 FAIL**; NP49 PASS (pins pre-existing fail-closed grounding); 46 pass |
| `node qa/news_catalysts_provider_offline.js` (post-patch, and again after the Codex NP46 FIX) | **48/48 PASS**, NP01–NP47 + NP49 |
| `node qa/news_catalysts_core_offline.js` (post-patch, and again after the FIX) | **30/30 PASS**, file zero diff |
| `npm run qa:offline` (post-patch, and again after the FIX) | **PASS, 43 spawned suites** — identical to baseline; 1 pre-existing advisory (index.html smart quote, line 10050, unrelated) |
| Implementation diff vs `336ff96` (excl. `work/`, `BACKLOG.md`) | **exactly 2 files** (+123 / −2); provider hunks only inside `buildRequestBody` |
| Planted negative for NP49 (`resolveGrounded` temporarily loosened to domain-only match in the real source) | **NP49 FAIL** (with NP07 and NP42, 45 pass); restored **byte-identical** (SHA256 `b065e838…6333` before/after); **48/48** again |
| Planted negative for NP46 (a word inserted inside the R-1 sentence in the real source) | **NP46 FAIL** (with NP01, 46 pass); restored **byte-identical** (same SHA256); **48/48** again |
| Prompt copies identical | NP01 deep-equal + stringify-equal green; digits in the prompt still only `30` / `60` (NP27) |
| Line endings | both files uniformly CRLF in the working tree / LF in the index (bare-LF count 0), unchanged convention |

## Codex review

**Round 1** — `codex review "<prompt>"` (codex-cli 0.154.0, model gpt-5.6-sol, reasoning high, workdir =
this worktree) over the complete task diff: the two implementation files plus this `review.md`, with the
Owner's seven review points as the prompt. Raw transcript verbatim in `codex.md` (a first invocation
combining `--uncommitted` with a prompt was rejected by the CLI before any review ran; recorded there
too). Codex independently ran provider (48/48), core (30/30) and full offline QA (43, PASS) and left the
tree unchanged (both file SHA256s verified before/after). Verbatim conclusion: "The implementation
otherwise satisfies C-1/C-2, preserves fail-closed grounding and scoped invariants, and passes provider
48/48, core 30/30, and all 43 offline suites."

| # | Finding (Codex severity) | Class | Resolution |
|---|---|---|---|
| 1 | [P2] NP46 checked three separate R-1 substrings, so text could be altered or inserted between them while NP46 still passed; assert the complete original R-1 sentence as one contiguous literal (brief §3 "retained unchanged") | Class I — **FIX** | NP46 now asserts the full R-1 sentence as one literal, present exactly once, and computes the C-1 "after R-1" boundary from it. Provider 48/48, core 30/30, `qa:offline` 43 re-run green; planted negative (word inserted inside R-1) fails NP46. |
| 2 | [P2] `review.md` declared readiness while its Codex ledger was a placeholder | Class II — fixed | This section and "Final status" now record the actual outcome; self-checked (paths, counts, no placeholder wording). |

**Scoped re-pass** (Owner-authorized 2026-09-22, finding #1 and its NP46 fix only; `codex review
"<prompt>"`, transcript verbatim in `codex.md` under "Scoped re-pass"). Codex reported PASS on all seven
points — the complete original R-1 sentence is asserted as one contiguous literal, present exactly once;
C-1 is proven to start after the intact R-1 sentence; inserting text inside R-1 breaks the assertion;
C-1 extends rather than replaces R-1; the provider diff is unchanged from round 1 (QA-only tightening);
this file accurately records the original finding and the fix. Verbatim conclusion: "SCOPED RE-PASS:
PASS, no findings". Codex re-ran the provider suite (48/48) and left the tree unchanged (three file
SHA256s verified before/after). The Owner also approved the plain-text rendering of the brief's markdown
markers (ruling 1, 2026-09-22); no change required.

## Files changed
- Implementation (2): `netlify/functions/lib/news-catalysts-provider.js`, `qa/news_catalysts_provider_offline.js`
- Evidence (tracked): `work/news-catalysts-hardening-hc/brief.md`, `work/news-catalysts-hardening-hc/review.md`

## Lessons

- [covered] A brief's hardcoded expected test count must be measured by running the suite, not by grepping
         `test('NP` — a title containing an apostrophe uses double quotes and is missed. Already covered by
         `.claude/rules/qa-suites.md` ("prefer relative or derived counts over hardcoded expected-count
         literals"); the brief's 44 was exactly this artefact.
- [design] A prompt rule that names a downstream hard constraint ("the URL must be one you retrieved") is
         only safe with an explicit omit-rather-than-substitute clause; otherwise the rule trades a visible
         skip for an invisible mis-grounded survivor. Destination: `work/catalyst-news/breakdown.md`,
         Domain logic — *any future provenance or grounding instruction carries an omit clause, and the
         pilot gate that detects substitution (P4-3) is human review, never a fixture.*
- [local] A "wording retained verbatim" requirement is pinned by one contiguous literal of the whole
         sentence, never by a few substrings — substrings tolerate insertions between them (Codex round 1).
- [local] NP49's honest planted negative is a mutation of `resolveGrounded` in the real source (domain-only
         match), which also trips NP07 and NP42 — the three together are the grounding invariant's
         coverage; NP49 adds the Q-3-shaped same-host sibling case those two did not have.

## Final status

READY FOR COMMIT APPROVAL. Implementation matches the approved brief exactly (two files; C-1 after the
retained R-1, C-2 inside the sourceUrl field instruction; NP46/NP47/NP49 added, NP48 reserved, NP01
mirrored; provider 48/48, core 30/30 unmodified, `qa:offline` 43). Red-then-green and both planted
negatives recorded in `qa.log`. Final check: 1 round, 1 class-II finding fixed, 1 class-I FIX (QA re-run +
scoped Codex re-pass: PASS, no findings), self-checked. Commit approval requested for
the implementation diff (two files) plus this `review.md`; LAND, push, deploy, env/gate/Netlify change and
Pilot 4 are each separate Owner decisions and none has been taken.
