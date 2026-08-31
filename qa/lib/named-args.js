'use strict';

/*
 * qa/lib/named-args.js
 *
 * WU-WFT slice S2+S4 (S4) — shared named-args parser for the repo's Node CLIs.
 *
 * WHY THIS EXISTS (F8 argv family). Four call sites hand-roll argv parsing today
 * (.claude/skills/arc-worker/scripts/phase-gate.js, .claude/skills/arc-publish-plan/scripts/
 * resolve-profiles.js, qa/arc_multi_arc_offline.js, qa/arc_runtime_ops_offline.js). The
 * recorded failures were never about the flag vocabulary — they were about INDEXING and
 * ARITY. Three are on record (2026-08-28_pilot-close-pc-closeout.MAIN.md, pattern P1,
 * "the session's most expensive defect"):
 *
 *   1. A script file used argv[2] as the first user arg where the harness ran it under
 *      `node -e` (argv[1] is the first user arg there) -> spurious P-V10 REFUSED, the
 *      authority mutex auto-released, publish restarted.
 *   2. A `node -e` validator was passed a dummy first argument, shifting every index by
 *      one -> a stray untracked file written into the repo root. This is the only
 *      unintended repository write of that session: an argv defect CAN write where it
 *      should not.
 *   3. An argument was simply not passed; nothing asserted arity before dereferencing, so
 *      two read-only verification blocks aborted on `undefined/...`. It happened inside
 *      the phase verifying this very pattern, which is the strongest available evidence
 *      that awareness alone does not prevent it.
 *
 * Root cause, quoted: `process.argv` layout differs between `node -e` (argv[1] = first
 * user arg) and a script file (argv[2] = first user arg), and no invocation asserted its
 * own arity before dereferencing. `userArgv()` removes the first; `parse()` removes the
 * second and third.
 *
 * RECORDED NON-GOALS. Two further argv incidents are on record and are deliberately NOT
 * addressed here, because they are spawn/shell quoting defects rather than parser defects
 * and no in-process parser can fix them:
 *   - spawnSync(bash, ['-c', <multi-line script>]) re-quoted by Windows argv rules; bash
 *     reported `unexpected EOF` on a script `bash -n` accepted
 *     (2026-08-22_p-e-multi-arc-publisher.MAIN.md). Remedy: write the sequence to a file
 *     and run `bash <file>`.
 *   - An inline `node -e` carrying backslashes died on Windows argv escaping
 *     (2026-08-26_b6-1-a-v5-executable-hardening.MAIN.md, pattern P-2). Same remedy.
 * They are named so a later reader does not mistake this helper for a fix to them.
 *
 * CONTRACT. Pure Node, no network, no filesystem access, no writes, no `process.exit`.
 * Nothing here throws on bad USER input — every rejection is returned as
 * `{ values: null, error: '<reason>' }` so each caller keeps ownership of its own usage
 * text and exit code. A malformed SPEC (a caller bug, not user input) does throw, because
 * that is a programming error that must not be swallowed.
 *
 * Consumes-only relationship to WU-PHG's future canonical `harnessModeOf` helper: this
 * module defines no mode vocabulary and no mode helper.
 */

/**
 * Slice a raw `process.argv` down to just the user arguments, correctly under BOTH
 * invocation forms. This is the fix for recorded mechanisms 1 and 2.
 *
 *   node script.js a b   ->  [execPath, /abs/script.js, 'a', 'b']   user args start at 2
 *   node -e '...' a b    ->  [execPath, 'a', 'b']                   user args start at 1
 *
 * `require.main` is the discriminator: Node leaves it undefined under `-e`/`--eval` and
 * sets it to the entry module when running a file. Callers must never compute the base
 * index themselves.
 *
 * @param {string[]} [processArgv] defaults to the live process.argv
 * @param {{evalMode?: boolean}} [opts] force the form instead of detecting it (tests)
 * @returns {string[]} the user arguments only
 */
function userArgv(processArgv, opts) {
  var argv = Array.isArray(processArgv) ? processArgv : process.argv;
  var evalMode = opts && typeof opts.evalMode === 'boolean'
    ? opts.evalMode
    : require.main === undefined;
  return argv.slice(evalMode ? 1 : 2);
}

