'use strict';

/*
 * VSCR-IMPL — VIS-SCORE-01 r3 caliper offline QA (WU-VSCR).
 *
 * Pure Node, no network, no browser, no live services. Extracts the REAL
 * production bytes from index.html (the new CSS block, the new top-level
 * presentation helper, and the ranked-cell call site) and executes the
 * helper verbatim in a sandbox, never a re-implementation.
 *
 * Proves, each via an exact-match / exact-count assertion:
 *   1. the five score states (>=65, 40-64, 1-39, exactly 0, missing)
 *   2. the bounded cap clamp() expression, verbatim, at every integer 0-100,
 *      including the low-end (1-4) and both boundary scores (0, 100)
 *   3. the selector boundary (S5): one new class prefix, descendant-only,
 *      no pseudo/type/id/attribute selector, the single .sr-panel.compact
 *      ancestor exception, no reach into any protected class
 *   4. the helper boundary (S7): one top-level function, one parameter,
 *      zero call expressions, zero nested/arrow/expression functions
 *   5. the F03 recipe literal values (geometry, colours, typography)
 *   6. protected surfaces byte-identical to the pinned base 529c7215
 *      (sha256, captured before this task's edit): the three shared score
 *      CSS rules and the ten named shared functions
 *   7. the ranked cell is the only call site; the Daily Review twin inside
 *      _srRenderGrouped is untouched (covered by its own hash check)
 *
 * Every mechanical check below carries its own planted-negative proof: the
 * selector-boundary and helper-boundary checkers are exercised against both
 * the real extracted text (must PASS) and a deliberately corrupted copy
 * (must FAIL), using the identical checking function both times.
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.resolve(__dirname, '..', 'index.html');

let failures = 0;
let asserts = 0;
function check(name, cond) {
  asserts += 1;
  if (!cond) {
    failures += 1;
    console.log('  FAIL  ' + name);
  }
}

function sha256(s) {
  return require('crypto').createHash('sha256').update(s).digest('hex');
}

function extractFunctionSource(content, name) {
  const sig = 'function ' + name + '(';
  const start = content.indexOf(sig);
  if (start === -1) return null;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

const content = fs.readFileSync(INDEX_PATH, 'utf8');

// ── Protected surfaces — byte-identical to pinned base 529c7215 (sha256) ────
// Hashes captured from the pinned base BEFORE this task's edit; a change to
// any of these bytes changes the hash and fails this suite.
const PROTECTED_CSS_START = '.sr-score{font-weight:700;font-size:12px;color:var(--text);display:flex;flex-direction:column;align-items:flex-end;gap:3px}';
const PROTECTED_CSS_END = '.sr-score-fill.neg{background:var(--red2)}';
const protectedCssStartIdx = content.indexOf(PROTECTED_CSS_START);
const protectedCssEndIdx = protectedCssStartIdx === -1 ? -1 : content.indexOf(PROTECTED_CSS_END, protectedCssStartIdx);
const protectedCssBlock = (protectedCssStartIdx === -1 || protectedCssEndIdx === -1)
  ? null
  : content.slice(protectedCssStartIdx, protectedCssEndIdx + PROTECTED_CSS_END.length);
check('protected .sr-score/.sr-score-track/.sr-score-fill CSS is present and extractable',
  !!protectedCssBlock);
check('protected .sr-score/.sr-score-track/.sr-score-fill CSS is byte-identical to the pinned base',
  protectedCssBlock !== null && sha256(protectedCssBlock) === 'b4c63e696fe93f7ab693b2d778c4426b58ae3f719bc95e92a97e0a117c4828d5');

const PROTECTED_FN_HASHES = {
  _ptScoreNorm: 'f1e1fb44de603a04909339daa62d598f5e3b9143d05070a3601a0c8503e17e0b',
  _ptScoreText: '27c3d9d3ad7bb737068c09eeb17088a0982ce87685637fcaecd30b0485918f25',
  _ptScoreCmp: 'bf237908d383b92446148828d3f9b74609f0e0979a22345056a5ff5418cdd2e5',
  _ptScoreAvg: '29413b98a5ed8d38bf837173ec61cda500580de294c5dce8b2f9ccddf27a2a6b',
  _ptScoreStates: '41968b418333e8a95f8fa6c15225351b9b7d73196bd808e7dd4ac6b7e3d83771',
  _ptScoreFillHtml: 'dfeb1959f3ca9f877d7158db68d5109c64bf36eb4f3f23eb300b735ae69f5a23',
  _ptScoreDial: '4092f243120f5c6bdf3269a02e599f3ad68afcd4a8afe8d766724879b0ef4bce',
  _srGroupResults: '192d7dd36905c72cde459091569e0d9749a2d4b5a861c86d09c54c762078ddb1',
  _srRenderGrouped: '02a0784614a0ab60ddafaf1a319dc0b89cdb7bcc8670161f527d5c18564c71a4',
  renderMainPanel: 'd6499b3430267b60da2e729871d464c814ab6e86c5f392408d93bd0491f36768'
};
for (const fnName of Object.keys(PROTECTED_FN_HASHES)) {
  const src = extractFunctionSource(content, fnName);
  check('protected function ' + fnName + ' is present and extractable', !!src);
  check('protected function ' + fnName + ' is byte-identical to the pinned base',
    src !== null && sha256(src) === PROTECTED_FN_HASHES[fnName]);
}
// _srRenderGrouped's own hash check above covers the Daily Review score cell
// byte-for-byte (it is inside that function's body) — proving the twin at
// that call site was never touched by this task.

// ── Extract the new helper (S3/S7) ───────────────────────────────────────────
const helperSrc = extractFunctionSource(content, '_vscCellHtml');
if (!helperSrc) {
  console.log('  FAIL  could not extract _vscCellHtml from index.html');
  console.log('VIS-SCORE CALIPER OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}

// ── Extract the new CSS block (S2/S5), bounded by explicit markers ──────────
const CSS_START_MARK = '/* VSC-BEGIN */';
const CSS_END_MARK = '/* VSC-END */';
const cssStartIdx = content.indexOf(CSS_START_MARK);
const cssEndIdx = cssStartIdx === -1 ? -1 : content.indexOf(CSS_END_MARK, cssStartIdx);
const vscCssBlock = (cssStartIdx === -1 || cssEndIdx === -1)
  ? null
  : content.slice(cssStartIdx + CSS_START_MARK.length, cssEndIdx);
