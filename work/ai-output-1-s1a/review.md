# Review: ai-output-1-s1a — AI reply JSON repair for syntax defects inside a field

Task branch `task/ai-output-1-s1a`, base `ba1d2593a518f5a776b30a9d0d3120bde3f5c352` (brief commit). Replaces the retired `ai-output-1-s1`.

## Files changed
- Implementation (4): index.html, qa/ai_parse_repair_offline.js, qa/fixtures/index-pins.json, BACKLOG.md
- Evidence (tracked): work/ai-output-1-s1a/brief.md, work/ai-output-1-s1a/review.md

## Evidence limitation (OD-2 condition, verbatim from the brief)

1. The raw replies were never stored. Only the parser's console lines exist: the `e1` message and a 120-character head and tail. Every fixture is a **reconstruction** that reproduces a recorded error signature, not the model's actual text.
2. The evidence is three failing calls, on two tickers, in one session. NVDA, the original R-7 case, parsed that day; its original failure is assumed to be the same class, not shown.
3. Truncation and prose replies are not excluded in general, only absent from this evidence. S1 does not claim to fix them; they keep today's behaviour.
4. A future failure whose signature matches none of the repairs is out of scope. It is recorded as a `[backlog]` lesson, never a reason to widen this task.

## Rulings carried by this task
- **S1A-1 (Option B):** the replacement is a new task id; the `ai-output-1-s1` implementation and evidence were archived (`pt-work-artifacts/ai-output-1-s1/20261010T233149Z/seed/`, four files, sha256 equal to brief §7) and restored under this brief by hash. The retired branch carries WIP commit `2468765` and was never land-requested.
- **S1A-2 (R10a):** relative to `ac8f39b`, `functions.repairJSON` was a 57-character stub (the extractor ended it at the `}` inside the regex literal `/,\s*([\]}])/g`); its remaining 530 characters sat in the remainder. Any change to `repairJSON` therefore moves the remainder; R10a allows exactly that one deletion.
- **S1A-3 (step-0 reuse):** REUSED — PASS, 77 suites, 1 312 674 ms (`ai-output-1-s1`, base `a8445762`). Conditions, all PASS (verbatim outputs in `qa.log`):
  - C-1: `git diff --name-only a8445762… HEAD` = `work/ai-output-1-s1a/brief.md`, `work/catalyst-evidence-2-s1/brief.md` only.
  - C-2: `qa`, `package.json`, `package-lock.json` unchanged (empty diff).
  - C-3: GC-4 `SKIP (contract pinned: 552ccfc8e1ee/ef28452b4eb8)`; FT `SKIP (contract pinned: 288591877fee/ef28452b4eb8)`; both PASS; `node_modules` `2026-09-26 01:30:35`; node v24.14.0.
  - C-4: reflog = the switch and the WIP commit after `a844576`; status clean; `index.html` `3be4e783…c25d`; `index-pins.json` `43faa9e9…dfd`; suite file absent.
  - C-5: run_offline_discovery PASS (42), instruction_layer PASS (58), `index-pins --check` OK, index_pins PASS (13).
  - C-6: `task-start` 2026-10-10T23:36:30Z, before 2026-10-12 00:00 UTC.
- **Owner / Main Control ruling on the RED migration** (recorded verbatim in `qa.log` and `plan.md`): the pre-restore RED of the archived suite is 10 FAIL (SETUP, AR-2, AR-3, AR-3b, AR-4, AR-5, AN-1, AN-3, AN-4, AN-5) and 5 PASS (AR-1, AN-2, AN-6, AN-7, AN-8); the mutation block aborting at load on pristine code is accepted for that step only. The brief's 9/6 predates the strengthening of AN-3 and AN-5. Observed after the ruling: exactly that pattern.