function isFlagLike(token) {
  // A value may legitimately be negative ("-1", "-3.5") or a bare "-"; neither is a flag.
  return typeof token === 'string'
    && token.length > 1
    && token.charAt(0) === '-'
    && !/^-\d/.test(token)
    && token !== '--';
}

function specKeys(spec) {
  var out = [];
  var group;
  for (group in spec) {
    if (group !== 'value' && group !== 'boolean') continue;
    for (var flag in spec[group]) out.push(flag);
  }
  return out;
}

/**
 * Parse named arguments against an explicit spec.
 *
 * spec = {
 *   value:    { '--plan': 'plan' },      // flags that consume the NEXT token
 *   boolean:  { '--ladder': 'ladder' },  // presence-only flags
 *   aliases:  { '-h': '--help' },        // optional
 *   required: ['--plan']                 // optional; checked after the walk
 * }
 *
 * Returns `{ values, error }` — exactly one of the two is meaningful:
 *   success -> { values: {...}, error: null }   booleans always present (false by default)
 *   failure -> { values: null, error: '<reason>' }
 *
 * Rejects, each of which is a recorded or adjacent failure mode:
 *   - a value-taking flag in final position with nothing to consume  (arity, mechanism 3)
 *   - a value-taking flag whose value is itself flag-shaped          (shift detection)
 *   - an unknown argument                                            (typos, stray args)
 *   - a repeated flag                                                (ambiguous intent)
 *   - a positional argument                                          (this parser is named-only)
 *   - a missing required flag                                        (arity, mechanism 3)
 *
 * @param {string[]} argv user arguments ONLY — pass userArgv(), never raw process.argv
 * @param {object} spec
 * @returns {{values: object|null, error: string|null}}
 */
function parse(argv, spec) {
  if (!spec || typeof spec !== 'object') throw new TypeError('named-args: spec object is required');
  if (!Array.isArray(argv)) throw new TypeError('named-args: argv must be an array of user arguments');

  var value = spec.value || {};
  var bool = spec.boolean || {};
  var aliases = spec.aliases || {};
  var required = spec.required || [];

  // Caller-bug guard: the same flag in both groups is unresolvable, so fail loudly at
  // wire-up time rather than resolving it arbitrarily at runtime.
  for (var dup in value) {
    if (Object.prototype.hasOwnProperty.call(bool, dup)) {
      throw new Error('named-args: spec lists ' + dup + ' as both a value flag and a boolean flag');
    }
  }

  var values = {};
  for (var b in bool) values[bool[b]] = false;

  var seen = {};
  for (var i = 0; i < argv.length; i += 1) {
    var raw = argv[i];
    var token = Object.prototype.hasOwnProperty.call(aliases, raw) ? aliases[raw] : raw;

    if (Object.prototype.hasOwnProperty.call(value, token)) {
      if (seen[token]) return { values: null, error: 'repeated argument ' + token };
      if (i + 1 >= argv.length) return { values: null, error: token + ' needs a value' };
      var next = argv[i + 1];
      if (isFlagLike(next)) {
        return { values: null, error: token + ' needs a value but was followed by ' + next };
      }
      seen[token] = true;
      values[value[token]] = next;
      i += 1;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(bool, token)) {
      if (seen[token]) return { values: null, error: 'repeated argument ' + token };
      seen[token] = true;
      values[bool[token]] = true;
      continue;
    }

    if (isFlagLike(token)) {
      return { values: null, error: 'unknown argument ' + raw + ' (known: ' + specKeys(spec).sort().join(' ') + ')' };
    }
    // A bare token here means indices shifted, or a positional was passed to a named-only
    // parser. Mechanism 2 presented exactly this way, so it is an error, never ignored.
    return { values: null, error: 'unexpected positional argument ' + raw + '; this parser accepts named arguments only' };
  }

  for (var r = 0; r < required.length; r += 1) {
    if (!seen[required[r]]) return { values: null, error: required[r] + ' is required' };
  }

  return { values: values, error: null };
}

module.exports = { parse: parse, userArgv: userArgv, isFlagLike: isFlagLike };