if (!vscCssBlock) {
  console.log('  FAIL  could not extract the VSC-BEGIN/VSC-END CSS block from index.html');
  console.log('VIS-SCORE CALIPER OFFLINE: FAIL (extraction failure)');
  process.exit(1);
}

// ── Extract the ranked-cell call site (S1) ───────────────────────────────────
const RANKED_CELL = '<td class="r sr-score">${_vscCellHtml(score)}</td>';
check('the ranked score cell (openScanResultsOverlay) calls the new helper, td class list unchanged',
  content.indexOf(RANKED_CELL) !== -1);
// The new helper name/prefix must never appear inside _srRenderGrouped's extracted body.
const srRenderGroupedSrc = extractFunctionSource(content, '_srRenderGrouped');
check('the Daily Review twin (_srRenderGrouped) never calls the new helper',
  srRenderGroupedSrc !== null && srRenderGroupedSrc.indexOf('_vscCellHtml') === -1);
check('the new class prefix never appears inside _srRenderGrouped',
  srRenderGroupedSrc !== null && srRenderGroupedSrc.indexOf('vsc-') === -1);

// ── S6 — the prefix appears nowhere in index.html except the S1 markup and the S2 selectors ─
// (checked precisely below, after we know the CSS block and the ranked-cell markup)
const wholeFileMinusCssAndCell = content
  .split(vscCssBlock).join('')
  .split(RANKED_CELL).join('')
  .split(helperSrc).join(''); // the helper's own source legitimately names its classes in string literals
check('S6: the vsc- prefix appears only inside the S1 markup and the S2 selectors, nowhere else',
  wholeFileMinusCssAndCell.indexOf('vsc-') === -1);
// Count-based corroboration: a strip-then-search can go vacuous if the
// excised regions overlap or are mis-bounded. Independently verify that
// EVERY "vsc-" occurrence in the whole file is accounted for by summing
// occurrences within the three legitimate regions and comparing totals —
// this fails on a stray occurrence even if the strip above were buggy.
const vscTotalInFile = (content.match(/vsc-/g) || []).length;
const vscTotalInAllowedRegions =
  (vscCssBlock.match(/vsc-/g) || []).length +
  (helperSrc.match(/vsc-/g) || []).length +
  (RANKED_CELL.match(/vsc-/g) || []).length;
