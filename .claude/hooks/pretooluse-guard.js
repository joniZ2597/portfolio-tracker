#!/usr/bin/env node
'use strict';

/*
 * PreToolUse guard for the Bash and PowerShell tools
 * (work/auto-mode-hardening/brief.md §4, rulings R1-R5).
 *
 * decide({ tool_name, tool_input, cwd }) -> { decision: 'allow' | 'ask' | 'deny', reason }
 * The hook never grants anything: 'allow' means "no opinion", the normal permission rules
 * still apply. Node only, no dependencies.
 *
 * Fail closed: unparseable stdin, a missing / non-string command, any thrown error, and any
 * command this parser cannot fully resolve all block (exit 2). Claude Code treats every other
 * non-zero exit as non-blocking, so exit 2 is the only blocking code.
 *
 * Only program / subcommand positions are classified: a commit message or echo text that
 * merely contains the words "git push" is not a git push.
 */

const FAIL_CLOSED_EXIT = 2;
const MAX_WRAPPER_DEPTH = 6;
const MAX_GROUP_LEVEL = 8;

// R1: a session whose cwd is (or is under) a Worker slot gets the strict column.
const SLOT_DIR_RE = /(^|\/)pt-wt-worker-[ab](\/|$)/;

const INTEGRATION_SUBCOMMANDS = ['push', 'merge', 'rebase'];
const HARD_RESET_FLAG = '--hard';
const MAIN_TARGETS = ['main', 'origin/main'];
const NETLIFY_WRITE = ['deploy', 'env:set', 'env:unset', 'env:clone', 'env:import', 'sites:create', 'sites:delete', 'api', 'link', 'unlink'];
const NETLIFY_ENV_WRITE_WORDS = ['set', 'unset', 'clone', 'import'];

