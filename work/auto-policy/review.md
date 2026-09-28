# Review: auto-policy

## Files changed
- Implementation (6): AGENTS.md, CLAUDE.md, .claude/rules/qa-suites.md, qa/instruction_layer_offline.js, .claude/settings.json, qa/auto_mode_hardening_offline.js
- Evidence (tracked): work/auto-policy/brief.md, work/auto-policy/review.md
- The Owner's final commit stages 7 files: the 6 implementation files above plus
  work/auto-policy/review.md.

## Settings candidate (§8)
- Diff: `.claude/settings.json` differs from prior committed state by exactly one value —
  `"defaultMode": "acceptEdits"` → `"defaultMode": "default"`.
- Candidate/applied SHA256 (reported by Owner, independently reproduced): `0e27485d22c69cc67187aa6f0067bf50d3988d0ebc65d32473a70b0972abec1b`.

## Targeted QA
- `node qa/instruction_layer_offline.js` — PASS (58 checks). CLAUDE.md fingerprint verified
  (`79fc282799080d80568fce5c653386d8266d531343caa3da5eac8875b72e2090`), no DRIFT.
- `node qa/auto_mode_hardening_offline.js` — PASS (3773 assertions). AH-8 defaultMode==='default'
  requirement, applied-settings fixture, and the new acceptEdits planted negative all pass.

## Full QA
- `npm run qa:offline` — PASS, 50 spawned suite(s) (50 → 50, no suite added/removed). One
  pre-existing advisory warning unrelated to this task's scope (index.html smart-quote char at
  line 10363, Phase 3 forbidden-surface check) — not a file in this task's scope.

## Text checks
- AGENTS.md no longer contains "one permission mode", "stays `ask`-tier", "prompts even under
  `acceptEdits`", "Committing — Claude Code prepares", or a posture/tier named "ACCEPT EDITS" — confirmed absent.
- AGENTS.md contains "STOP-6", "Unattended Auto is not permitted", and `guard_integrity_check` — confirmed present.
- CLAUDE.md and AGENTS.md no longer contradict each other on commits (task-branch commits via r9
  gate vs. LAND/push/merge/rebase/pull remaining Owner-only) — confirmed.
- `git diff --stat` shows no line-ending churn (6 files, additions/deletions only; CRLF/LF
  auto-conversion warnings are pre-existing per-file conventions, not churn).

## Integrity check (§ Order 10, pre-final-commit)

**Owner ruling (received after this STOP-6 was surfaced):** the authoritative `--base-dev` for
this task's integrity check is `9f01d481438ddf904adcea787094c31187957bb8` — the legitimate local
`branch-dev` tip after the approved brief-only commit and before implementation began, not the
brief table's drafting-time baseline `dd03098…`. C1 and C6, produced only when the stale drafting
baseline is used, are therefore **non-blocking baseline-staleness artifacts**. C5 remains the
expected pre-final-commit failure because `.claude/settings.json` is intentionally uncommitted
and Owner-applied.

**Authoritative invocation for this task:**

    node qa/guard_integrity_check.js --base-main fbec2c193346d7afd1dab6fd11a46b5efe55238b \
      --base-dev 9f01d481438ddf904adcea787094c31187957bb8 --task task/auto-policy \
      --since 2026-09-28T21:52:59+03:00 --root C:/Users/Owner/Documents/Project/portfolio-tracker

→ **FAIL (1)**: `C5 governance files differ from HEAD in pt-wt-worker-a: .claude/settings.json`
— expected pre-commit, per brief §10 ("C5 may FAIL only for the applied `settings.json`,
expected, as in r10"). Must PASS after the Owner's final commit.

**For the record (superseded by the Owner ruling above):** the same command run with the brief
table's literal drafting-time baseline `--base-dev dd03098a0b0045f6c286d736491ed9a1474d8f20`
produces FAIL (3) — the same C5, plus `C1 local branch-dev 9f01d481438ddf904adcea787094c31187957bb8
!= dd03098a0b0045f6c286d736491ed9a1474d8f20` and `C6 base-dev...task touches protected paths:
work/auto-policy/brief.md`. Per the Owner's ruling, C1 and C6 here are non-blocking artifacts of
the brief table being overtaken by the Owner's own brief-only commit landing on `branch-dev`
after the table was drafted, not evidence of unauthorized `branch-dev` movement.

## Codex review (read-only, `codex exec --sandbox read-only`)
- Verdict: one **FIX** raised, assessed as a false positive; REJECTED with evidence below.
  All other checked dimensions: **PASS**.
- Codex FIX claim: the CLAUDE.md fingerprint in `qa/instruction_layer_offline.js:159`
  (`79fc2827…`) does not match a hash Codex computed ad hoc via a `powershell.exe -Command`
  wrapped `node -e "..."` one-liner (`b7afec5e…`).
- REJECT rationale: the project's own targeted suite (`qa/instruction_layer_offline.js`, which
  runs the identical `sha256(stripCR(readText('CLAUDE.md')))` logic directly in Node, no shell
  wrapping) PASSED with no DRIFT message. Independently reproducing the exact same computation
  directly in Node (Bash, no PowerShell string layer) reproduces `79fc2827…`, matching the stored
  fingerprint exactly. Codex's discrepancy is attributable to its own PowerShell
  `-Command`/escaped-`\r` quoting in the ad hoc reproduction, not a defect in the repository.
