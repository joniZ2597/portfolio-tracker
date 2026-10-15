# Review — fund-facts-token-collision-1

## Result
The fund-facts write preflight now refuses a write token equal to `PT_FUND_FACTS_READ_TOKEN`. In `netlify/functions/lib/fund-facts-preflight.js` the literal `COLLISION_KEYS` array gained `'PT_FUND_FACTS_READ_TOKEN'` as its first entry, so the existing loop (`isNonEmptyString(other) && other === token` -> `TOKEN_COLLISION`) closes the one-directional gap; the check still runs after the `FUND_FACTS_SERVER_DISABLED` gate and the `UNAUTHORIZED` token check and before the SEC identity, allowlist, ticker and membership checks. No other behaviour changed: no new logic, no new export; `fund-facts-read-preflight.js` and `qa/fund_facts_preflight_offline.js` are untouched. The three comments that said "exactly the two" now say "exactly the three" and name the read token. The only change in `qa/ath_isolation_offline.js` is the `BASELINE_PINS` value for `fund-facts-preflight.js` (`2a9a4d36…` -> `d915f63f5b9d9ca67c71b4dd2cd3584f71b48828a0c941aa105a478c4ce5d765`, the LF sha256 of the edited file — it equals the brief's value; I also reproduced it by running the brief's reference `ffc-apply.py` on a scratch copy of the base files and comparing bytes).

## QA
- Step 0 baseline: `qa:offline` PASS, 93 suites (HEAD `2673713`, node v24.14.0).
- Targeted: `qa/fund_facts_token_collision_offline.js` PASS 7/7 (FC-1…FC-6, FC-N1); `fund_facts_preflight_offline` PASS 23/23 (unchanged file, including its `PT_OWNER_TOKEN`-is-not-a-write-collision row); `fund_facts_core_offline` PASS 30/30; `fund_facts_read_offline` PASS 39/39; `ath_isolation_offline` PASS 23/23 (after the one pin update).
- Step 10: full `qa:offline` PASS, 94 suites (= step 0 + 1), OFFLINE VALIDATION: PASS.
- Planted negative: FC-N1 removes the new key from a temp copy of the production source (anchor occurs exactly once) and shows the FC-1 check then fails because the request is let through (`{ ok: true, ticker: 'AAPL' }`), while the two SEC collisions still hold.

LAND-EVIDENCE: qa-offline=PASS 94; targeted=PASS; codex-classI-unresolved=0

## RED record (S1)
Against the unmodified source the new suite gave 4 passed / 3 failed: FC-1 failed with `{ ok: true, ticker: 'AAPL' }` instead of `TOKEN_COLLISION`; FC-4 failed on its collision-beats-later-checks row (got `SEC_USER_AGENT_MISSING`); FC-N1 failed its anchor assertion (`0 !== 1`). FC-2, FC-3, FC-5 and FC-6 passed on the old source, as they pin unchanged behaviour. After the change all seven pass. Raw output in `qa.log`.

## Reading used (wording, not a STOP)
- FC-1 also asserts, from the source text, that the read token is the **first** entry of `COLLISION_KEYS` (brief §1 says "add … first"); FC-4 adds rows for a missing write token (`UNAUTHORIZED`, not a collision) and for collision-before-UA/allowlist/ticker/membership, covering the brief's order requirement.
- The source edit follows the brief's reference candidate (`evidence/candidate.diff`, `ffc-apply.py`) byte-for-byte, so the brief's pin value holds; the array stays a single-line literal. FC-1 and FC-N1 match the array with `\s*`, so they do not depend on that layout.
- Line endings: the working-tree copies in this area are CRLF (`core.autocrlf=true`; `grep -c $'\r'` reported 0 and was wrong, a per-file byte count showed CR = LF = line count). The edits kept CRLF; the pin is the LF-normalised hash, which is what `ath_isolation_offline` computes. The new suite was written with LF and Git normalises it on add.
- Exact-text reading of the pin edit: only the quoted value changed; the reference candidate's trailing `// fund-facts-token-collision-1 (was 2a9a4d36…)` comment on that line was not added, since the brief says "only the `BASELINE_PINS` value".

## Form denial
Form denial: the PowerShell tool is denied in Worker slots (R2) when used for the heavy-run process listing -> reissued as the Bash `wmic process where "name='node.exe'"` form. One scratch `find /` for the reference evidence exceeded the 120 s timeout and was moved to the background; it was replaced by a targeted Glob. Form denial: a Bash call piping a heredoc into `python3` (R1, interpreter reading code from stdin) -> reissued as a Bash append plus the Edit tool. (Nothing was changed in any case.)

## Codex
- Round one (step 8): raw output in `work/fund-facts-token-collision-1/codex.md`. Verdict PASS, no Class I and no Class II findings. Codex affirmed: only `COLLISION_KEYS` and its three comments changed in the preflight; gate -> auth -> collision order unchanged; the `ath_isolation` diff is only the specified pin; FC-1…FC-6 and FC-N1 are covered and the negative mutates a temp copy of the production source; the forbidden files show no changes.

- Final check (step 12, raw in `codex.md` under `## Final check`): no Class I findings; two Class II notes, both **REJECT**: (1) `review.md` read as untracked and `brief.md` as absent from the diff — `review.md` is untracked only until the step-13 commit adds it, and `brief.md` is already committed at the base `2673713`; (2) three implementation files vs two tracked — the new suite is untracked until the same commit. The `Files changed` rows use the fixed two-row shape AGENTS.md prescribes. No claim about the implementation changed.
  Final check: 1 round, 0 class-I findings, 2 class-II findings rejected with reason; no implementation change, no QA re-run.

## Files changed
- Implementation (3): netlify/functions/lib/fund-facts-preflight.js, qa/ath_isolation_offline.js, qa/fund_facts_token_collision_offline.js
- Evidence (tracked): work/fund-facts-token-collision-1/brief.md, work/fund-facts-token-collision-1/review.md

## Backlog reconciliation
- Brief's Backlog row: none. No `BACKLOG.md` edit.
- Action taken: none. The finished work's effect matches the row.
- Entry headings: n/a.
- The diff, QA results and the work being landed agree: no BACKLOG text was changed.

## Not run
- No live or DEV check: the fund-facts server is gated off until the SEC activation decision; the change is a pure-module list entry; no deploy, canary or env change was part of this task.

## Lessons

- [covered] The one-directional token-separation gap was an audit follow-up from `news-token-collision-1`; this task closes the fund-facts pair, so the news task's pending `[backlog]` item about the fund-facts pair is now done — already covered by this task.
- [local] Reproducing the brief's reference candidate with its own apply script on a scratch copy and comparing bytes is what proved the pin value; hashing the CRLF working copy gives a different, misleading digest (`04d549af…` vs the LF-normalised `d915f63f…`).