const POSIX_SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh'];
const GENERIC_WRAPPERS = ['nohup', 'time', 'command', 'exec', 'builtin', 'sudo', 'nice', 'timeout'];
const PACKAGE_RUNNERS = ['npx', 'pnpx', 'bunx'];
const SHELL_KEYWORDS = ['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '&'];

// Protected files (brief §4 "Protected-file write"). Sources are tested against a normalised
// path (lowercase, forward slashes, collapsed) and, for interpreter code, against the whole text.
const PROTECTED_SOURCES = [
  '(?<![\\w-])\\.claude/settings[\\w.-]*\\.json(?![\\w.-])',
  '(?<![\\w-])\\.claude/hooks(?:/|(?![\\w.-]))',
  '(?<![\\w-])\\.claude/rules(?:/|(?![\\w.-]))',
  '(?<![\\w.-])claude\\.md(?![\\w.-])',
  '(?<![\\w.-])agents\\.md(?![\\w.-])',
  '(?<![\\w.-])\\.gitignore(?![\\w.-])',
  '(?<![\\w.-])qa/run-offline\\.js(?![\\w.-])',
  '(?<![\\w.-])work/[^/\\s\'"]+/brief\\.md(?![\\w.-])',
  '(?<![\\w.-])netlify\\.toml(?![\\w.-])',
  '(?<![\\w.-])package\\.json(?![\\w.-])',
  '(?<![\\w.-])package-lock\\.json(?![\\w.-])'
];
const PROTECTED_RES = PROTECTED_SOURCES.map((s) => new RegExp(s));

const SPAWN_RE = /child_process|\bspawn\w*|\bexec\w*|subprocess|os\.system|\bPopen|\bsystem\s*\(|`/i;
const GIT_OR_NETLIFY_RE = /\b(git|netlify)\b/i;
const CODE_WRITE_RE = /writeFile|appendFile|createWriteStream|\brename|copyFile|\bunlink|write_text|write_bytes|\.write\s*\(|\bopen\s*\([^)]*,\s*['"][^'"]*[wa+][^'"]*['"]|os\.replace|shutil\.(copy|move)/i;

class Unresolvable extends Error {}

// ── path helpers ────────────────────────────────────────────────────────────────────────
function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}
function isProtectedText(text) {
  const n = normalizePath(text);
  return PROTECTED_RES.some((re) => re.test(n));
}
function basenameOf(p) {
  const s = String(p).replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
}
function progName(word) {
  return basenameOf(word).toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/, '');
}
function isWorkerSlot(cwd) {
  if (typeof cwd !== 'string' || !cwd) return true; // unknown session -> strict column
  return SLOT_DIR_RE.test(normalizePath(cwd));
}

// ── scanner: raw text -> flat list of raw segments ──────────────────────────────────────
// Splits on && || ; | & newline, quote-aware. Substitutions ($(..), `..`, unquoted (..) and
// {..} groups) are scanned recursively and their segments are added to the same flat list; the
// enclosing segment gets a placeholder. Heredoc bodies and PowerShell here-strings are skipped.
function scanCode(src, start, closer, out, level) {
  if (level > MAX_GROUP_LEVEL) throw new Unresolvable('nesting too deep');
  const n = src.length;
  let i = start;
  let cur = '';
  let pending = [];
  const flush = () => {
    if (cur.trim()) out.push(cur);
    cur = '';
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (closer && c === closer) {
      flush();
      return i + 1;
    }

    if (c === "'") {
      const e = src.indexOf("'", i + 1);
      if (e === -1) throw new Unresolvable('unbalanced single quote');
      cur += src.slice(i, e + 1);
      i = e + 1;
      continue;
    }

    if (c === '"') {
      cur += '"';
      i += 1;
      let closed = false;
      while (i < n) {
        const ch = src[i];
        const nx = src[i + 1];
        if (ch === '"') {
          cur += '"';
          i += 1;
          closed = true;
          break;
        }
        if ((ch === '\\' || ch === '`') && nx !== undefined && '"\\$`'.indexOf(nx) !== -1) {
          cur += ch + nx;
          i += 2;
          continue;
        }
        if (ch === '$' && nx === '(') {
          i = scanCode(src, i + 2, ')', out, level + 1);
          cur += '__SUB__';
          continue;
        }
        if (ch === '`' && src.indexOf('`', i + 1) !== -1) {
          i = scanCode(src, i + 1, '`', out, level + 1);
          cur += '__SUB__';
          continue;
        }
        cur += ch;
        i += 1;
      }
      if (!closed) throw new Unresolvable('unbalanced double quote');
      continue;
    }

    if (c === '@' && (next === "'" || next === '"')) {
      const m = /^@(['"])[ \t]*\r?\n/.exec(src.slice(i, i + 64));
      if (m) {
        const end = src.indexOf('\n' + m[1] + '@', i);
        if (end === -1) throw new Unresolvable('unterminated here-string');
        cur += '__HERESTRING__';
        i = end + 3;
        continue;
      }
    }

    if (c === '\\' && next !== undefined) {
      cur += c + next;
      i += 2;
      continue;
    }

    if (c === '`') {
      if (src.indexOf('`', i + 1) !== -1) {
        i = scanCode(src, i + 1, '`', out, level + 1);
        cur += '__SUB__';
      } else {
        cur += c;
        i += 1;
      }
      continue;
    }

    if (c === '$' && next === '(') {
      i = scanCode(src, i + 2, ')', out, level + 1);
      cur += '__SUB__';
      continue;
    }
    if (c === '(') {
      i = scanCode(src, i + 1, ')', out, level + 1);
      cur += '__SUB__';
      continue;
    }
    if (c === '{') {
      i = scanCode(src, i + 1, '}', out, level + 1);
      cur += '__SUB__';
      continue;
    }

    if (c === '<' && next === '<' && src[i + 2] !== '<') {
      let j = i + 2;
      let dash = false;
      if (src[j] === '-') { dash = true; j += 1; }
      while (src[j] === ' ' || src[j] === '\t') j += 1;
      let delim = '';
      if (src[j] === "'" || src[j] === '"') {
        const q = src[j];
        const e = src.indexOf(q, j + 1);
        if (e === -1) throw new Unresolvable('unbalanced heredoc delimiter');
        delim = src.slice(j + 1, e);
        j = e + 1;
      } else {
        while (j < n && !/[\s;&|<>()]/.test(src[j])) { delim += src[j]; j += 1; }
      }
      pending.push({ delim, dash });
      cur += src.slice(i, j);
      i = j;
      continue;
    }

    if (c === '\r' && next === '\n') {
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      flush();
      i += 1;
      for (const h of pending) {
        while (i < n) {
          const e = src.indexOf('\n', i);
          const line = src.slice(i, e === -1 ? n : e).replace(/\r$/, '');
          i = e === -1 ? n : e + 1;
          if ((h.dash ? line.replace(/^\t+/, '') : line) === h.delim) break;
        }
      }
      pending = [];
      continue;
    }

    if (c === ';') { flush(); i += 1; continue; }
    if (c === '|' && src[i - 1] !== '>') { flush(); i += 1; continue; }
    if (c === '&' && src[i - 1] !== '>' && src[i - 1] !== '<' && next !== '>') { flush(); i += 1; continue; }

    cur += c;
    i += 1;
  }

  if (closer) throw new Unresolvable('unterminated ' + closer + ' group');
  flush();
  return i;
}

