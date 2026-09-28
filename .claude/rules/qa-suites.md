---
paths: "qa/**"
---

- Suites are auto-discovered by `qa/run-offline.js` — filename matches `/(_offline|_test)\.js$/`,
  sits at the top of `qa/`, no registration edit; `qa/lib/**` is never discovered, by construction.
- Every requirement maps to ≥ 1 assertion; every assertion maps back — orphan tests are drift.
- Every violable invariant carries a planted negative, and the mutation lands on the production
  source or its fixture inputs — never on the test.
- Offline means offline: no network, no live provider, no browser — fixtures only.
- Assert against the real production module, not a re-implementation.
- Prefer relative or derived counts over hardcoded expected-count literals.
- A check whose assertion calls something with real side effects (spawns a process, reads live
  git or filesystem state) computes the result ONCE, stores it, and asserts against the stored
  value — never two live calls in one assertion path; timing can change the second result.
- A repo-state / tamper check on governance files uses `git status --porcelain`: `git diff HEAD`
  misses untracked planted files, and `--ignored` false-positives on a legitimate gitignored
  `.claude/settings.local.json`. A gitignored malicious governance file is a DENY-tier / T6
  residual concern, not a detection-check case.