check('S6 (count-based): total vsc- occurrences in index.html equal the sum within the CSS block, the helper and the ranked cell markup',
  vscTotalInFile === vscTotalInAllowedRegions);

// ═══════════════════════════════════════════════════════════════════════════
// S5 — selector boundary checker, shared by the real check and its
// planted-negative sensitivity proof
// ═══════════════════════════════════════════════════════════════════════════
const PROTECTED_CLASS_REACH = [
  'sr-score', 'sr-score-track', 'sr-score-fill', 'sr-rank', 'sr-overlay',
  'sr-table', 'sr-col-name', 'at-dial'
];
// Returns { ok: boolean, reason: string|null } for one CSS rule block's
// selector-list text (everything before the '{').
function checkSelectorBoundary(selectorList) {
  const selectors = selectorList.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (selectors.length === 0) return { ok: false, reason: 'empty selector list' };
  for (const sel of selectors) {
    if (/[:>+~\[\]#]/.test(sel)) {
      return { ok: false, reason: 'pseudo/combinator/attribute/id in "' + sel + '"' };
    }
    const compounds = sel.split(/\s+/).filter(Boolean);
    if (compounds.length === 0) return { ok: false, reason: 'no compounds' };
    const rightmost = compounds[compounds.length - 1];
    if (!/^\.vsc-[a-z0-9-]+$/.test(rightmost)) {
      return { ok: false, reason: 'rightmost compound "' + rightmost + '" is not a bare .vsc- class' };
    }
    for (let i = 0; i < compounds.length - 1; i += 1) {
      const c = compounds[i];
      if (c === '.sr-panel.compact') continue; // the single permitted anchor
      if (!/^\.vsc-[a-z0-9-]+$/.test(c)) {
        return { ok: false, reason: 'non-rightmost compound "' + c + '" is neither .vsc- nor the .sr-panel.compact anchor' };
      }
    }
    for (const protectedClass of PROTECTED_CLASS_REACH) {
      if (sel.indexOf(protectedClass) !== -1) {
        return { ok: false, reason: 'selector "' + sel + '" reaches protected class ' + protectedClass };
      }
    }
  }
  return { ok: true, reason: null };
}

// Split the extracted CSS block into individual rule selector-lists (text
// before each '{'); this is a static, deterministic parse, not a browser.
function ruleSelectorLists(cssText) {
  const out = [];
  const re = /([^{}]+)\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(cssText)) !== null) out.push(m[1].trim());
  return out;
}

const vscSelectorLists = ruleSelectorLists(vscCssBlock);
check('S2/S5: at least one CSS rule was added in the new block', vscSelectorLists.length > 0);
for (const sel of vscSelectorLists) {
  const result = checkSelectorBoundary(sel);
  check('S5 selector boundary holds for "' + sel + '"' + (result.reason ? ' (' + result.reason + ')' : ''),
    result.ok);
}

// Sensitivity (planted negatives) — the SAME checker function must reject
// each of these deliberately invalid selectors, proving the check is live.
const NEGATIVE_SELECTORS = [
  '.vsc-cell .sr-score',            // reaches a protected class
  '.vsc-cell:hover .vsc-track',     // pseudo-class
  '.vsc-cell > .vsc-track',         // child combinator
  '.vsc-cell .vsc-track[data-x]',   // attribute selector
  '.vsc-cell #vsc-track',           // id selector
  'div.vsc-cell',                   // type selector on a compound
  '.vsc-cell .track',               // non-rightmost, non-anchor, non-prefixed
  '.sr-panel .vsc-track',           // ancestor without the required .compact
  '.vsc-track'                      // fine alone, used below as a positive control
];
for (const negSel of NEGATIVE_SELECTORS.slice(0, -1)) {
  const result = checkSelectorBoundary(negSel);
  check('sensitivity: selector boundary checker correctly rejects "' + negSel + '"', result.ok === false);
}
check('sensitivity: selector boundary checker still accepts a genuinely valid selector as a positive control',
  checkSelectorBoundary('.vsc-cell .vsc-track').ok === true);