// ── tokenizer: one raw segment -> words (quotes removed) + redirect targets ─────────────
function tokenize(raw) {
  const words = [];
  const redirects = [];
  const n = raw.length;
  let lastEnd = -1;

  function readWord(from) {
    let t = '';
    let j = from;
    while (j < n) {
      const c = raw[j];
      if (/\s/.test(c) || c === '<' || c === '>') break;
      if (c === "'") {
        const e = raw.indexOf("'", j + 1);
        if (e === -1) throw new Unresolvable('unbalanced single quote');
        t += raw.slice(j + 1, e);
        j = e + 1;
        continue;
      }
      if (c === '"') {
        j += 1;
        while (j < n && raw[j] !== '"') {
          if ((raw[j] === '\\' || raw[j] === '`') && j + 1 < n && '"\\$`'.indexOf(raw[j + 1]) !== -1) {
            t += raw[j + 1];
            j += 2;
          } else {
            t += raw[j];
            j += 1;
          }
        }
        if (j >= n) throw new Unresolvable('unbalanced double quote');
        j += 1;
        continue;
      }
      if (c === '\\' && j + 1 < n) {
        const nx = raw[j + 1];
        if (nx === ' ' || nx === '"' || nx === "'") { t += nx; j += 2; continue; }
        t += c;
        j += 1;
        continue;
      }
      t += c;
      j += 1;
    }
    return { text: t, end: j };
  }
  const skipWs = (j) => { while (j < n && /\s/.test(raw[j])) j += 1; return j; };

  let i = 0;
  while (i < n) {
    i = skipWs(i);
    if (i >= n) break;
    const c = raw[i];
    if (c === '<' || c === '>') {
      let op = c;
      let j = i + 1;
      if (c === '>' && raw[j] === '>') { op = '>>'; j += 1; }
      else if (c === '>' && raw[j] === '|') { op = '>|'; j += 1; }
      else if (c === '<' && raw[j] === '<') {
        op = '<<';
        j += 1;
        if (raw[j] === '<') { op = '<<<'; j += 1; } else if (raw[j] === '-') { j += 1; }
      }
      if (words.length && lastEnd === i && /^(\d+|&)$/.test(words[words.length - 1])) words.pop();
      let target = true;
      if (c === '>' && raw[j] === '&') {
        j += 1;
        const peek = readWord(skipWs(j));
        if (/^(\d+|-)$/.test(peek.text)) target = false;
      }
      const w = readWord(skipWs(j));
      i = w.end;
      if (c === '>' && target && w.text) redirects.push(w.text);
      void op;
      continue;
    }
    const w = readWord(i);
    if (w.end === i) { i += 1; continue; }
    words.push(w.text);
    lastEnd = w.end;
    i = w.end;
  }
  return { words, redirects };
}

// ── classification ──────────────────────────────────────────────────────────────────────
function analyze(code, depth, out) {
  if (depth > MAX_WRAPPER_DEPTH) throw new Unresolvable('wrapper nesting too deep');
  const segments = [];
  scanCode(code, 0, null, segments, 0);
  for (const raw of segments) {
    const { words, redirects } = tokenize(raw);
    for (const t of redirects) {
      if (isProtectedText(t)) out.push({ cls: 'protected', reason: 'redirect into protected file ' + t });
    }
    classifyWords(words, depth, out);
  }
}