## Implementation
`repairJSON` is rewritten (no new top-level function) as one string-aware scan plus a safety check:
- RP-0 structural trailing commas removed (string-aware); RP-1 text after the balanced end cut; RP-2 closers appended only when the text ends right after a complete value; RP-3 an interior quote of a string **value** (never a key) escaped when the next non-whitespace character is not `,` `}` `]`.
- SC: the candidate must parse, must carry exactly the keys (in order, as a sequence) that the unrepaired text shows as `"key":` after `{` or `,`, and the same number of `ticker` objects; otherwise today's tail handling runs (`legacy`, which gets the slice `parseJSON` always gave it).
- Braces inside `repairJSON` are built from char codes, so the pin-map extractor (which counts braces character by character) extracts the whole function (R9, asserted by SETUP).
- `parseJSON`: one line — the repair tier is given `clean.slice(start)` (the text from the first `{`) instead of the sliced `jsonStr`; `jsonStr` still feeds the first parse and the per-ticker extraction.

Readings recorded (STOP-2 note: wording vs intent, intent met):
1. **Why `parseJSON` passes the unsliced text:** with the slice to the last `}`, a reply cut off after `],` reaches `repairJSON` looking like a complete element and RP-2 would complete a truncated ticker object (AN-7, truncation keeps today's behaviour). R2 allows this change ("pass the text from the first `{`").
2. **AR-2:** prose AFTER an unclosed object cannot be told from a truncated reply, so it is not a repair case. "Text around the JSON" in signature 1 is read as a prose lead-in plus a code fence (stripped by `parseJSON`), the text ending right after the last complete element.
3. **SC is a key-sequence check** (stronger than the multiset): an injected key that duplicates a real key is caught (the collapsed object has fewer keys than the text shows). An injected key name that appears nowhere else is indistinguishable from a real key — the accepted R6 known limitation.

## QA
- **Step 0:** reused (above). Line 1 of `qa.log`.
- **RED before restore:** suite restored by hash (`6228ff58…3330e`) and run against the unchanged `index.html`: the ruled 10 FAIL / 5 PASS (twice: before and after the ruling); the mutation block aborted at load on pristine code, as ruled.
- **GREEN** (`index.html` restored by hash `0f39077b…ef57d`): `node qa/ai_parse_repair_offline.js` — OK, 24 assertions (SETUP, AR-1…AR-5 incl. AR-3b, AN-1…AN-8, 9 mutation proofs).
- **Mutation proofs (in-memory, each anchor occurs exactly once, each mutant must compile, each row also passes on the unmutated source):**
  - RP-0 removed -> AR-5 fails; RP-1 removed -> AR-4, AN-5 fail; RP-2 removed -> AR-2 fails; RP-3 removed -> AR-3, AR-3b fail;
  - SC removed -> AN-2, AN-3, AN-8 fail; RP-3 applied to keys -> AN-1 fails; a repair that changes a number -> AN-4 fails;
  - RP-2 that also closes a string cut off mid-way -> AN-6 fails; RP-2 that also closes after a comma / inside a key -> AN-7 fails.
- **R10a proof** (scratch script outside the repository, deleted after use; output in `qa.log`): the 530-character tail has sha256 `dc87ebdd84b977d4fee4e7a8f0506ccea97911b171f179ca45c5b171712fb2cd` (= S1A-2) and sat immediately after the `functions.repairJSON` placeholder; the new remainder equals the `ac8f39b` remainder with that tail removed and nothing added (length 237707 -> 237177); the 373 placeholders are identical and in the same order; changed entries are exactly `functions.parseJSON`, `functions.repairJSON`, `remainder`; none added or removed; no region changed; the file digest changed; the new `repairJSON` is extracted in full (5207 characters, ends at its column-0 `}`).
- **`node qa/tools/index-pins.js --update`** changed exactly four lines of `qa/fixtures/index-pins.json` (file digest, `parseJSON`, `repairJSON`, `remainderSha256`); **`--check`** OK (375 functions, 25 regions).
- **Land-tests (all exit 0):** index_pins 13; no_synthetic_score 160 (NS-1 / NS-11 unchanged); analyst_parser 57; high1y_label 103; ma_stack_label 86; ath_isolation 23; narrative_consistency 79; scan_results_enrichment 67; deep_dive_v0 74; ui_hygiene PASS.
- **Full `npm run qa:offline`** (fresh, Owner heavy-lane go-ahead 2026-10-11, Worker B paused): **PASS, 78 suites (77 + 1), 1 268 603 ms**; 1 advisory warning, the pre-existing smart quote in `index.html` (now at line 10899, was 10813: shifted by the 86 added lines).

### `node qa/tools/index-pins.js --diff ac8f39b` (run before `--update`; `index.html` unchanged since)
```
index-pins --diff ac8f39b: 3 changed, 0 added, 0 removed
changed  functions.parseJSON
--- functions.parseJSON @ ac8f39b
+++ functions.parseJSON @ working tree
-  try { return JSON.parse(repairJSON(jsonStr)); } catch(e2) {}
+  try { return JSON.parse(repairJSON(clean.slice(start))); } catch(e2) {}
changed  functions.repairJSON
--- functions.repairJSON @ ac8f39b
+++ functions.repairJSON @ working tree
-  str = str.replace(/,\s*([\]}
+  // ai-output-1 S1: repairs for a syntax defect INSIDE a field. The only edits made: remove a structural trailing comma (RP-0),
+  // cut text after the balanced end (RP-1), append the closers the bracket stack implies (RP-2), escape an interior quote
+  // of a string value (RP-3). A candidate is kept only if it passes the safety check (SC); otherwise today's behaviour runs.
+  // Brace characters are built from char codes so that the pin-map extractor, which counts braces, sees the whole function.
+  const LB = String.fromCharCode(123), RB = String.fromCharCode(125);
+  const nextSig = (s, from) => { let j = from; while (j < s.length && /\s/.test(s[j])) j++; return j; };
+  const closesNext = (s, i) => { const n = s[nextSig(s, i + 1)]; return n === RB || n === ']'; };
+  // Today's tail handling (string-aware comma removal, bracket count, cut to the last closing pair) for what the repairs do not cover.
+  const legacy = (s) => {
+    let t = '', opens = 0, inStr = false, esc = false;
+    for (let i = 0; i < s.length; i++) {
+      const c = s[i];
+      if (inStr) { t += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
+      if (c === ',' && closesNext(s, i)) continue;
+      t += c;
+      if (c === '"') inStr = true;
+      else if (c === LB || c === '[') opens++;
+      else if (c === RB || c === ']') opens--;
+    }
+    const lastComplete = t.lastIndexOf(RB + ']');
+    return (opens > 0 && lastComplete > 0) ? t.slice(0, lastComplete + 2) + RB : t;
+  };
+  const s = str;
+  const start = s.indexOf(LB);
+  if (start === -1) return legacy(s);
+  // The text is passed unsliced from the first brace so a reply cut off mid-structure is seen as such; today's tail handling gets the same slice it always had.
+  const lastRb = s.lastIndexOf(RB);
+  const sliced = lastRb > start ? s.slice(start, lastRb + 1) : s.slice(start);
+  const out = [], stack = [];
+  let i = start, end = s.length, inStr = false, esc = false, kind = '', done = false, ok = true;
+  while (i < s.length && ok && !done) {
+    const c = s[i];
+    const t = stack[stack.length - 1];
+    if (inStr) {
+      if (esc) { esc = false; out.push(c); }
+      else if (c === '\\') { esc = true; out.push(c); }
+      else if (c === '"') {
+        const j = nextSig(s, i + 1), n = s[j];
+        if (kind === 'key' || j >= s.length || n === ',' || n === RB || n === ']') { out.push(c); inStr = false; t.m = kind === 'key' ? 'colon' : 'after'; }
+        else out.push('\\"');
+      } else out.push(c);
+      i++; continue;
+    }
+    if (/\s/.test(c)) { out.push(c); i++; continue; }
+    if (c === '"') {
+      if (!t || !(t.m === 'val' || (t.m === 'key' && t.o))) { ok = false; break; }
+      kind = t.m === 'key' ? 'key' : 'val'; t.e = false; inStr = true; out.push(c); i++; continue;
+    }
+    if (c === LB || c === '[') {
+      if (t && t.m !== 'val') { ok = false; break; }
+      if (t) t.e = false;
+      stack.push(c === LB ? { o: true, m: 'key', e: true } : { o: false, m: 'val', e: true }); out.push(c); i++; continue;
+    }
+    if (c === RB || c === ']') {
+      if (!t || (c === RB) !== t.o || !(t.m === 'after' || t.e)) { ok = false; break; }
+      stack.pop(); out.push(c); i++;
+      if (stack.length === 0) { done = true; end = i; } else stack[stack.length - 1].m = 'after';
+      continue;
+    }
+    if (c === ',') {
+      if (t && t.m === 'after' && closesNext(s, i)) { i++; continue; }
+      if (!t || t.m !== 'after') { ok = false; break; }
+      out.push(c); t.m = t.o ? 'key' : 'val'; i++; continue;
+    }
+    if (c === ':') {
+      if (!t || !t.o || t.m !== 'colon') { ok = false; break; }
+      out.push(c); t.m = 'val'; i++; continue;
+    }
+    if (!t || t.m !== 'val') { ok = false; break; }
+    let j = i;
+    while (j < s.length && !/[\s,:"\]]/.test(s[j]) && s[j] !== RB) j++;
+    out.push(s.slice(i, j)); t.m = 'after'; t.e = false; i = j;
+  }
+  let cand = null;
+  if (ok && done) cand = out.join('');
+  else if (ok && !inStr && stack.length > 0 && stack[stack.length - 1].m === 'after') {
+    let tail = '';
+    for (let k = stack.length - 1; k >= 0; k--) tail += stack[k].o ? RB : ']';
+    cand = out.join('') + tail;
+  }
+  if (cand === null) return legacy(sliced);
+  // Safety check: the candidate must parse, carry exactly the keys (in order) that the unrepaired text shows as keys, and as many ticker objects.
+  let obj;
+  try { obj = JSON.parse(cand); } catch (e) { return legacy(sliced); }
+  const span = s.slice(start, end);
+  const want = [], re = new RegExp('[,' + LB + ']\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*:', 'g');
+  let m;
+  while ((m = re.exec(span)) !== null) { let k = m[1]; try { k = JSON.parse('"' + k + '"'); } catch (e) {} want.push(k); }
+  const have = [];
+  let tickers = 0;
+  const walk = (v) => {
+    if (Array.isArray(v)) v.forEach(walk);
+    else if (v && typeof v === 'object') {
+      if (Object.prototype.hasOwnProperty.call(v, 'ticker')) tickers++;
+      for (const k of Object.keys(v)) { have.push(k); walk(v[k]); }
+    }
+  };
+  walk(obj);
+  if (have.length !== want.length || have.some((k, n) => k !== want[n]) || tickers !== (span.match(/"ticker"\s*:/g) || []).length) return legacy(sliced);
+  return cand;
+}
changed  remainder
--- remainder @ ac8f39b
+++ remainder @ working tree
- functions.repairJSON ])/g, '$1');
-  let opens = 0, inStr = false, escape = false;
-  for (let i = 0; i < str.length; i++) {
-    const c = str[i];
-    if (escape) { escape = false; continue; }
-    if (c === '\\' && inStr) { escape = true; continue; }
-    if (c === '"') { inStr = !inStr; continue; }
-    if (inStr) continue;
-    if (c === '{' || c === '[') opens++;
-    if (c === '}' || c === ']') opens--;
-  }
-  const lastComplete = str.lastIndexOf('}]');
-  if (opens > 0 && lastComplete > 0) str = str.slice(0, lastComplete + 2) + '}';
-  return str;
-}
+ functions.repairJSON 
```
(Printed by the tool; the `remainder` hunk shows the deletion of the 15-line / 530-character old tail that followed the `functions.repairJSON` placeholder. The R10a proof above shows nothing else moved. The full run is also in `qa.log`.)

## Fresh-context self-review
Re-read the brief and the complete diff against the requirement -> test map. Checked: tier order and console text untouched; valid reply never reaches a repair (AR-1 spy 0); the legacy path receives the same slice as before, so truncated replies (mid-string, after `,`, after `:`) end where they end today (AN-6, AN-7); the diff touches only `repairJSON`, one line of `parseJSON`, the generated pin map, the suite, and entry 38. **What changed as a result: nothing.**

## Codex (step 8, read-only, real diff + untracked suite; raw output in `codex.md`)
Given S1A-1…S1A-3, the C-check record and the RED ruling. Result: **PASS — no findings** on all seven asked points (R1; R7; R8; R10a single deletion; every AN row has a biting negative and the mutation proofs cannot pass vacuously; R2/R9; correctness incl. string/escape state, key vs value position, RP-2 on truncated replies, performance).

### FIX / DEFER / REJECT ledger
No findings -> no FIX, no DEFER, no REJECT.

### Final check (step 12, raw output in `codex.md` under `## Final check`)
Final check: 1 round, 0 findings — PASS on the complete task diff (implementation diff unchanged from the step-8 review, `review.md`, the BACKLOG reconciliation); no implementation change, no QA re-run.

## Backlog reconciliation
- Brief's Backlog row: entry **38** (NVDA AI parse failure, R-7), expected effect **`close`**.
- Action taken: **closed**.
- Entry 38 heading / status text, before -> after: `**INVESTIGATION; added 2026-10-10 (Master restructure, OD-2).** … the fix becomes ai-output-1 S1 …` -> `**DONE; added 2026-10-10 (Master restructure, OD-2), closed 2026-10-11 (work/ai-output-1-s1a/, ai-output-1 S1).** …` with the landed behaviour and the stated residuals; one DONE / HISTORY line added in entry-number order after 37: ``**38** NVDA AI parse failure (R-7) — `work/ai-output-1-s1a/` ``.
- The new BACKLOG text matches the diff (repair of trailing text / interior quote / missing closers; SC discards key or ticker changes; `parseJSON` passes the text from the first `{`; no prompt, scoring or persistence change), the QA results above and the work being landed.
- Not touched: the snapshot table, counts, and any other entry.

## Lessons
- [rule] The pin-map extractor counts braces character by character, so a function that holds a `}` or `{` inside a regex or string literal is cut short and its pin covers only a prefix (here `repairJSON`: 57 of 587 characters at `ac8f39b`). Destination-ready text for `AGENTS.md` / `.claude/rules/qa-suites.md`: "Before a task edits a function listed in `qa/fixtures/index-pins.json`, check that `qa/lib/index-pins-core.js` extracts it up to its column-0 closing brace (a SETUP-style assertion); if it is cut short, either write braces in literals as char codes or state the resulting `remainder` movement in the brief."
- [backlog] The "Standalone (outside the Masters)" table near the top of `BACKLOG.md` still lists `38 · NVDA AI parse failure (R-7) | INVESTIGATION`; outside this task's allowed edits (brief: entry 38's status text and its DONE line only) — pending routing.
- [backlog] The raw model reply is not stored when a parse fails, so every R-7 fixture is a reconstruction. A diagnostic that keeps the failing reply (local, bounded, not persisted to `pt_*`) would turn the next parse failure into a captured case instead of an assumption — pending routing.
- [backlog] A future parse failure whose signature matches none of the repairs (truncation, prose after an unclosed object, an interior quote followed by `,` `}` or `]`) is recorded here and not a reason to widen this task — pending routing.
- [local] The archived seed suite was strengthened after its first RED was recorded, so the brief's 9 FAIL / 6 PASS no longer described it; the Owner ruled the 10 / 5 pattern for the migration step only.
- [covered] Planted negatives with exactly-once anchors and positive controls — already required by `.claude/rules/qa-suites.md`.

## LAND-EVIDENCE
LAND-EVIDENCE: qa-offline=PASS 78; targeted=PASS; codex-classI-unresolved=0