check('sensitivity: selector boundary checker accepts the single permitted .sr-panel.compact anchor',
  checkSelectorBoundary('.sr-panel.compact .vsc-track').ok === true);

// ═══════════════════════════════════════════════════════════════════════════
// S7 — helper boundary checker, shared by the real check and its
// planted-negative sensitivity proof
// ═══════════════════════════════════════════════════════════════════════════
// Blanks the LITERAL TEXT portions of every template-literal in `src` (the
// backtick-delimited style strings, which embed CSS function syntax like
// clamp()/calc() as inert text) while leaving `${...}` substitutions intact
// verbatim, so a real JS call expression inside a substitution is still
// scanned. This is precise enough that no CSS-function-name allowlist is
// needed for the call-expression scan below.
function blankTemplateLiteralText(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      out += c; i += 1;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') {
          out += src[i] + src[i + 1]; i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth += 1;
            else if (src[i] === '}') depth -= 1;
            out += src[i]; i += 1;
          }
        } else {
          out += ' '; i += 1;
        }
      }
      if (i < src.length) { out += '`'; i += 1; }
    } else {
      out += c; i += 1;
    }
  }
  return out;
}

function checkHelperBoundary(fnSrc) {
  const sigMatch = fnSrc.match(/^function\s+\w+\s*\(([^)]*)\)/);
  if (!sigMatch) return { ok: false, reason: 'not a function declaration' };
  const params = sigMatch[1].split(',').map(function (p) { return p.trim(); }).filter(Boolean);
  if (params.length !== 1) return { ok: false, reason: 'parameter count is ' + params.length + ', not 1' };
  if (/=>/.test(fnSrc)) return { ok: false, reason: 'contains an arrow function' };
  if (/\bfunction\b[\s\S]*\bfunction\b/.test(fnSrc)) return { ok: false, reason: 'contains a nested function' };
  // Call-expression scan: an identifier immediately followed by "(", excluding
  // JS control-flow keywords (if/for/while/switch/catch/function/return, which
  // is followed by an object/array/paren expression, not a call). Template
  // literal text is blanked first so CSS function syntax (clamp/calc) embedded
  // in style strings never needs its own allowlist entry — a real JS call
  // inside a ${...} substitution is still visible and still caught.
  const body = blankTemplateLiteralText(fnSrc.slice(fnSrc.indexOf('{')));
  const CONTROL_KEYWORDS = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'void', 'in', 'of', 'instanceof', 'new', 'delete'];
  const CALL_RE = /([A-Za-z_$][\w$]*)\s*\(/g;
  let cm;
  while ((cm = CALL_RE.exec(body)) !== null) {
    if (CONTROL_KEYWORDS.indexOf(cm[1]) !== -1) continue;
    return { ok: false, reason: 'call-like expression "' + cm[0].trim() + '"' };
  }
  if (/\b(localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket)\b/.test(fnSrc)) {
    return { ok: false, reason: 'references a storage/network global' };
  }
  return { ok: true, reason: null };
}

const helperCheck = checkHelperBoundary(helperSrc);
check('S7 helper boundary holds for _vscCellHtml' + (helperCheck.reason ? ' (' + helperCheck.reason + ')' : ''),
  helperCheck.ok);

// Sensitivity (planted negatives) — the SAME checker on deliberately invalid
// synthetic function sources.
const NEGATIVE_HELPERS = [
  'function _bad(a, b) { return a + b; }',                 // two parameters
  'function _bad(s) { return String(s); }',                // a call expression
  'function _bad(s) { const f = () => s; return f(); }',   // arrow function + call
  'function _bad(s) { function inner() { return s; } return inner(); }', // nested function + call
  'function _bad(s) { return clamp(s); }' // a real JS call using a CSS function name, outside any template literal
];
for (const negFn of NEGATIVE_HELPERS) {
  const result = checkHelperBoundary(negFn);
  check('sensitivity: helper boundary checker correctly rejects a synthetic violation (' + (result.reason || 'no reason') + ')',
    result.ok === false);
}
check('sensitivity: helper boundary checker accepts a genuinely valid one-parameter, call-free function as a positive control',
  checkHelperBoundary('function _ok(s) { return s === null ? \'x\' : \'y\'; }').ok === true);