function classifyWords(words, depth, out) {
  const w = words.slice();
  for (;;) {
    if (!w.length) return;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || SHELL_KEYWORDS.indexOf(w[0].toLowerCase()) !== -1) {
      w.shift();
      continue;
    }
    break;
  }
  const prog = progName(w[0]);
  const args = w.slice(1);

  if (prog === 'git') { out.push({ cls: 'git-program', reason: 'git via the PowerShell tool - denied (R2)' }); classifyGit(args, out); return; }
  if (prog === 'netlify' || prog === 'ntl') { classifyNetlify(args, out); return; }

  if (prog === 'env') { unwrapEnv(args, depth, out); return; }
  if (prog === 'xargs') { classifyWords(skipXargs(args), depth, out); return; }
  if (PACKAGE_RUNNERS.indexOf(prog) !== -1) { classifyWords(skipRunnerArgs(args), depth, out); return; }
  if ((prog === 'npm' || prog === 'pnpm' || prog === 'yarn') && (args[0] === 'exec' || args[0] === 'dlx')) {
    classifyWords(skipRunnerArgs(args.slice(1)), depth, out);
    return;
  }
  if (GENERIC_WRAPPERS.indexOf(prog) !== -1) { classifyWords(skipGenericWrapper(prog, args), depth, out); return; }

  if (POSIX_SHELLS.indexOf(prog) !== -1) {
    const k = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (k === -1) return;
    if (k + 1 >= args.length) throw new Unresolvable(prog + ' -c without a command');
    analyze(args[k + 1], depth + 1, out);
    return;
  }
  if (prog === 'cmd') { unwrapCmd(args, depth, out); return; }
  if (prog === 'powershell' || prog === 'pwsh') { unwrapPowerShell(args, depth, out); return; }
  if (prog === 'iex' || prog === 'invoke-expression') {
    const rest = /^-c(ommand)?$/i.test(args[0] || '') ? args.slice(1) : args;
    analyze(rest.join(' '), depth + 1, out);
    return;
  }
  if (prog === 'start-process' || prog === 'saps') { analyze(startProcessCommand(args), depth + 1, out); return; }
  if (prog === 'eval') { analyze(args.join(' '), depth + 1, out); return; }

  const code = interpreterCode(prog, args);
  if (code !== null) { classifyInterpreterCode(code, out); return; }

  classifyFileWrite(prog, args, out);
}

function skipGenericWrapper(prog, args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    i += prog === 'nice' && args[i] === '-n' ? 2 : 1;
  }
  if (prog === 'timeout' && i < args.length && /^\d/.test(args[i])) i += 1;
  return args.slice(i);
}
function unwrapEnv(args, depth, out) {
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) i += 1;
    else if (a === '-u' || a === '-C' || a === '--chdir' || a === '--unset') i += 2;
    else if (a === '-S' || a === '--split-string') {
      if (i + 1 < args.length) analyze(args[i + 1], depth + 1, out);
      i += 2;
    } else if (a.startsWith('-')) i += 1;
    else break;
  }
  classifyWords(args.slice(i), depth, out);
}
function skipXargs(args) {
  const valued = ['-I', '-n', '-P', '-d', '-E', '-L', '-l', '-s', '-a', '-J'];
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += valued.indexOf(args[i]) !== -1 ? 2 : 1;
  return args.slice(i);
}
function skipRunnerArgs(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '--') { i += 1; break; }
    i += args[i] === '-p' || args[i] === '--package' ? 2 : 1;
  }
  return args.slice(i);
}
function unwrapCmd(args, depth, out) {
  for (let k = 0; k < args.length; k += 1) {
    const m = /^\/([ckr])(.*)$/i.exec(args[k]);
    if (m) {
      const rest = (m[2] ? [m[2]] : []).concat(args.slice(k + 1));
      analyze(rest.join(' '), depth + 1, out);
      return;
    }
  }
}
function unwrapPowerShell(args, depth, out) {
  const valueFlags = ['executionpolicy', 'windowstyle', 'version', 'inputformat', 'outputformat', 'workingdirectory',
    'configurationname', 'custompipename', 'settingsfile', 'ep', 'wd'];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (!/^[-/]/.test(a)) { analyze(args.slice(i).join(' '), depth + 1, out); return; }
    const f = a.slice(1).toLowerCase().split(':')[0];
    if (f === 'e' || f === 'ec' || (f.length >= 2 && 'encodedcommand'.indexOf(f) === 0)) {
      const b64 = args[i + 1];
      if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Unresolvable('undecodable -EncodedCommand');
      const buf = Buffer.from(b64, 'base64');
      const text = buf.toString('utf16le');
      if (!buf.length || buf.length % 2 !== 0 || text.indexOf('�') !== -1) throw new Unresolvable('undecodable -EncodedCommand');
      analyze(text, depth + 1, out);
      return;
    }
    if (f.length >= 1 && 'command'.indexOf(f) === 0) {
      analyze(args.slice(i + 1).join(' '), depth + 1, out);
      return;
    }
    if (f.length >= 1 && 'file'.indexOf(f) === 0) return;
    i += valueFlags.some((v) => v.indexOf(f) === 0) ? 2 : 1;
  }
}
function startProcessCommand(args) {
  const parts = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith('-')) {
      const name = a.slice(1).toLowerCase();
      if (name === 'filepath' || name === 'argumentlist') {
        if (i + 1 < args.length) parts.push(args[i + 1]);
        i += 2;
      } else if (['nonewwindow', 'wait', 'passthru', 'usenewenvironment', 'loaduserprofile'].indexOf(name) !== -1) {
        i += 1;
      } else {
        i += 2;
      }
    } else {
      parts.push(a);
      i += 1;
    }
  }
  return parts.join(' ').replace(/,/g, ' ');
}

