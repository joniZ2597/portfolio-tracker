'use strict';
/*
 * ai_parse_repair_offline.js — ai-output-1-s1 (R-7): parseJSON / repairJSON repair of syntax defects
 * inside a field. Offline: no network, no file writes, no browser.
 *
 * EVIDENCE LIMITATION: every fixture below is a RECONSTRUCTION that reproduces a recorded parser
 * error signature (2026-10-10 repeat pilot). None is a captured model reply; the raw replies were never stored.
 *
 * The real repairJSON / parseJSON are extracted from index.html (column-0 rule of qa/lib/index-pins-core.js)
 * and run in a sandbox with a capturing console. Planted negatives mutate an in-memory COPY of the source.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const core = require('./lib/index-pins-core');

const INDEX = path.join(__dirname, '..', 'index.html');
const SRC = core.normalizeText(fs.readFileSync(INDEX, 'utf8'));

const fns = core.extractFunctions(SRC);
// Column-0 rule: a function runs from its declaration to the first "\n}\n" after it. (The shared brace counter
// can end a function early at a brace inside a regex or string literal, so it is NOT used to cut the source.)
function fnEntry(name) {
  const hit = fns.filter(f => f.name === name);
  if (hit.length !== 1) throw new Error('expected exactly one top-level ' + name + ', found ' + hit.length);
  const close = SRC.indexOf('\n}\n', hit[0].start);
  if (close === -1) throw new Error('no column-0 close for ' + name);
  return { shared: hit[0].text, col0: SRC.slice(hit[0].start, close + 2) };
}
const REPAIR_E = fnEntry('repairJSON');
const PARSE_E = fnEntry('parseJSON');
const REPAIR_SRC = REPAIR_E.col0;
const PARSE_SRC = PARSE_E.col0;

let pass = 0;
const failures = [];
const ROWS = Object.create(null);   // row id -> function, so a planted negative can re-run a named row against a mutated copy
function check(id, fn) {
  ROWS[id.split(' ')[0]] = fn;
  try { fn(); pass += 1; console.log('  PASS  ' + id); }
  catch (e) { failures.push(id); console.log('  FAIL  ' + id + ' — ' + String(e && e.message || e).split('\n')[0]); }
}

// Build a sandbox from (possibly mutated) function sources. Returns { parse, logs, repairCalls }.
function build(repairSrc, parseSrc) {
  const logs = [];
  const cons = {
    log: (...a) => logs.push(['log'].concat(a).join(' ')),
    warn: (...a) => logs.push(['warn'].concat(a).join(' ')),
    error: (...a) => logs.push(['error'].concat(a).join(' ')),
  };
  const state = { repairCalls: 0 };
  const body = repairSrc + '\n' + parseSrc + '\n' +
    'const __orig = repairJSON; repairJSON = function (s) { __state.repairCalls++; return __orig(s); };\n' +
    'return parseJSON;';
  const parse = new Function('console', '__state', body)(cons, state);
  return { parse: raw => parse(raw), logs, state };
}
const real = () => build(REPAIR_SRC, PARSE_SRC);
let FACTORY = real;   // swapped to a mutated in-memory copy by the planted negatives; never the file on disk

// ── Fixtures (RECONSTRUCTIONS) ─────────────────────────────────────────────────────────────
const LONG = 'Revenue grew on strong data-center demand while margins held; management guided higher for the next quarter and flagged supply as the main risk to watch.';
function tick(t, score, summary, extra) {
  return Object.assign({
    ticker: t, company_name: t + ' Corp', sentiment: 'positive', sentiment_score: score,
    summary, alerts: [{ type: 'normal', text: 'Guidance raised' }], news: ['Catalyst one', 'Catalyst two'],
  }, extra || {});
}
const A = tick('AAA', 71, LONG);
const B = tick('BBB', 64, 'Steady quarter with modest growth and stable guidance.');
// C carries a two-level nested object (alerts[].source{}), which the per-ticker extraction regex cannot match:
// only a real repair can recover it (so an AR row cannot pass through the extraction fallback by accident).
const C = tick('CCC', 58, 'Cautious tone as input costs rise and guidance was held.',
  { alerts: [{ type: 'critical', text: 'Margin pressure', source: { name: '10-Q', year: 2026 } }] });
const TWIN = { results: [A, B, C] };
const twinText = (obj) => JSON.stringify(obj || TWIN, null, 2);
const clone = o => JSON.parse(JSON.stringify(o));

// Expected result of a failed repair on a reply whose objects are unusable.
const EMPTY = { results: [] };

function parseWith(text) { const s = FACTORY(); const out = s.parse(text); return { out, logs: s.logs, repairCalls: s.state.repairCalls }; }

console.log('ai_parse_repair_offline');

// Sanity: the twin is a valid reply and the harness extracted the real functions.
check('SETUP real functions extracted; each ends at a column-0 closing brace (R9)', () => {
  for (const [name, e] of [['repairJSON', REPAIR_E], ['parseJSON', PARSE_E]]) {
    assert.ok(e.col0.startsWith('function ' + name + '('), name + ' start');
    assert.ok(/\n\}$/.test(e.col0), name + ' ends at column-0 }');
    assert.strictEqual(e.col0.split('\n}\n').length - 1, 0, name + ' has an inner \\n}\\n');
    // the pin-map extractor must see the WHOLE function too (balanced braces outside literals), else its pin covers a prefix only
    assert.strictEqual(e.shared, e.col0, name + ': index-pins-core cuts the function short of its column-0 close');
  }
  assert.doesNotThrow(() => JSON.parse(twinText()));
});

// ── AR rows (must be RED against ac8f39b) ───────────────────────────────────────────────────
check('AR-1 a valid reply yields the identical object and no repair runs', () => {
  const r = parseWith(twinText());
  assert.deepStrictEqual(r.out, TWIN);
  assert.strictEqual(r.repairCalls, 0);
  assert.ok(!r.logs.some(l => /e1/.test(l)), 'no e1 line for a valid reply');
});

// signature 1: "after array element" at end of input; text before { and after the JSON; ]} missing after the last element
// The text around the JSON is a prose lead-in and a code fence (stripped by parseJSON); the text ends right after the last complete element.
// (Prose AFTER an unclosed object cannot be told from a truncated reply, so it is not a repair case: it keeps today's path.)
const AR2_TEXT = 'Here is the analysis you asked for:\n```json\n' + twinText().replace(/\s*\]\s*\}\s*$/, '') + '\n```';
check('AR-2 signature 1 (missing closers + surrounding prose and fence) -> deep-equal clean twin (RP-2)', () => {
  assert.throws(() => JSON.parse(AR2_TEXT.slice(AR2_TEXT.indexOf('{')).replace(/\s*```\s*$/, '')), 'fixture must be defective');
  const r = parseWith(AR2_TEXT);
  assert.deepStrictEqual(r.out, TWIN);
  assert.ok(r.logs.some(l => /parseJSON e1:/.test(l)), 'e1 line kept');
  assert.ok(!r.logs.some(l => /ALL tiers failed/.test(l)));
});

// signature 2: one unescaped quote inside a long summary
const QSUM = 'Management called it a "step change" for margins and raised the full-year outlook, with supply flagged as the main risk.';
const QTWIN = clone(TWIN); QTWIN.results[0].summary = QSUM;
const AR3_TEXT = twinText(QTWIN).replace(JSON.stringify(QSUM), '"' + QSUM + '"');
check('AR-3 signature 2 (unescaped quote inside summary) -> deep-equal clean twin, quote kept as text (RP-3)', () => {
  assert.throws(() => JSON.parse(AR3_TEXT), 'fixture must be defective');
  const r = parseWith(AR3_TEXT);
  assert.deepStrictEqual(r.out, QTWIN);
  assert.strictEqual(r.out.results[0].summary, QSUM);
});
// the single-quote form (odd count), closest to the recorded signature
const Q1SUM = 'The CEO said the 12" shipment slipped a quarter, which analysts flagged as the main risk to guidance.';
const Q1TWIN = clone(TWIN); Q1TWIN.results[0].summary = Q1SUM;
const Q1_TEXT = twinText(Q1TWIN).replace(JSON.stringify(Q1SUM), '"' + Q1SUM + '"');
check('AR-3b a single unescaped quote (odd count) inside summary -> deep-equal clean twin (RP-3)', () => {
  assert.throws(() => JSON.parse(Q1_TEXT), 'fixture must be defective');
  assert.deepStrictEqual(parseWith(Q1_TEXT).out, Q1TWIN);
});

const AR4_TEXT = twinText() + '\n\nNote: scores follow {rubric v2}; see } above and {below} for details.';
check('AR-4 trailing text containing {..} / } after the JSON -> deep-equal clean twin (RP-1)', () => {
  assert.throws(() => JSON.parse(AR4_TEXT.slice(AR4_TEXT.indexOf('{'))), 'fixture must be defective');
  assert.deepStrictEqual(parseWith(AR4_TEXT).out, TWIN);
});

const COMMA_SUM = 'Support held near [100, 120, ] on volume, per the desk note.';
const CTWIN = clone(TWIN); CTWIN.results[1].summary = COMMA_SUM;
const AR5_TEXT = twinText(CTWIN)
  .replace(/\n\s*\]\n\}$/, ',\n  ]\n}')              // structural trailing comma at the array end
  .replace('"Catalyst two"\n    ]', '"Catalyst two",\n    ]'); // and inside a news array
check('AR-5 structural trailing commas removed; ", ]" inside a string value kept byte-for-byte (RP-0)', () => {
  assert.throws(() => JSON.parse(AR5_TEXT), 'fixture must be defective');
  const r = parseWith(AR5_TEXT);
  assert.deepStrictEqual(r.out, CTWIN);
  assert.strictEqual(r.out.results[1].summary, COMMA_SUM);
});

// ── AN rows ────────────────────────────────────────────────────────────────────────────────
check('AN-1 a quote that closes a string and is followed by a valid delimiter is not escaped', () => {
  // AR-3 reply: every other string (keys, ticker, closing quotes) must come out identical to the twin
  const r = parseWith(AR3_TEXT).out;
  assert.deepStrictEqual(Object.keys(r.results[0]), Object.keys(QTWIN.results[0]));
  assert.deepStrictEqual(Object.keys(r.results[1]), Object.keys(QTWIN.results[1]));
  assert.deepStrictEqual(r.results[1], QTWIN.results[1]);
  assert.deepStrictEqual(r.results[0].alerts, QTWIN.results[0].alerts);
});

// field-boundary attack: the summary (last key of the object) embeds structure
const ATK = 'Hold the line", "action": "BUY", "sentiment_score": 99, "note": "n/a';
function attackTwin() {
  const t = clone(TWIN);
  const a = { ticker: 'AAA', sentiment: 'positive', sentiment_score: 71, action: 'HOLD', summary: ATK };
  t.results[0] = a;
  return t;
}
// defective: the attack text with its quotes unescaped (reads as structure) plus a second interior quote that makes the object invalid
const ATK2 = 'Hold "the line", "action": "BUY", "sentiment_score": 99, "note": "n/a';
function attackText() {
  const t = attackTwin(); t.results[0].summary = ATK2;
  return twinText(t).replace(JSON.stringify(ATK2), '"' + ATK2 + '"');
}
check('AN-2 field-boundary attack: no action / sentiment_score is taken from the summary', () => {
  const text = attackText();
  assert.throws(() => JSON.parse(text), 'fixture must be defective');
  const out = parseWith(text).out;
  assert.ok(Array.isArray(out.results));
  for (const item of out.results) {
    if (item.ticker === 'AAA') {
      assert.notStrictEqual(item.action, 'BUY', 'action must not come from the summary');
      assert.notStrictEqual(item.sentiment_score, 99, 'score must not come from the summary');
    }
  }
  // the second ticker is unaffected whichever path is taken
  const b = out.results.find(x => x.ticker === 'BBB');
  assert.ok(!b || JSON.stringify(b) === JSON.stringify(B), 'BBB equals the clean twin or is absent');
});

check('AN-3 ticker objects, one malformed: no field moves between objects (the malformed one falls back alone)', () => {
  // (a) a repairable defect in one object: every object equals its clean twin and none borrows from a neighbour
  const out = parseWith(AR3_TEXT).out;
  assert.strictEqual(out.results.length, 3);
  for (const item of out.results) {
    const ref = QTWIN.results.find(x => x.ticker === item.ticker);
    assert.ok(ref, 'ticker ' + item.ticker + ' exists in the twin');
    assert.deepStrictEqual(item, ref, 'per-ticker values equal the clean twin');
  }
  // (b) an unrepairable defect in one object (field-boundary attack): that ticker is dropped alone, the others are untouched
  const atk = attackTwin();
  const out2 = parseWith(attackText()).out;
  for (const item of out2.results) {
    const ref = atk.results.find(x => x.ticker === item.ticker);
    assert.ok(ref, 'ticker ' + item.ticker + ' exists in the twin');
    assert.deepStrictEqual(item, ref, 'per-ticker values equal the twin or the ticker is absent: ' + item.ticker);
  }
  assert.ok(out2.results.some(x => x.ticker === 'BBB'), 'BBB (untouched) is still returned');
});

check('AN-4 a repaired result contains no number or literal the clean twin lacks, none changed', () => {
  function leaves(v, p, acc) {
    if (v && typeof v === 'object') for (const k of Object.keys(v)) leaves(v[k], p + '.' + k, acc);
    else if (typeof v !== 'string') acc[p] = v;
    return acc;
  }
  for (const [text, twin] of [[AR2_TEXT, TWIN], [AR3_TEXT, QTWIN], [Q1_TEXT, Q1TWIN], [AR4_TEXT, TWIN], [AR5_TEXT, CTWIN]]) {
    assert.deepStrictEqual(leaves(parseWith(text).out, '', {}), leaves(twin, '', {}));
  }
});

// trailing text that itself contains a ticker-shaped object: it must be cut off, never merged in or extracted
const AN5_TEXT = twinText() + '\n\nFor example, a rejected item looks like {"ticker":"ZZZ","sentiment_score":99,"extra":{"k":1}} here.';
check('AN-5 trailing {..} text is never merged in: the top-level key set equals the twin\'s', () => {
  assert.throws(() => JSON.parse(AN5_TEXT.slice(AN5_TEXT.indexOf('{'))), 'fixture must be defective');
  for (const text of [AR4_TEXT, AN5_TEXT, AR2_TEXT]) {
    const out = parseWith(text).out;
    assert.deepStrictEqual(Object.keys(out), Object.keys(TWIN));
    assert.deepStrictEqual(out, TWIN);
    assert.ok(!JSON.stringify(out).includes('ZZZ') && !JSON.stringify(out).includes('extra'), 'nothing from the trailing text');
  }
});

function assertFallbackShape(text, label) {
  const r = parseWith(text);
  assert.ok(r.out && Array.isArray(r.out.results), label + ': results array');
  // never an invented or altered field: any item must be a verbatim subset of the twin's ticker objects
  for (const item of r.out.results) {
    const ref = [A, B, C].find(x => x.ticker === item.ticker);
    assert.ok(ref, label + ': unknown ticker ' + item.ticker);
    assert.deepStrictEqual(item, ref, label + ': altered item');
  }
  return r;
}
check('AN-6 a reply still invalid after all repairs ends on today\'s path (extraction or { results: [] })', () => {
  // truncated inside a string
  const t1 = twinText().slice(0, twinText().indexOf('Steady quarter') + 14);
  const r1 = assertFallbackShape(t1, 'truncated-in-string');
  assert.ok(r1.logs.some(l => /falling back to per-ticker extraction/.test(l)));
  // ends after a colon
  const t2 = twinText().slice(0, twinText().indexOf('"company_name"', twinText().indexOf('CCC') - 40) + '"company_name":'.length);
  const r2 = assertFallbackShape(t2, 'ends-after-colon');
  assert.ok(r2.logs.some(l => /falling back to per-ticker extraction/.test(l)));
  // known limitation (R6): interior quote whose next non-ws character is a comma
  const lim = 'He said "x", then the guide moved up';
  const limTwin = clone(TWIN); limTwin.results[0].summary = lim;
  const limText = twinText(limTwin).replace(JSON.stringify(lim), '"' + lim + '"');
  const out = parseWith(limText).out;
  for (const item of out.results) {
    const ref = limTwin.results.find(x => x.ticker === item.ticker);
    assert.ok(ref, 'known-limitation: unknown ticker');
    // either the item is the exact twin item, or it is not returned; a mutated summary must never appear
    assert.ok(JSON.stringify(item) === JSON.stringify(ref), 'known-limitation: altered item');
    assert.ok(!('x' in item) && !('then the guide moved up' in item), 'no invented key');
  }
  // the ALL-tiers-failed line keeps its text when nothing at all is salvageable
  const r3 = parseWith('{"results":[{"ticker": ');
  assert.deepStrictEqual(r3.out, EMPTY);
  assert.ok(r3.logs.some(l => /parseJSON: ALL tiers failed \(rawLen=\d+, jsonLen=\d+, head=".*", tail=".*"\)/.test(l)));
});

check('AN-7 a reply ending inside a key or after "," is not closed by RP-2 (today\'s behaviour)', () => {
  const full = twinText();
  const cutKey = full.slice(0, full.indexOf('"company_name"', full.indexOf('CCC')) + '"company_nam'.length);
  const cutComma = full.slice(0, full.indexOf('"news"', full.indexOf('CCC')) ).replace(/\s+$/, '');
  for (const [label, text] of [['inside-key', cutKey], ['after-comma', cutComma]]) {
    assert.ok(/[,"a-z]$/.test(text.trim()), label + ' fixture ends where expected');
    const r = assertFallbackShape(text, label);
    // CCC is incomplete: it must not be completed by a repair
    assert.ok(!r.out.results.some(x => x.ticker === 'CCC'), label + ': incomplete CCC must not be repaired into existence');
  }
});

// AN-8 (SC): a candidate that would add or drop a key / ticker object is discarded
check('AN-8 SC: a repair that would drop or add a key or ticker object is discarded', () => {
  // the attack fixture parses (after interior-quote repair) with FEWER keys than its structure shows -> must be discarded
  const text = attackText();
  const out = parseWith(text).out;
  const a = out.results.find(x => x.ticker === 'AAA');
  assert.ok(!a, 'AAA must fall back alone (absent), not appear with collapsed keys');
  assert.ok(out.results.find(x => x.ticker === 'BBB'), 'BBB survives via extraction');
});

// ── Planted negatives (mutation proofs): each mutates an in-memory COPY of repairJSON, never the file ─────────────────
function mutate(src, anchor, replacement) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) throw new Error('harness defect: mutation anchor occurs ' + n + ' time(s), expected exactly 1: ' + anchor.slice(0, 60));
  const out = src.replace(anchor, () => replacement);
  if (out === src) throw new Error('harness defect: mutation changed nothing');
  return out;
}
function mutantFails(label, mutatedRepair, rowIds) {
  check('MUT ' + label + ' -> ' + rowIds.join(', ') + ' fail', () => {
    // positive control: the unmutated source passes the same rows
    FACTORY = real;
    for (const id of rowIds) assert.doesNotThrow(() => ROWS[id](), 'positive control ' + id);
    assert.doesNotThrow(() => build(mutatedRepair, PARSE_SRC), 'the mutant must compile, or a failing row proves nothing');
    FACTORY = () => build(mutatedRepair, PARSE_SRC);
    try {
      for (const id of rowIds) {
        let threw = false;
        try { ROWS[id](); } catch (e) { threw = !(e && /harness defect/.test(e.message)); }
        assert.ok(threw, 'row ' + id + ' still passes under mutation "' + label + '"');
      }
    } finally { FACTORY = real; }
  });
}
mutantFails('RP-0 removed (structural trailing comma kept)',
  mutate(REPAIR_SRC, "return n === RB || n === ']';", 'return false;'), ['AR-5']);
mutantFails('RP-1 removed (no cut after the balanced end)',
  mutate(REPAIR_SRC, 'if (stack.length === 0) { done = true; end = i; }', 'if (stack.length === 0) { done = false; end = i; }'), ['AR-4', 'AN-5']);
mutantFails('RP-2 removed (no closers appended)',
  mutate(REPAIR_SRC, "cand = out.join('') + tail;", 'cand = null;'), ['AR-2']);
mutantFails('RP-3 removed (interior quote not escaped)',
  mutate(REPAIR_SRC, String.raw`else out.push('\\"');`, 'else out.push(c);'), ['AR-3', 'AR-3b']);
mutantFails('SC removed (no key / ticker check)',
  mutate(REPAIR_SRC, '.length) return legacy(sliced);\n  return cand;', '.length) {}\n  return cand;'), ['AN-2', 'AN-3', 'AN-8']);
mutantFails('RP-3 applied to keys',
  mutate(REPAIR_SRC, "if (kind === 'key' || j >= s.length ||", 'if (j >= s.length ||'), ['AN-1']);
mutantFails('a repair that changes a number',
  mutate(REPAIR_SRC, "out.push(s.slice(i, j)); t.m = 'after';", "out.push(s.slice(i, j).replace(/\\d/, '9')); t.m = 'after';"), ['AN-4']);
mutantFails('RP-2 also closes a string cut off mid-way',
  mutate(mutate(REPAIR_SRC, "else if (ok && !inStr && stack.length > 0 && stack[stack.length - 1].m === 'after') {", 'else if (ok && stack.length > 0) {'),
    "let tail = '';", "let tail = inStr ? '\"' : '';"), ['AN-6']);
mutantFails('RP-2 also closes after a comma / inside a key',
  mutate(mutate(REPAIR_SRC, "else if (ok && !inStr && stack.length > 0 && stack[stack.length - 1].m === 'after') {", 'else if (ok && !inStr && stack.length > 0) {'),
    "cand = out.join('') + tail;", "cand = out.join('').replace(/,\\s*$/, '') + tail;"), ['AN-7']);

console.log('');
if (failures.length) { console.log('FAIL ' + failures.length + ' row(s): ' + failures.join(', ')); process.exit(1); }
console.log('OK ' + pass + ' ai-parse-repair assertion(s) passed');