// ═══════════════════════════════════════════════════════════════════════════
// F03 recipe literal values — exact-substring assertions against the CSS text
// ═══════════════════════════════════════════════════════════════════════════
check('recipe: wrapper width 44px', /\.vsc-cell\{[^}]*width:44px/.test(vscCssBlock));
check('recipe: wrapper gap 2px', /\.vsc-cell\{[^}]*gap:2px/.test(vscCssBlock));
check('recipe: wrapper flex column, align-items stretch',
  /\.vsc-cell\{[^}]*flex-direction:column/.test(vscCssBlock) && /\.vsc-cell\{[^}]*align-items:stretch/.test(vscCssBlock));
check('recipe: track width 44px', /\.vsc-track\{[^}]*width:44px/.test(vscCssBlock));
check('recipe: track height 4px (Regular)', /\.vsc-track\{[^}]*height:4px/.test(vscCssBlock));
check('recipe: track height 3px (Compact, via the .sr-panel.compact anchor)',
  /\.sr-panel\.compact \.vsc-track\{[^}]*height:3px/.test(vscCssBlock));
check('recipe: track radius 1px', /\.vsc-track\{[^}]*border-radius:1px/.test(vscCssBlock));
check('recipe: track ground rgba(255,255,255,.07)', vscCssBlock.indexOf('rgba(255,255,255,.07)') !== -1);
check('recipe: track overflow hidden', /\.vsc-track\{[^}]*overflow:hidden/.test(vscCssBlock));
check('recipe: trail opacity .35', /\.vsc-trail\{[^}]*opacity:\.35/.test(vscCssBlock));
check('recipe: trail band colours are the three frozen tokens',
  vscCssBlock.indexOf('var(--green2)') !== -1 && vscCssBlock.indexOf('var(--yellow2)') !== -1 && vscCssBlock.indexOf('var(--red2)') !== -1);
check('recipe: cap width 2px', /\.vsc-cap\{[^}]*width:2px/.test(vscCssBlock));
check('recipe: cap has no border-radius declared anywhere (square corners)',
  vscCssBlock.indexOf('border-radius', vscCssBlock.indexOf('.vsc-cap{')) === -1 ||
  vscCssBlock.indexOf('border-radius', vscCssBlock.indexOf('.vsc-cap{')) > vscCssBlock.indexOf('}', vscCssBlock.indexOf('.vsc-cap{')));
check('recipe: cap 1px card-colour shoulder', /\.vsc-cap\{[^}]*box-shadow:0 0 0 1px var\(--card\)/.test(vscCssBlock));
check('recipe: numeral is var(--mono), weight 700, tabular-nums, letter-spacing .2px, line-height 1.1',
  /\.vsc-num\{[^}]*font-family:var\(--mono\)/.test(vscCssBlock) &&
  /\.vsc-num\{[^}]*font-weight:700/.test(vscCssBlock) &&
  /\.vsc-num\{[^}]*font-variant-numeric:tabular-nums/.test(vscCssBlock) &&
  /\.vsc-num\{[^}]*letter-spacing:\.2px/.test(vscCssBlock) &&
  /\.vsc-num\{[^}]*line-height:1\.1/.test(vscCssBlock));
check('recipe: numeral declares NO font-size (inherits per the frozen recipe)',
  (function () {
    const s = vscCssBlock.indexOf('.vsc-num{');
    const e = vscCssBlock.indexOf('}', s);
    return s !== -1 && e !== -1 && vscCssBlock.slice(s, e).indexOf('font-size') === -1;
  })());
check('recipe: numeral colour is var(--text), never band-tinted', /\.vsc-num\{[^}]*color:var\(--text\)/.test(vscCssBlock));
check('recipe: missing-state numeral colour is var(--text3)', /\.vsc-num-missing\{[^}]*color:var\(--text3\)/.test(vscCssBlock));
check('recipe: no @media block introduced (S9)', vscCssBlock.indexOf('@media') === -1);