// ── git ─────────────────────────────────────────────────────────────────────────────────
function classifyGit(args, out) {
  const valued = ['--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source'];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '-C') i += 2;
    else if (a === '-c') {
      const kv = args[i + 1] || '';
      if (/^alias\./i.test(kv) && kv.indexOf('!') !== -1) out.push({ cls: 'destructive', reason: 'git alias with a shell escape (-c alias.*=!...)' });
      i += 2;
    } else if (valued.indexOf(a) !== -1) i += 2;
    else if (a.startsWith('-')) i += 1;
    else break;
  }
  if (i >= args.length) return;
  const sub = args[i].toLowerCase();
  const rest = args.slice(i + 1);
  const cluster = (a, chars) => /^-[a-zA-Z]+$/.test(a) && chars.split('').some((ch) => a.indexOf(ch) !== -1);

  if (sub === 'push') {
    const destructive = rest.some((a) => a === '--force' || a.startsWith('--force') || a === '--mirror' || a === '--delete' ||
      a === '--prune' || cluster(a, 'fd') || a.startsWith('+') || a.startsWith(':'));
    out.push(destructive
      ? { cls: 'destructive', reason: 'destructive git push (force / delete / mirror / +refspec / :ref)' }
      : { cls: 'integration', reason: 'git push' });
    return;
  }
  if (INTEGRATION_SUBCOMMANDS.indexOf(sub) !== -1) {
    out.push({ cls: 'integration', reason: 'git ' + sub });
    return;
  }
  if (sub === 'commit') {
    out.push({ cls: 'commit', reason: 'git commit needs Owner approval' });
    return;
  }
  if (sub === 'reset' && rest.some((a) => a === HARD_RESET_FLAG)) {
    out.push({ cls: 'destructive', reason: 'git reset --hard' });
    return;
  }
  if (sub === 'clean' && rest.some((a) => a === '--force' || cluster(a, 'f'))) {
    out.push({ cls: 'destructive', reason: 'git clean with force' });
    return;
  }
  if (sub === 'branch' && rest.some((a) => a === '--delete' || cluster(a, 'dD'))) {
    out.push({ cls: 'destructive', reason: 'git branch delete' });
    return;
  }
  if (sub === 'update-ref' && rest.some((a) => a === '-d' || a === '--delete')) {
    out.push({ cls: 'destructive', reason: 'git update-ref -d' });
    return;
  }
  if (sub === 'worktree' && rest[0] === 'remove' && rest.some((a) => a === '--force' || cluster(a, 'f'))) {
    out.push({ cls: 'destructive', reason: 'git worktree remove --force' });
    return;
  }
  if (sub === 'checkout' || sub === 'switch') {
    let flagTarget = null;
    let positional = null;
    for (let k = 0; k < rest.length; k += 1) {
      const a = rest[k];
      if (a === '--') break;
      if (['-b', '-B', '-c', '-C', '--orphan'].indexOf(a) !== -1) { flagTarget = rest[k + 1] || null; k += 1; }
      else if (a.startsWith('-')) continue;
      else if (positional === null) positional = a;
    }
    const target = (flagTarget !== null ? flagTarget : positional || '').toLowerCase().replace(/^refs\/(heads|remotes)\//, '');
    if (MAIN_TARGETS.indexOf(target) !== -1) {
      out.push({ cls: 'destructive', reason: 'git ' + sub + ' targeting main' });
    }
  }
}

