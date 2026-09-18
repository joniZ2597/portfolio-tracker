# Task brief: re-baseline `qa/instruction_layer_offline.js` for the simplified workflow

This brief has operational effect only when the Owner has approved these exact contents and
the brief-only commit records them unchanged. Only then may implementation begin, per
AGENTS.md "Task folder convention".

## Scope

Restore `qa/instruction_layer_offline.js` (WFT-S1 W3 + W4) to green on clean `branch-dev`.
The suite fails 3 of 58 checks because the Owner-ruled simplified-workflow commits
(`94bf9f9`, `4ee0098`) changed `CLAUDE.md` and `portfolio-skill-router/SKILL.md` without
bumping the suite's baselines. Because `qa/run-offline.js` auto-discovers the suite, this is
currently the only failing suite in `npm run qa:offline` and keeps the LAND gate red.

QA-only change. No product, runtime, instruction-layer, or workflow behaviour changes.
Separate from the TradingView pilot.

Owner decisions (2026-09-18) recorded in this brief:
1. Re-baseline the `CLAUDE.md` fingerprint.
2. Re-baseline the `portfolio-skill-router/SKILL.md` fingerprint.
3. Replace the obsolete execution-routing anchor with the minimal simplified-workflow anchor
   (Active workflow model heading + `AGENTS.md` + `portfolio-skill-router`).
4. Do not add a FROZEN LEGACY heading requirement.

## Exact files expected to change (locked, no alternatives)

- `qa/instruction_layer_offline.js` — exactly the three changes below.
- **No other file changes.** `CLAUDE.md`, `AGENTS.md`, `.claude/skills/**`,
  `qa/run-offline.js`, `package.json`, `OFFLINE_TESTS_BASELINE`, and `OFFLINE_TESTS_DENYLIST`
  are not modified. No suite is quarantined.

## Locked changes to `qa/instruction_layer_offline.js`

Line numbers refer to the file at `ab042cb`.

### Change 1 — replace the obsolete anchor check (lines 128–130)

Current:

```js
check('W4 CLAUDE.md: execution-routing checkpoint present',
  /###\s*Execution-routing checkpoint/.test(claudeMd)
  && claudeMd.indexOf('portfolio-skill-router') !== -1);
```

Replace with:

```js
check('W4 CLAUDE.md: active simplified-workflow anchor present (effective 2026-09-18)',
  /###\s*Active workflow model \(simplified, effective 2026-09-18\)/.test(claudeMd)
  && claudeMd.indexOf('AGENTS.md') !== -1
  && claudeMd.indexOf('portfolio-skill-router') !== -1);
```

### Change 2 — re-baseline the `CLAUDE.md` fingerprint (line 158)

Current:

```js
  'CLAUDE.md': 'b1e3c4530bbbd4caa43fc121880f91b91b7bb275163c0e296ff5135956404591',
```

Replace with:

```js
  'CLAUDE.md': 'a1249aac3fde474c365646fc34ad1ec193d5ca0a0e39f89b24244031325db5e2',
```

### Change 3 — re-baseline the router fingerprint (line 159)

Current:

```js
  '.claude/skills/portfolio-skill-router/SKILL.md': 'cebc935783d30f617e0e67d62fa70030a0c721215f6587f9ddea42c4ba5fadd9',
```

Replace with:

```js
  '.claude/skills/portfolio-skill-router/SKILL.md': '7702d67d91a7e8706a4ae2528dee0f11683d0be1427063039281650d90339056',
```

The `optimization-rules.md` entry (`44b03e3e…`) is unchanged and is not touched.

Both new hashes are sha256 over CR-stripped content, the suite's own method, measured on
`ab042cb` where working tree and HEAD content are identical for all three subject files.

No other line of the file changes. The header comment is not edited.

## Validation

- `node qa/instruction_layer_offline.js` prints `instruction_layer_offline: PASS (58 checks)`
  and exits 0. Check count stays 58 (one check replaced, none added or removed).
- Independent hash recompute of the three subject files equals the three baseline strings:
  ```
  node -e "const f=require('fs'),c=require('crypto');for(const p of ['CLAUDE.md','.claude/skills/portfolio-skill-router/SKILL.md','.claude/skills/approval-flow-optimizer/references/optimization-rules.md'])console.log(p,c.createHash('sha256').update(f.readFileSync(p,'utf8').replace(/\r/g,'')).digest('hex'))"
  ```
- `npm run qa:offline` exits 0 (pre-fix: exit 1, this suite the sole failure).
- `git diff --stat` lists only `qa/instruction_layer_offline.js`; `git diff` shows exactly the
  three hunks above with no end-of-line churn (file is LF at HEAD, CRLF in the working tree
  under `core.autocrlf=true`; audit bytes before and after the edit).
- Before the implementation commit, the only repository change is
  `qa/instruction_layer_offline.js` (plus `work/instruction-layer-qa/review.md` when written).
- After the implementation commit, the working tree is clean.