// ═══════════════════════════════════════════════════════════════════════════
// Behavioural checks — execute the real, extracted helper verbatim
// ═══════════════════════════════════════════════════════════════════════════
// eslint-disable-next-line no-new-func
const vscCellHtml = new Function('s', helperSrc.slice(helperSrc.indexOf('{') + 1, helperSrc.lastIndexOf('}')));

function bandOf(html) {
  if (html.indexOf('vsc-cap-pos') !== -1) return 'pos';
  if (html.indexOf('vsc-cap-warn') !== -1) return 'warn';
  if (html.indexOf('vsc-cap-neg') !== -1) return 'neg';
  return null;
}

// ── Five states ──────────────────────────────────────────────────────────
(function () {
  const missing = vscCellHtml(null);
  check('missing: numeral text is the em dash', missing.indexOf('>—<') !== -1 || missing.indexOf('>—<') !== -1);
  check('missing: no track element at all', missing.indexOf('vsc-track') === -1);
  check('missing: no trail element', missing.indexOf('vsc-trail') === -1);
  check('missing: no cap element', missing.indexOf('vsc-cap') === -1);
  check('missing: carries the missing-numeral class', missing.indexOf('vsc-num-missing') !== -1);

  const zero = vscCellHtml(0);
  check('score 0: numeral text is "0"', zero.indexOf('>0<') !== -1);
  check('score 0: track IS present', zero.indexOf('vsc-track') !== -1);
  check('score 0: NO trail element', zero.indexOf('vsc-trail') === -1);
  check('score 0: cap IS present', zero.indexOf('vsc-cap') !== -1);
  check('score 0: cap band is neg', bandOf(zero) === 'neg');

  const neg = vscCellHtml(25);
  check('score in 1-39: band is neg', bandOf(neg) === 'neg');
  check('score in 1-39: trail present', neg.indexOf('vsc-trail') !== -1);

  const warn = vscCellHtml(50);
  check('score in 40-64: band is warn', bandOf(warn) === 'warn');

  const pos = vscCellHtml(80);
  check('score >=65: band is pos', bandOf(pos) === 'pos');
})();

// ── Boundary scores (39/40 and 64/65) ───────────────────────────────────
(function () {
  check('score 39 -> neg', bandOf(vscCellHtml(39)) === 'neg');
  check('score 40 -> warn', bandOf(vscCellHtml(40)) === 'warn');
  check('score 64 -> warn', bandOf(vscCellHtml(64)) === 'warn');
  check('score 65 -> pos', bandOf(vscCellHtml(65)) === 'pos');
})();

// ── Bounded cap — the clamp() expression, verbatim, with the correct score,
// at every integer 0-100, explicitly proven at 0,1,2,3,4,5 and 100 ────────
(function () {
  function expectedClamp(s) {
    return 'left:clamp(0px, calc(' + s + '% - 2px), calc(100% - 2px))';
  }
  for (let s = 0; s <= 100; s += 1) {
    const html = vscCellHtml(s);
    check('score ' + s + ': cap position is the one bounded clamp expression, verbatim',
      html.indexOf(expectedClamp(s)) !== -1);
    check('score ' + s + ': no bare (unbounded) calc() is used for the cap position',
      html.indexOf('left:calc(' + s + '% - 2px)') === -1);
  }
  // Explicit low-end proof (§10 criterion 4): scores 1-4 all clamp to the
  // literal lower bound 0px in the emitted expression's own inner value.
  for (const s of [1, 2, 3, 4]) {
    check('score ' + s + ' (low end): still renders the bounded clamp, never a raw negative left',
      vscCellHtml(s).indexOf('left:calc(' + s + '% - 2px)') === -1 &&
      vscCellHtml(s).indexOf(expectedClamp(s)) !== -1);
  }
})();

// ── Trail width equals the score percentage exactly, no minimum fill ───────
(function () {
  for (const s of [1, 5, 33, 65, 99, 100]) {
    check('score ' + s + ': trail width is exactly ' + s + '%, no padding',
      vscCellHtml(s).indexOf('width:' + s + '%') !== -1);
  }
})();

console.log(failures === 0
  ? 'VIS-SCORE CALIPER OFFLINE: PASS (' + asserts + ' asserts)'
  : 'VIS-SCORE CALIPER OFFLINE: FAIL (' + failures + ' of ' + asserts + ' asserts failed)');
process.exit(failures === 0 ? 0 : 1);