// ── netlify ─────────────────────────────────────────────────────────────────────────────
function classifyNetlify(args, out) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += ['--auth', '--filter', '--cwd'].indexOf(args[i]) !== -1 ? 2 : 1;
  if (i >= args.length) return;
  const sub = args[i].toLowerCase();
  const isWrite = NETLIFY_WRITE.indexOf(sub) !== -1 ||
    (sub === 'env' && NETLIFY_ENV_WRITE_WORDS.indexOf((args[i + 1] || '').toLowerCase()) !== -1);
  if (isWrite) out.push({ cls: 'netlify', reason: 'netlify write (' + sub + ')' });
}

// ── interpreters ────────────────────────────────────────────────────────────────────────
function interpreterCode(prog, args) {
  const after = (idx) => args.slice(idx + 1).join(' ');
  if (prog === 'node' || prog === 'nodejs') {
    const k = args.findIndex((a) => /^(-e|-p|-pe|-ep|--eval|--print)$/.test(a) || /^--(eval|print)=/.test(a));
    if (k === -1) return null;
    return /=/.test(args[k]) && args[k].startsWith('--') ? args[k].slice(args[k].indexOf('=') + 1) + ' ' + after(k) : after(k);
  }
  if (/^(python[0-9.]*|py|pythonw)$/.test(prog)) {
    const k = args.findIndex((a) => /^-[a-zA-Z]*c$/.test(a));
    return k === -1 ? null : after(k);
  }
  if (prog === 'perl') {
    const k = args.findIndex((a) => /^-[a-zA-Z]*[eE]$/.test(a));
    return k === -1 ? null : after(k);
  }
  if (prog === 'ruby') {
    const k = args.findIndex((a) => /^-[a-zA-Z]*e$/.test(a));
    return k === -1 ? null : after(k);
  }
  if (prog === 'deno' && args[0] === 'eval') return args.slice(1).join(' ');
  return null;
}
function classifyInterpreterCode(code, out) {
  if (SPAWN_RE.test(code) && GIT_OR_NETLIFY_RE.test(code)) {
    out.push({ cls: 'interpreter', reason: 'interpreter code spawns a process referencing git/netlify' });
  }
  if (CODE_WRITE_RE.test(code) && isProtectedText(code)) {
    out.push({ cls: 'protected', reason: 'interpreter code writes a protected file' });
  }
}

// ── protected-file writers ──────────────────────────────────────────────────────────────
function classifyFileWrite(prog, args, out) {
  const positional = args.filter((a) => !a.startsWith('-'));
  const hit = (list, what) => {
    const t = list.find((a) => isProtectedText(a));
    if (t !== undefined) out.push({ cls: 'protected', reason: what + ' protected file ' + t });
  };
  if (prog === 'tee') { hit(positional, 'tee into'); return; }
  if ((prog === 'sed' || prog === 'gsed') && args.some((a) => /^(-i.*|--in-place.*|-[a-zA-Z]+i[a-zA-Z.]*)$/.test(a))) {
    hit(positional, 'sed -i on');
    return;
  }
  if (['cp', 'copy', 'xcopy', 'robocopy', 'copy-item', 'cpi', 'mv', 'move', 'move-item', 'mi', 'ren', 'rename-item'].indexOf(prog) !== -1) {
    let dest = null;
    for (let k = 0; k < args.length; k += 1) {
      if (/^(-t|--target-directory|-dest(ination)?)$/i.test(args[k]) && args[k + 1] !== undefined) dest = args[k + 1];
      else if (/^--target-directory=/.test(args[k])) dest = args[k].slice(args[k].indexOf('=') + 1);
    }
    if (dest === null && positional.length) dest = positional[positional.length - 1];
    const movers = ['mv', 'move', 'move-item', 'mi', 'ren', 'rename-item'].indexOf(prog) !== -1;
    hit(movers ? positional.concat(dest === null ? [] : [dest]) : dest === null ? [] : [dest], prog + ' into');
    return;
  }
  if (['set-content', 'add-content', 'out-file', 'new-item', 'clear-content', 'sc', 'ac', 'ni'].indexOf(prog) !== -1) {
    hit(args, prog + ' to');
  }
}