- Codex confirmed, with no findings: status lists only the six in-scope changed files; the AGENTS.md/
  CLAUDE.md text changes match brief §5–§6; `.claude/settings.json` changes only `defaultMode`;
  the AH-8 diff contains only the §9-specified changes; the qa-suites.md diff contains only Q1;
  no weakening of R3g/R3m/RC2/r9/r10; no unattended-Auto enablement; no AGENTS.md ↔ CLAUDE.md
  contradiction on commits.

## Codex final check (step 12, run on the complete diff incl. this review.md)
- Verdict: **FAIL**, with two findings:
  1. Re-verified and **confirmed correct**: the fingerprint REJECT above. Codex independently
     reproduced `79fc282799080d80568fce5c653386d8266d531343caa3da5eac8875b72e2090` via a direct
     `node -e` hash (no PowerShell wrapping) and confirmed it matches the stored fingerprint; the
     first pass's discrepancy was a PowerShell quoting artifact. No code change.
  2. **FIX, accepted**: the first draft of this review.md reported the integrity check using a
     substituted `--base-dev` value instead of the brief's literal `dd03098…`, and characterized
     the resulting FAIL as fully resolved. Codex correctly flagged that as not evidenced against
     the brief's authoritative invocation. Accepted: at the time of this round, the review.md was
     corrected to present the literal-brief invocation as the primary result (FAIL 3) and to
     surface the discrepancy as an unresolved STOP-6 condition for the Owner, rather than treating
     the substituted-argument run as a resolution. **That STOP-6 has since been resolved by the
     Owner's ruling** — see "Integrity check" and "Result" above, which supersede this historical
     description of the round-2 state.
  - Codex could not independently confirm the AH-8 / full-`qa:offline` claims in its own sandbox:
    `node qa/auto_mode_hardening_offline.js` failed in Codex's read-only sandbox with
    `EPERM: operation not permitted, mkdtemp` (a sandbox temp-dir restriction, not a suite
    defect — the same suite passed cleanly in the Worker's own unsandboxed run, §"Targeted QA"
    above, 3773 assertions). `work/auto-policy/qa.log` and `codex.md` (this task's raw Codex
    transcripts) are untracked task evidence per AGENTS.md and were not present as separate files
    in Codex's read-only checkout; the QA and first-pass Codex results are instead recorded
    directly in this review.md's "Targeted QA", "Full QA", and "Codex review" sections above.
  - Settings diff, text checks, and no-AGENTS/CLAUDE-contradiction claims: Codex confirmed, no
    findings.

## Final check: 2 rounds — round 1: 1 class-I finding (REJECT, no code change); round 2 (final,
on the complete diff incl. review.md): 1 additional class-I finding (FIX, accepted — review.md
corrected as described above), re-verified round-1 REJECT confirmed correct. 0 unresolved class-I
findings after correction; no class-II findings.

## Result
CODE-READY. The STOP-6 integrity-check condition surfaced above has been resolved by the Owner's
ruling: `--base-dev 9f01d481438ddf904adcea787094c31187957bb8` is authoritative for this task, C1/C6
under the stale drafting baseline are non-blocking artifacts, and C5 remains the sole expected
pre-final-commit failure. Full `qa:offline` PASS 50; targeted suites PASS; Codex's sole
substantive finding (the earlier integrity-check evidencing gap) was corrected in this file; the
fingerprint claim was independently re-verified twice (Worker and Codex) and confirmed a false
positive. Per brief §12, the Worker STOPs here regardless: `.claude/settings.json` is a
DENY-tier/protected path, so the final commit — staging 7 files: the 6 implementation files plus
this `review.md` — is made by the Owner in a normal terminal. The Worker does not commit, push,
LAND, merge, rebase, pull, deploy, or mutate runtime/environment state.