// ── decide + CLI ────────────────────────────────────────────────────────────────────────
const SEVERITY = { allow: 1, ask: 2, deny: 3 };

function decisionFor(cls, slot) {
  switch (cls) {
    case 'destructive':
    case 'interpreter':
    case 'unresolvable':
    case 'git-program':
      return 'deny';
    case 'integration':
    case 'netlify':
    case 'protected':
      return slot ? 'deny' : 'ask';
    case 'commit':
      return 'ask';
    default:
      return 'deny';
  }
}

function decide(input) {
  const tool = input && input.tool_name;
  if (tool !== 'Bash' && tool !== 'PowerShell') return { decision: 'allow', reason: 'no opinion on tool ' + String(tool) };
  // R2: the PowerShell tool is denied outright in Worker-slot sessions (closes the alias/variable/function indirection class).
  if (tool === 'PowerShell' && isWorkerSlot(input.cwd)) return { decision: 'deny', reason: 'PowerShell tool - denied in Worker-slot sessions (R2)' };
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string') return { decision: 'deny', reason: 'missing or non-string command (fail closed)' };

  const findings = [];
  try {
    analyze(command, 0, findings);
  } catch (e) {
    if (e instanceof Unresolvable) return { decision: 'deny', reason: 'command could not be fully resolved (' + e.message + ') - fail closed' };
    throw e;
  }
  const slot = isWorkerSlot(input.cwd);
  let best = { decision: 'allow', reason: 'no restricted operation detected' };
  // R2: any resolved git program is denied for the PowerShell tool only; the marker is ignored for Bash.
  const effective = tool === 'PowerShell' ? findings : findings.filter((f) => f.cls !== 'git-program');
  for (const f of effective) {
    const decision = decisionFor(f.cls, slot);
    if (SEVERITY[decision] > SEVERITY[best.decision]) {
      best = { decision, reason: f.reason + (decision === 'deny' && slot && f.cls !== 'destructive' && f.cls !== 'git-program' ? ' - denied in Worker-slot sessions (R1)' : '') };
    }
  }
  return best;
}

function runCli(stdinText, opts) {
  const decideFn = (opts && opts.decideFn) || decide;
  const block = (why) => ({ code: FAIL_CLOSED_EXIT, stdout: '', stderr: 'pretooluse-guard: BLOCKED - ' + why + '\n' });
  try {
    let input;
    try {
      input = JSON.parse(String(stdinText).replace(/^﻿/, ''));
    } catch (e) {
      return block('unparseable hook input (fail closed)');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return block('hook input is not a JSON object (fail closed)');
    const tool = input.tool_name;
    if (tool !== 'Bash' && tool !== 'PowerShell') return { code: 0, stdout: '', stderr: '' };
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput.command !== 'string') return block('missing or non-string command (fail closed)');
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.env.CLAUDE_PROJECT_DIR;
    const r = decideFn({ tool_name: tool, tool_input: toolInput, cwd });
    if (!r || typeof r.reason !== 'string' || !Object.prototype.hasOwnProperty.call(SEVERITY, r.decision)) {
      return block('guard returned an invalid decision (fail closed)');
    }
    if (r.decision === 'deny') return block(r.reason);
    if (r.decision === 'ask') {
      return {
        code: 0,
        stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: r.reason } }) + '\n',
        stderr: ''
      };
    }
    return { code: 0, stdout: '', stderr: '' };
  } catch (e) {
    return block('guard error: ' + (e && e.message ? e.message : String(e)));
  }
}

module.exports = { decide, runCli, isWorkerSlot, FAIL_CLOSED_EXIT };

if (require.main === module) {
  process.on('uncaughtException', () => process.exit(FAIL_CLOSED_EXIT));
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('error', () => process.exit(FAIL_CLOSED_EXIT));
  process.stdin.on('end', () => {
    const r = runCli(Buffer.concat(chunks).toString('utf8'));
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exitCode = r.code;
  });
}
