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

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const FAIL_CLOSED_EXIT = 2;
const MAX_WRAPPER_DEPTH = 6;
const MAX_GROUP_LEVEL = 8;
const R10_BUDGET_MS = 8000;
const R10_GIT_CHECK_CAP_MS = 4000;

// r10 R10-2: fixed host Git 2.53.0.windows.2 main-command allowlist (178 commands).
const KNOWN_GIT_SUBCOMMANDS = new Set(`add
am
annotate
apply
archive
backfill
bisect
blame
branch
bugreport
bundle
cat-file
check-attr
check-ignore
check-mailmap
check-ref-format
checkout
checkout--worker
checkout-index
cherry
cherry-pick
citool
clean
clone
column
commit
commit-graph
commit-tree
config
count-objects
credential
credential-cache
credential-cache--daemon
credential-store
credential-wincred
daemon
describe
diagnose
diff
diff-files
diff-index
diff-pairs
diff-tree
difftool
difftool--helper
fast-export
fast-import
fetch
fetch-pack
filter-branch
fmt-merge-msg
for-each-ref
for-each-repo
format-patch
fsck
fsck-objects
fsmonitor--daemon
gc
get-tar-commit-id
grep
gui
gui--askpass
gui--askyesno
gui.tcl
hash-object
help
hook
http-backend
http-fetch
http-push
imap-send
index-pack
init
init-db
instaweb
interpret-trailers
last-modified
log
ls-files
ls-remote
ls-tree
mailinfo
mailsplit
maintenance
merge
merge-base
merge-file
merge-index
merge-octopus
merge-one-file
merge-ours
merge-recursive
merge-recursive-ours
merge-recursive-theirs
merge-resolve
merge-subtree
merge-tree
mergetool
mktag
mktree
multi-pack-index
mv
name-rev
notes
pack-objects
pack-redundant
pack-refs
patch-id
pickaxe
prune
prune-packed
pull
push
quiltimport
range-diff
read-tree
rebase
receive-pack
reflog
refs
remote
remote-ext
remote-fd
remote-ftp
remote-ftps
remote-http
remote-https
repack
replace
replay
repo
request-pull
rerere
reset
restore
rev-list
rev-parse
revert
rm
send-email
send-pack
sh-i18n--envsubst
shortlog
show
show-branch
show-index
show-ref
sparse-checkout
stage
stash
status
stripspace
submodule
submodule--helper
subtree
survey
svn
switch
symbolic-ref
tag
unpack-file
unpack-objects
update
update-index
update-ref
update-server-info
upload-archive
upload-archive--writer
upload-pack
var
verify-commit
verify-pack
verify-tag
version
web--browse
whatchanged
worktree
write-tree`.split('\n'));
const R10_ALWAYS_DENY_GIT = new Set(['cherry-pick', 'revert', 'am', 'filter-branch']);
const R10_PROTECTED_CONFIG_RE = /^(?:core\.hookspath|core\.fsmonitor|include\.path|includeif\..*\.path)$/i;
const R10_REMOTE_CONFIG_RE = /^remote\.[^.]+\.(?:fetch|mirror)$/i;
const R10_GIT_CONFIG_ENV_RE = /^GIT_CONFIG_/i;
const R10_GIT_OVERRIDE_RE = /^GIT_(?:DIR|WORK_TREE)$/i;
const R10_FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// R1: a session whose cwd is (or is under) a Worker slot gets the strict column.
const SLOT_DIR_RE = /(^|\/)pt-wt-worker-[ab](\/|$)/;

const INTEGRATION_SUBCOMMANDS = ['push', 'merge', 'rebase', 'pull'];

// r9 commit gate (RC1-RC3): a Worker may commit only on its OWN task/* branch, in its OWN slot, in plain form, with a clean staged set.
const TASK_BRANCH_RE = /^ref: refs\/heads\/task\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const COMMIT_FLAGS_PLAIN = ['-s', '-q', '-v', '--no-edit', '--allow-empty', '--dry-run'];
const COMMIT_CLUSTER_OK = 'sqv';
const STAGED_DENY_SOURCES = [
  '^\\.claude/settings[\\w.-]*\\.json$',
  '^\\.claude/hooks/',
  '^checkpoint\\.md$',
  '^\\.env[\\w.-]*$',
  '^work/[^/]+/brief\\.md$'
];
const STAGED_DENY_RES = STAGED_DENY_SOURCES.map((s) => new RegExp(s));
// r9 RC4: ref moves of these branches are denied in every session.
const REF_MOVE_TARGETS = ['main', 'branch-dev'];
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

// Code-from-stdin guard: a shell / interpreter fed by a heredoc, here-string, `<` redirect, `<(...)` or a pipe
// executes text the scanner treats as data, so it is denied unless the code is given inline (or stdin is /dev/null).
const PIPE_MARK = '\u0001';
const STDIN_INTERPRETER_RE = /^(?:bash|sh|zsh|dash|ash|ksh|csh|tcsh|fish|busybox|pwsh|powershell|cmd|python[\d.]*|pythonw|py|node|nodejs|deno|bun|perl|ruby|php|lua|source|\.)$/;
let segStdinFed = false; // set per segment by analyze(); read by classifyWords() at every wrapper level
// Wrappers that pass stdin through to the program they run (sudo -u x bash <<EOF, setsid bash < f, timeout 5 bash ...).
const STDIN_PASSTHROUGH_RE = /^(?:exec|command|builtin|sudo|doas|setsid|nice|ionice|stdbuf|unbuffer|timeout|chroot|script)$/;
const COMPOUND_OPEN_RE = /^(if|while|until|for|select|case)\b/;
const COMPOUND_CLOSE_RE = /^(?:fi|done|esac)\b/;
const STDIN_REDIRECT_RE = /<(?![ \t]*\/dev\/null(?![\w./-]))/; // any `<` / `<<` / `<<<` / `<(` except `< /dev/null`
// `case WORD in PATTERN) command;;` puts the command in the same raw segment as the case header / arm pattern, so the
// segment's first word is `case` or `PATTERN)`. Strip those prefixes so the command is classified like any other.
const CASE_HEADER_RE = /^\s*case\s+[\s\S]*?\s+in(?=\s|$)\s*/;
const CASE_ARM_RE = /^\s*(?:__SUB__|(?:"[^"]*"|'[^']*'|[^\s()"'])*\))\s*/;
const CASE_ARM_TAIL_RE = /^\s*(?:"[^"]*"|'[^']*'|[^\s()"'])*\s*$/; // nothing but one (possibly partial) pattern word
const CASE_HEAD_TAIL_RE = /^\s*case\s+[\s\S]*?\s+in\s+(?:"[^"]*"|'[^']*'|[^\s()"'])*\s*$/; // `case x in PAT` and no command yet
function stripCaseArm(text) {
  const m = CASE_ARM_RE.exec(text);
  return m ? text.slice(m[0].length) : text;
}
function stripCaseHeaders(text) {
  let t = text;
  for (let guard = 0; guard < 8 && /^\s*case\s/.test(t); guard += 1) {
    const h = CASE_HEADER_RE.exec(t);
    if (!h) return t;
    const rest = t.slice(h[0].length);
    const a = CASE_ARM_RE.exec(rest);
    t = a ? rest.slice(a[0].length) : ''; // no `)` yet: a pattern fragment (`a | b)` is split at `|`) or a bare header
  }
  return t;
}
function markFed(out, from, to) {
  for (let k = from; k < to; k += 1) if (out[k].charAt(0) !== PIPE_MARK) out[k] = PIPE_MARK + out[k];
}
// a `( ... )` / `{ ... }` group at src[i..] followed by a stdin redirect: (bash) < f, { bash; } <<EOF
function groupRedirected(src, i) {
  return /^[ \t]*\d*<(?![ \t]*\/dev\/null(?![\w./-]))/.test(src.slice(i, i + 80));
}
function hasInlineCode(prog, args) {
  if (/^(?:bash|sh|zsh|dash|ash|ksh|csh|tcsh|fish|busybox)$/.test(prog)) return args.some((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
  if (/^(?:python[\d.]*|pythonw|py)$/.test(prog)) return args.some((a) => /^-[a-zA-Z]*[cm][a-zA-Z]*$/.test(a));
  if (/^(?:node|nodejs|deno|bun)$/.test(prog)) return args.some((a) => /^(?:-[a-zA-Z]*[ep][a-zA-Z]*|--eval|--print)$/.test(a));
  if (/^(?:perl|ruby)$/.test(prog)) return args.some((a) => /^-[a-zA-Z]*[eE][a-zA-Z]*$/.test(a));
  if (prog === 'php') return args.some((a) => /^-[a-zA-Z]*r[a-zA-Z]*$/.test(a));
  if (prog === 'pwsh' || prog === 'powershell') return args.some((a) => /^-(?:c|command|e|ec|encodedcommand)$/i.test(a));
  if (prog === 'cmd') return args.some((a) => /^\/[ck]$/i.test(a));
  return false; // source / . : never inline
}

// ── path helpers ────────────────────────────────────────────────────────────────────────
function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function isDotGitText(text) {
  const n = normalizePath(text);
  return /(?:^|\/)\.git(?:\/|$)/.test(n);
}

function spawnBudgetMs(deadline) {
  const remaining = Number(deadline) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('r10 time budget exhausted');
  return Math.max(1, Math.min(R10_GIT_CHECK_CAP_MS, remaining));
}

function stripShellEscapes(command, tool) {
  const src = String(command);
  let out = '';
  let single = false;
  let double = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === "'" && !double) { single = !single; out += c; continue; }
    if (c === '"' && !single) { double = !double; out += c; continue; }
    if (!single && tool === 'PowerShell' && c === '`' && i + 1 < src.length) { out += src[++i]; continue; }
    if (!single && tool === 'Bash' && c === '\\' && i + 1 < src.length) { out += src[++i]; continue; }
    out += c;
  }
  return out;
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
function scanCode(src, start, closer, out, level, inherit) {
  if (level > MAX_GROUP_LEVEL) throw new Unresolvable('nesting too deep');
  const n = src.length;
  let i = start;
  let cur = '';
  let pending = [];
  let piped = false; // the segment being built is the right-hand side of a `|` pipe
  const compounds = []; // open if/while/for/case ... : { fed } (segments inside a fed compound are fed)
  const fedNow = () => piped || inherit === true || compounds.some((e) => e.fed);
  const flush = () => {
    const text = cur;
    cur = '';
    if (text.trim()) {
      const head = text.trim().replace(/^(?:then|do|else|elif)\s+/, '');
      const fed = fedNow();
      if (COMPOUND_CLOSE_RE.test(head)) {
        const e = compounds.pop();
        if (e && STDIN_REDIRECT_RE.test(head)) markFed(out, e.start, out.length); // `done < f`: the whole compound reads it
      }
      const top = compounds.length ? compounds[compounds.length - 1] : null;
      let body = text;
      if (/^case\s/.test(head)) body = stripCaseHeaders(head);
      else if (top && top.kind === 'case' && !COMPOUND_CLOSE_RE.test(head)) body = stripCaseArm(text);
      const idx = out.length;
      if (body.trim()) {
        out.push(fed ? PIPE_MARK + body : body);
        if (level === 0) (out.top || (out.top = [])).push(idx);
      }
      const opened = COMPOUND_OPEN_RE.exec(head);
      if (opened) compounds.push({ fed, start: idx, kind: opened[1] });
    }
    piped = false;
  };

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (closer && c === closer && !(closer === ')' && !/^\s*esac\s*$/.test(cur) &&
        (CASE_HEAD_TAIL_RE.test(cur) || (compounds.some((e) => e.kind === 'case') && CASE_ARM_TAIL_RE.test(cur))))) {
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
          i = scanCode(src, i + 2, ')', out, level + 1, fedNow());
          cur += '__SUB__';
          continue;
        }
        if (ch === '`' && src.indexOf('`', i + 1) !== -1) {
          i = scanCode(src, i + 1, '`', out, level + 1, fedNow());
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
        i = scanCode(src, i + 1, '`', out, level + 1, fedNow());
        cur += '__SUB__';
      } else {
        cur += c;
        i += 1;
      }
      continue;
    }

    if (c === '$' && next === '(') {
      i = scanCode(src, i + 2, ')', out, level + 1, fedNow());
      cur += '__SUB__';
      continue;
    }
    if (c === '(') {
      const s0 = out.length;
      i = scanCode(src, i + 1, ')', out, level + 1, fedNow());
      if (groupRedirected(src, i)) markFed(out, s0, out.length);
      cur += '__SUB__';
      continue;
    }
    if (c === '{') {
      const s0 = out.length;
      i = scanCode(src, i + 1, '}', out, level + 1, fedNow());
      if (groupRedirected(src, i)) markFed(out, s0, out.length);
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
    if (c === '|' && src[i - 1] !== '>') { flush(); piped = next !== '|' && src[i - 1] !== '|'; i += 1; continue; }
    if (c === '&' && src[i - 1] === '|') { i += 1; continue; } // `|&` is one pipe operator
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
  let stdinFed = false; // `<`, `<<`, `<<<` or `<(...)` (placeholder) other than `< /dev/null`
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
      if (c === '<' && !(op === '<' && w.text === '/dev/null')) stdinFed = true;
      continue;
    }
    const w = readWord(i);
    if (w.end === i) { i += 1; continue; }
    words.push(w.text);
    lastEnd = w.end;
    i = w.end;
  }
  return { words, redirects, stdinFed };
}

// ── classification ──────────────────────────────────────────────────────────────────────
function analyze(code, depth, out) {
  if (depth > MAX_WRAPPER_DEPTH) throw new Unresolvable('wrapper nesting too deep');
  const segments = [];
  scanCode(code, 0, null, segments, 0, false);
  const savedStdinFed = segStdinFed;
  try {
    const top = segments.top || [];
    let segNo = -1;
    for (const rawSeg of segments) {
      segNo += 1;
      const piped = rawSeg.charAt(0) === PIPE_MARK;
      const raw = piped ? rawSeg.slice(1) : rawSeg;
      const { words, redirects, stdinFed } = tokenize(raw);
      for (const t of redirects) {
        if (isDotGitText(t)) out.push({ cls: 'destructive', reason: 'redirect into .git path - denied in every session (R10-3)' });
        else if (isProtectedText(t)) out.push({ cls: 'protected', reason: 'redirect into protected file ' + t });
      }
      segStdinFed = piped || stdinFed;
      const before = out.length;
      classifyWords(words, depth, out);
      for (let k = before; k < out.length; k += 1) {
        if (out[k].cls === 'commit' && out[k].plainCtx === undefined) out[k].plainCtx = depth === 0 && top.length === 1 && top[0] === segNo;
      }
    }
  } finally {
    segStdinFed = savedStdinFed;
  }
}

function classifyWords(words, depth, out, wrapped) {
  let via = wrapped === true; // reached through a wrapper, env prefix or shell keyword: not a plain top-level program
  const w = words.slice();
  const envAssignments = [];
  for (;;) {
    if (!w.length) return;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      envAssignments.push(w[0]);
      w.shift();
      via = true;
      continue;
    }
    if (SHELL_KEYWORDS.indexOf(w[0].toLowerCase()) !== -1) {
      w.shift();
      via = true;
      continue;
    }
    break;
  }
  const prog = progName(w[0]);
  const args = w.slice(1);

  if (segStdinFed && STDIN_INTERPRETER_RE.test(prog) && !hasInlineCode(prog, args)) {
    out.push({ cls: 'interpreter', reason: 'shell/interpreter reading code from a heredoc, stdin redirect, process substitution or pipe' });
  } else if (segStdinFed && STDIN_PASSTHROUGH_RE.test(prog)) {
    const k = args.findIndex((a) => STDIN_INTERPRETER_RE.test(progName(a)));
    if (k !== -1 && !hasInlineCode(progName(args[k]), args.slice(k + 1))) {
      out.push({ cls: 'interpreter', reason: 'shell/interpreter reading code from a heredoc, stdin redirect, process substitution or pipe' });
    }
  }

  if (prog === 'git' || /^git-[a-z0-9][a-z0-9._-]*$/i.test(prog)) {
    if (envAssignments.some((a) => R10_GIT_CONFIG_ENV_RE.test(a.split('=')[0]))) {
      out.push({ cls: 'destructive', reason: 'GIT_CONFIG_* environment overrides for git are denied in every session (R10-3)' });
    }
    if (envAssignments.some((a) => R10_GIT_OVERRIDE_RE.test(a.split('=')[0]))) {
      out.push({ cls: 'destructive', reason: 'GIT_DIR/GIT_WORK_TREE environment overrides are denied for protected git operations (R10-5)' });
    }
    out.push({ cls: 'git-program', reason: 'git via the PowerShell tool - denied (R2)' });
    if (prog === 'git') classifyGit(args, out, via || w[0] !== 'git');
    else classifyGit([prog.slice(4)].concat(args), out, true);
    return;
  }
  if (prog === 'netlify' || prog === 'ntl') { classifyNetlify(args, out); return; }

  if (prog === 'env') { unwrapEnv(args, depth, out); return; }
  if (prog === 'xargs') { classifyWords(skipXargs(args), depth, out, true); return; }
  if (PACKAGE_RUNNERS.indexOf(prog) !== -1) { classifyWords(skipRunnerArgs(args), depth, out, true); return; }
  if ((prog === 'npm' || prog === 'pnpm' || prog === 'yarn') && (args[0] === 'exec' || args[0] === 'dlx')) {
    classifyWords(skipRunnerArgs(args.slice(1)), depth, out, true);
    return;
  }
  if (GENERIC_WRAPPERS.indexOf(prog) !== -1) { classifyWords(skipGenericWrapper(prog, args), depth, out, true); return; }

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
  classifyWords(args.slice(i), depth, out, true);
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
function configKeyFromArg(kv) {
  const eq = String(kv).indexOf('=');
  return (eq === -1 ? String(kv) : String(kv).slice(0, eq)).trim();
}
function isProtectedConfigKey(k) { return R10_PROTECTED_CONFIG_RE.test(String(k)); }
function isRemoteRiskConfigKey(k) { return R10_REMOTE_CONFIG_RE.test(String(k)); }
function protectedRefName(v) {
  const n = String(v || '').toLowerCase().replace(/^refs\/heads\//, '');
  return REF_MOVE_TARGETS.indexOf(n) !== -1;
}
function refspecTargetsProtected(v) {
  const x = String(v || '');
  const colon = x.lastIndexOf(':');
  if (colon === -1) return false;
  return protectedRefName(x.slice(colon + 1).replace(/^\+/, ''));
}
function classifyGit(args, out, wrapped) {
  const valued = ['--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source'];
  let i = 0;
  let riskyGlobal = false;
  while (i < args.length) {
    const a = args[i];
    if (a === '-C') { riskyGlobal = true; i += 2; }
    else if (a === '-c') {
      const kv = args[i + 1] || '';
      const key = configKeyFromArg(kv);
      if (/^alias\./i.test(kv) && kv.indexOf('!') !== -1) out.push({ cls: 'destructive', reason: 'git alias with a shell escape (-c alias.*=!...)' });
      if (isProtectedConfigKey(key)) out.push({ cls: 'destructive', reason: 'protected git config override ' + key + ' - denied in every session (R10-3)' });
      if (isRemoteRiskConfigKey(key)) out.push({ cls: 'destructive', reason: 'remote fetch/mirror config override - denied in every session (R10-5)' });
      riskyGlobal = true;
      i += 2;
    } else if (a === '--config-env') {
      const spec = args[i + 1] || '';
      const key = configKeyFromArg(spec);
      if (isProtectedConfigKey(key) || isRemoteRiskConfigKey(key)) out.push({ cls: 'destructive', reason: 'protected git --config-env override - denied in every session (R10-3)' });
      riskyGlobal = true;
      i += 2;
    } else if (a.startsWith('--config-env=')) {
      const key = configKeyFromArg(a.slice('--config-env='.length));
      if (isProtectedConfigKey(key) || isRemoteRiskConfigKey(key)) out.push({ cls: 'destructive', reason: 'protected git --config-env override - denied in every session (R10-3)' });
      riskyGlobal = true;
      i += 1;
    } else if (valued.indexOf(a) !== -1) { riskyGlobal = true; i += 2; }
    else if (a.startsWith('-')) i += 1;
    else break;
  }
  if (i >= args.length) return;
  const sub = args[i].toLowerCase();
  const rest = args.slice(i + 1);
  const cluster = (a, chars) => /^-[a-zA-Z]+$/.test(a) && chars.split('').some((ch) => a.indexOf(ch) !== -1);

  if (!KNOWN_GIT_SUBCOMMANDS.has(sub)) {
    out.push({ cls: 'destructive', reason: 'unknown/external git subcommand ' + sub + ' - denied in every session (R10-A)' });
    return;
  }
  if (R10_ALWAYS_DENY_GIT.has(sub)) {
    out.push({ cls: 'destructive', reason: 'git ' + sub + ' - denied in every session (R10-5)' });
    return;
  }
  if (sub === 'config') {
    const pos = rest.filter((a) => !a.startsWith('-'));
    const key = pos[0] || '';
    const writeish = pos.length >= 2 || rest.some((a) => /^(--add|--replace-all|--unset|--unset-all|--rename-section|--remove-section)$/i.test(a));
    if (writeish && isProtectedConfigKey(key)) {
      out.push({ cls: 'destructive', reason: 'git config write to protected execution key - denied in every session (R10-3)' });
      return;
    }
    if (writeish && isRemoteRiskConfigKey(key)) {
      out.push({ cls: 'destructive', reason: 'git config write to remote fetch/mirror key - denied in every session (R10-5)' });
      return;
    }
  }

  if (sub === 'push') {
    const destructive = rest.some((a) => a === '--force' || a.startsWith('--force') || a === '--mirror' || a === '--delete' ||
      a === '--prune' || cluster(a, 'fd') || a.startsWith('+') || a.startsWith(':'));
    out.push(destructive
      ? { cls: 'destructive', reason: 'destructive git push (force / delete / mirror / +refspec / :ref)' }
      : { cls: 'push', reason: 'git push - denied in every Claude Code session; push manually from a normal terminal' });
    return;
  }

  if (INTEGRATION_SUBCOMMANDS.indexOf(sub) !== -1) {
    out.push({ cls: 'integration', reason: 'git ' + sub + ' - denied in every Claude Code session (R3m); run merge, rebase and pull manually from a normal terminal' });
    return;
  }

  if (sub === 'commit') {
    out.push({
      cls: 'commit',
      reason: 'git commit',
      args: rest,
      formIssue: i !== 0 ? 'git global options (-C / -c / --git-dir / --work-tree / --no-pager ...) are not allowed before commit'
        : wrapped ? 'wrapped, env-prefixed or non-plain git invocation' : commitFormIssue(rest)
    });
    return;
  }

  if (sub === 'remote' && rest[0] === 'add' &&
      rest.slice(1).some((a) => a === '--mirror' || a.startsWith('--mirror='))) {
    out.push({ cls: 'destructive', reason: 'git remote add --mirror* - denied in every session (R10-5)' });
    return;
  }

  if (sub === 'fetch') {
    const risky = rest.some((a) => refspecTargetsProtected(a) ||
      /^--refmap=/.test(a) && refspecTargetsProtected(a.slice('--refmap='.length)) ||
      a === '--mirror');
    if (risky) {
      out.push({ cls: 'destructive', reason: 'git fetch can move main/branch-dev - denied in every session (R10-5)' });
      return;
    }
  }

  if (sub === 'reset') {
    if (rest.some((a) => a === HARD_RESET_FLAG)) {
      out.push({ cls: 'destructive', reason: 'git reset --hard' });
      return;
    }
    out.push({ cls: 'reset', reason: 'git reset', args: rest, formIssue: riskyGlobal || wrapped ? 'global/wrapped git reset form is not allowed' : null });
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

  if (sub === 'update-ref' || sub === 'symbolic-ref' || sub === 'branch') {
    const moved = refMoveIssue(sub, rest);
    if (moved !== null) {
      out.push({ cls: 'destructive', reason: moved });
      return;
    }
  }

  if (sub === 'worktree') {
    if (rest[0] === 'remove' && rest.some((a) => a === '--force' || cluster(a, 'f'))) {
      out.push({ cls: 'destructive', reason: 'git worktree remove --force' });
      return;
    }
    if (rest[0] === 'add') {
      if (rest.some((a) => a === '--ignore-other-worktrees')) {
        out.push({ cls: 'destructive', reason: 'git worktree add --ignore-other-worktrees - denied in every session (R10-4)' });
        return;
      }
      const addPositional = [];
      for (let k = 1; k < rest.length; k += 1) {
        const a = rest[k];
        const attached = /^-[bB](.+)$/.exec(a);

        if (a === '-b' || a === '-B') {
          if (protectedRefName(rest[k + 1])) {
            out.push({ cls: 'destructive', reason: 'git worktree add targeting main/branch-dev - denied in every session (R10-4)' });
            return;
          }
          k += 1;
          continue;
        }

        if (attached) {
          if (protectedRefName(attached[1])) {
            out.push({ cls: 'destructive', reason: 'git worktree add targeting main/branch-dev - denied in every session (R10-4)' });
            return;
          }
          continue;
        }

        if (a === '--reason') {
          k += 1;
          continue;
        }

        if (a.startsWith('--reason=') || a.startsWith('-')) continue;

        addPositional.push(a);
      }

      if (addPositional.length >= 2 && protectedRefName(addPositional[1])) {
        out.push({ cls: 'destructive', reason: 'git worktree add checkout target main/branch-dev - denied in every session (R10-4)' });
        return;
      }
    }
  }

  if (sub === 'checkout' || sub === 'switch') {
    if (rest.some((a) => a === '--ignore-other-worktrees')) {
      out.push({ cls: 'destructive', reason: 'git ' + sub + ' --ignore-other-worktrees - denied in every session (R10-4)' });
      return;
    }
    let flagTarget = null;
    let positional = null;
    let forceCreate = false;
    for (let k = 0; k < rest.length; k += 1) {
      const a = rest[k];
      if (a === '--') break;
      if (['-b', '-B', '-c', '-C', '--orphan', '--force-create'].indexOf(a) !== -1) {
        flagTarget = rest[k + 1] || null;
        if (['-B', '-C', '--force-create'].indexOf(a) !== -1) forceCreate = true;
        k += 1;
      } else {
        const attached = /^-([bBcC])(.+)$/.exec(a);
        if (attached) {
          flagTarget = attached[2];
          if (attached[1] === 'B' || attached[1] === 'C') forceCreate = true;
        } else if (a.startsWith('-')) continue;
        else if (positional === null) positional = a;
      }
    }
    const target = flagTarget !== null ? flagTarget : positional;
    if (protectedRefName(target) || String(target || '').toLowerCase() === 'origin/main') {
      out.push({ cls: 'destructive', reason: 'git ' + sub + ' targeting protected branch' + (forceCreate ? ' with force-create' : '') + ' - denied in every session (R10-4)' });
      return;
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

  const codeText = normalizePath(code);
  const dotGitInCode = /(?:^|[\/'"(\s])\.git(?:\/|['"),\s]|$)/.test(codeText);

  if (CODE_WRITE_RE.test(code) && dotGitInCode) {
    out.push({ cls: 'destructive', reason: 'interpreter code writes a .git path - denied in every session (R10-3)' });
  } else if (CODE_WRITE_RE.test(code) && isProtectedText(code)) {
    out.push({ cls: 'protected', reason: 'interpreter code writes a protected file' });
  }
}

// ── protected-file writers ──────────────────────────────────────────────────────────────
function classifyFileWrite(prog, args, out) {
  const positional = args.filter((a) => !a.startsWith('-'));
  const hit = (list, what) => {
    const dg = list.find((a) => isDotGitText(a));
    if (dg !== undefined) { out.push({ cls: 'destructive', reason: what + ' .git path ' + dg + ' - denied in every session (R10-3)' }); return; }
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

// ── commit gate + RC4 (r9) ──────────────────────────────────────────────────────────────
// The gate is deny-only: 'allow' means "no opinion" and the settings allow rule (RC5) does the rest. Every failure to prove a condition denies.
function commitFormIssue(rest) {
  for (let k = 0; k < rest.length; k += 1) {
    const a = rest[k];
    if (a === '--amend') return 'amend is not allowed (RC3) - add a new commit instead';
    if (COMMIT_FLAGS_PLAIN.indexOf(a) !== -1) continue;
    if (a === '--message' || a === '--file') {
      if (k + 1 >= rest.length) return 'flag ' + a + ' has no value';
      k += 1;
      continue;
    }
    if (/^--(?:message|file)=/.test(a)) continue;
    if (/^-[a-zA-Z]+$/.test(a)) {
      for (let j = 1; j < a.length; j += 1) {
        const ch = a.charAt(j);
        if (COMMIT_CLUSTER_OK.indexOf(ch) !== -1) continue;
        if (ch === 'm' || ch === 'F') {
          if (j + 1 < a.length) break;
          if (k + 1 >= rest.length) return 'flag -' + ch + ' has no value';
          k += 1;
          break;
        }
        return 'flag -' + ch + ' is not in the commit allowlist';
      }
      continue;
    }
    if (a.startsWith('-')) return 'flag ' + a + ' is not in the commit allowlist';
    return 'argument ' + a + ' is not allowed (pathspecs bypass the staged-set check)';
  }
  return null;
}

function isRefMoveTarget(name) {
  return REF_MOVE_TARGETS.indexOf(String(name).toLowerCase().replace(/^refs\/heads\//, '')) !== -1;
}
function refMoveIssue(sub, rest) {
  const pos = [];
  const flags = [];
  for (let k = 0; k < rest.length; k += 1) {
    const a = rest[k];
    if (a === '-m' && (sub === 'update-ref' || sub === 'symbolic-ref')) { k += 1; continue; }
    if (a.startsWith('-')) flags.push(a);
    else pos.push(a);
  }
  const why = 'git ' + sub + ' moves main/branch-dev - denied in every session (RC4/R10-4)';
  if (sub === 'update-ref') {
    if (flags.indexOf('--stdin') !== -1) return 'git update-ref --stdin cannot be resolved - denied in every session (RC4)';
    const target = pos[0];
    if (String(target || '').toUpperCase() === 'HEAD') return 'git update-ref HEAD - denied in every session (R10-4)';
    return target !== undefined && isRefMoveTarget(target) ? why : null;
  }
  if (sub === 'symbolic-ref') {
    return pos.length >= 2 && (isRefMoveTarget(pos[0]) || isRefMoveTarget(pos[1])) ? why : null;
  }
  const short = flags.filter((a) => /^-[a-zA-Z]+$/.test(a)).join('');
  const move = flags.some((a) => a === '--move' || a === '--copy') || /[mMcC]/.test(short);
  const force = flags.some((a) => a === '--force') || /f/.test(short);
  if (move && pos.length === 1) return 'git branch one-name move/copy - denied in every session (R10-4)';
  if (move) return pos.some(isRefMoveTarget) ? why : null;
  if (force) return pos.length > 0 && isRefMoveTarget(pos[0]) ? why : null;
  return null;
}

function isStagedDenied(p) {
  const n = normalizePath(p);
  return STAGED_DENY_RES.some((re) => re.test(n));
}
function slotRootOf(cwd) {
  const s = String(cwd).replace(/\\/g, '/').replace(/\/+/g, '/');
  const m = /^(.*?\/pt-wt-worker-[ab])(?:\/|$)/i.exec(s);
  return m ? m[1] : null;
}
// Real readers (injectable through decide(input, deps)). HEAD: <slot>/.git is a file (worktree: 'gitdir: <path>') or a directory; read <gitdir>/HEAD.
function readHeadRefFs(root) {
  const dotGit = root + '/.git';
  const st = fs.statSync(dotGit);
  let gitDir = dotGit;
  if (st.isFile()) {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    if (!m) throw new Error('unrecognised .git file');
    gitDir = path.isAbsolute(m[1]) ? m[1] : path.resolve(root, m[1]);
  } else if (!st.isDirectory()) {
    throw new Error('.git is neither a file nor a directory');
  }
  return fs.readFileSync(gitDir + '/HEAD', 'utf8').split(/\r?\n/)[0];
}
// Staged paths: --no-renames lists BOTH sides of a rename (renaming a protected file away must still show its old path); GIT_* is stripped
// from the child env and locks are optional so the read never writes.
function stagedPathsGit(root, deadline) {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k)) env[k] = process.env[k];
  env.GIT_OPTIONAL_LOCKS = '0';
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '-z', '--no-renames'], {
    cwd: root, env, encoding: 'utf8', timeout: spawnBudgetMs(deadline), windowsHide: true, maxBuffer: 16 * 1024 * 1024
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('git diff exited ' + r.status);
  if (typeof r.stdout !== 'string') throw new Error('git diff produced no output');
  return r.stdout.split('\0').filter((p) => p.length > 0);
}
// The commit acts on the repository that CONTAINS the session cwd, which may be a nested repo or worktree inside the slot: find it the way git does.
function findRepoRootFs(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('no .git above the session cwd');
    dir = parent;
  }
}
function gitDirInfoFs(root) {
  const dotGit = path.join(root, '.git');
  const st = fs.statSync(dotGit);
  if (st.isDirectory()) return { gitDir: dotGit, commonDir: dotGit };
  if (!st.isFile()) throw new Error('.git is neither a file nor a directory');
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf8'));
  if (!m) throw new Error('unrecognised .git file');
  const gitDir = path.isAbsolute(m[1]) ? m[1] : path.resolve(root, m[1]);
  const commonDir = /[\\/]worktrees[\\/][^\\/]+$/i.test(gitDir) ? path.dirname(path.dirname(gitDir)) : gitDir;
  return { gitDir, commonDir };
}
function protectedConfigStateGit(root, deadline) {
  const env = Object.assign({}, process.env, { GIT_OPTIONAL_LOCKS: '0' });
  const r = spawnSync('git', ['config', '--null', '--list'], { cwd: root, env, encoding: 'utf8', timeout: spawnBudgetMs(deadline), windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('git config exited ' + r.status);
  const bad = [];
  for (const rec of String(r.stdout || '').split('\0')) {
    if (!rec) continue;
    const nl = rec.indexOf('\n');
    const key = (nl === -1 ? rec : rec.slice(0, nl)).trim();
    const value = nl === -1 ? '' : rec.slice(nl + 1).trim();
    if (/^core\.fsmonitor$/i.test(key)) {
      if (!/^(?:true|false|yes|no|on|off|0|1)$/i.test(value)) bad.push(key + '=' + value);
    } else if (R10_PROTECTED_CONFIG_RE.test(key)) bad.push(key + '=' + value);
  }
  return { ok: bad.length === 0, bad };
}
function hooksStateFs(root) {
  const info = gitDirInfoFs(root);
  const dir = path.join(info.commonDir, 'hooks');
  if (!fs.existsSync(dir)) return { ok: true, bad: [] };
  const bad = fs.readdirSync(dir).filter((name) => !/\.sample$/i.test(name));
  return { ok: bad.length === 0, bad };
}
function resolveFileToolTargetFs(cwd, raw) {
  if (typeof cwd !== 'string' || !cwd || typeof raw !== 'string' || !raw) throw new Error('file path/cwd missing');

  const realpath = (p) => fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);

  const cwdStat = fs.statSync(cwd);
  if (!cwdStat.isDirectory()) throw new Error('cwd is not a directory');

  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw);

  if (fs.existsSync(abs)) return realpath(abs);

  let probe = abs;
  const missing = [];

  for (;;) {
    if (fs.existsSync(probe)) break;

    const parent = path.dirname(probe);
    if (parent === probe) throw new Error('no existing ancestor');

    missing.unshift(path.basename(probe));
    probe = parent;
  }

  const ancestor = realpath(probe);
  return path.join(ancestor, ...missing);
}
// ── R11: Owner-approved brief-only commit gate for the canonical checkout (work/brief-commit-gate/brief.md §2-3) ──
const R11_BRIEF_MSG_RE = /^docs\(work\): \S[^\r\n]{0,150}$/;
const R11_RECORD_PATH_RE = /^work\/[a-z0-9][a-z0-9._-]*\/brief\.md$/;
function briefApprovalFs(root) {
  const p = path.join(root, '.git', 'pt-brief-approval');
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  if (buf.length === 0 || buf.length > 256) return null;
  for (let k = 0; k < buf.length; k += 1) if (buf[k] > 0x7e || (buf[k] < 0x20 && buf[k] !== 0x0d && buf[k] !== 0x0a)) return null;
  const text = buf.toString('ascii').replace(/\r\n$|\r$|\n$/, '');
  if (/[\r\n]/.test(text)) return null;
  const parts = text.split(' ');
  if (parts.length !== 3) return null;
  const [hash, recPath, oid] = parts;
  if (!/^[0-9a-fA-F]{64}$/.test(hash)) return null;
  if (!R11_RECORD_PATH_RE.test(recPath)) return null;
  if (!/^[0-9a-f]{40}$/.test(oid)) return null;
  return { hash, path: recPath, oid };
}
// One `git status --porcelain=v2 -z --branch --untracked-files=all --no-renames` read, GIT_* stripped, locks optional, R10-7 budget.
function canonicalStatusGit(root, deadline) {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k)) env[k] = process.env[k];
  env.GIT_OPTIONAL_LOCKS = '0';
  const r = spawnSync('git', ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all', '--no-renames'], {
    cwd: root, env, encoding: 'utf8', timeout: spawnBudgetMs(deadline), windowsHide: true, maxBuffer: 16 * 1024 * 1024
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('git status exited ' + r.status);
  if (typeof r.stdout !== 'string') throw new Error('git status produced no output');
  const records = r.stdout.split('\0').filter((rec) => rec.length > 0);
  let branch = null;
  let oid = null;
  const entries = [];
  for (const rec of records) {
    if (rec.startsWith('# branch.head ')) { branch = rec.slice('# branch.head '.length); continue; }
    if (rec.startsWith('# branch.oid ')) { oid = rec.slice('# branch.oid '.length); continue; }
    if (rec.startsWith('# ')) continue;
    const kind = rec.charAt(0);
    if (kind === '1') {
      const fields = rec.split(' ');
      // "1 XY sub mH mI mW hH hI path" - path may itself contain spaces, so re-join from field index 8.
      if (fields.length < 9) throw new Error('unrecognised porcelain v2 ordinary-entry record');
      entries.push({ kind: '1', xy: fields[1], sub: fields[2], path: fields.slice(8).join(' ') });
    } else if (kind === '2') {
      entries.push({ kind: '2' });
    } else if (kind === 'u') {
      entries.push({ kind: 'u' });
    } else if (kind === '?') {
      entries.push({ kind: '?' });
    } else {
      throw new Error('unrecognised porcelain v2 record kind ' + kind);
    }
  }
  return { branch, oid, entries };
}
// One `git cat-file blob :<path>` read of the STAGED blob, hashed as a Buffer (never text-decoded).
function indexBlobSha256Git(root, relPath, deadline) {
  const env = {};
  for (const k of Object.keys(process.env)) if (!/^GIT_/i.test(k)) env[k] = process.env[k];
  env.GIT_OPTIONAL_LOCKS = '0';
  const r = spawnSync('git', ['cat-file', 'blob', ':' + relPath], {
    cwd: root, env, encoding: 'buffer', timeout: spawnBudgetMs(deadline), windowsHide: true, maxBuffer: 16 * 1024 * 1024
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('git cat-file exited ' + r.status);
  if (!Buffer.isBuffer(r.stdout)) throw new Error('git cat-file produced no output');
  return crypto.createHash('sha256').update(r.stdout).digest('hex');
}
function isNarrowBriefCommitForm(f, gitCount) {
  if (gitCount !== 1) return false;
  if (f.formIssue) return false;
  if (f.plainCtx !== true) return false;
  if (!Array.isArray(f.args) || f.args.length !== 2) return false;
  if (f.args[0] !== '-m') return false;
  return typeof f.args[1] === 'string' && R11_BRIEF_MSG_RE.test(f.args[1]);
}
function r11Deny(why) {
  return { decision: 'deny', reason: 'R11: ' + why + ' - commit from a normal terminal' };
}
// Order matters: every form/context check below runs before any read (§3 "Order matters").
function briefCommitGate(f, cwd, gitCount, deps) {
  // 1. Narrow form, or the unchanged r9 denial (byte-identical reason, zero reads).
  if (!isNarrowBriefCommitForm(f, gitCount)) return commitDeny('denied outside a Worker slot');

  // 2. Environment.
  const envBad = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k) || R10_GIT_CONFIG_ENV_RE.test(k));
  if (envBad !== undefined) return r11Deny('the session environment sets ' + envBad);

  // 3. Canonical identity.
  if (typeof cwd !== 'string' || !cwd) return r11Deny('the session cwd is unknown');
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (typeof projectDir !== 'string' || !projectDir) return r11Deny('CLAUDE_PROJECT_DIR is not set');
  let root;
  try { root = deps.repoRoot(cwd); }
  catch (e) { return r11Deny('the repository root could not be resolved (' + (e && e.message ? e.message : String(e)) + ')'); }
  if (typeof root !== 'string' || normalizePath(root).replace(/\/+$/, '') !== normalizePath(projectDir).replace(/\/+$/, '')) {
    return r11Deny('the session is not in the canonical checkout (CLAUDE_PROJECT_DIR)');
  }
  let dotGitStat;
  try { dotGitStat = fs.statSync(path.join(root, '.git')); }
  catch (e) { return r11Deny('.git could not be verified'); }
  if (!dotGitStat.isDirectory()) return r11Deny('.git is not a directory (linked worktree, not the canonical checkout)');

  // 4. Approval record.
  let record;
  try { record = deps.briefApproval(root); }
  catch (e) { return r11Deny('the approval record could not be read'); }
  if (!record || typeof record.hash !== 'string' || typeof record.path !== 'string' || typeof record.oid !== 'string') {
    return r11Deny('there is no valid Owner approval record (.git/pt-brief-approval)');
  }

  // 5. Repository state.
  let status;
  try { status = deps.canonicalStatus(root, deps.deadline); }
  catch (e) { return r11Deny('the repository status could not be verified'); }
  if (!status || status.branch !== 'branch-dev') return r11Deny('HEAD is not branch-dev');
  if (status.oid !== record.oid) return r11Deny('branch-dev has moved since the approval record was written (stale parent)');
  if (!Array.isArray(status.entries) || status.entries.length !== 1) return r11Deny('the staged/working set is not exactly one entry');
  const entry = status.entries[0];
  if (!entry || entry.kind !== '1' || (entry.xy !== 'A.' && entry.xy !== 'M.') || entry.sub !== 'N...') {
    return r11Deny('the single entry is not a plain added/modified file (A./M., no submodule)');
  }
  if (entry.path !== record.path) return r11Deny('the staged entry does not match the approved brief path');

  // 6. Content.
  let blobHash;
  try { blobHash = deps.indexBlobSha256(root, entry.path, deps.deadline); }
  catch (e) { return r11Deny('the staged content hash could not be verified'); }
  if (typeof blobHash !== 'string' || blobHash.toLowerCase() !== record.hash.toLowerCase()) {
    return r11Deny('the staged content does not match the approved hash');
  }

  // 7. R10-3 integrity.
  let cfg;
  try { cfg = deps.protectedConfigState(root, deps.deadline); }
  catch (e) { return r11Deny('git config integrity could not be verified'); }
  if (!cfg || cfg.ok !== true) return r11Deny('protected git config is active');
  let hooks;
  try { hooks = deps.hooksState(root); }
  catch (e) { return r11Deny('git hooks integrity could not be verified'); }
  if (!hooks || hooks.ok !== true) return r11Deny('non-sample git hooks are installed');

  return { decision: 'allow', reason: 'brief-only commit gate passed (R11: Owner-approved brief, branch-dev, single file)' };
}
const DEFAULT_DEPS = {
  readHeadRef: readHeadRefFs,
  stagedPaths: stagedPathsGit,
  repoRoot: findRepoRootFs,
  protectedConfigState: protectedConfigStateGit,
  hooksState: hooksStateFs,
  pathExists: (p) => fs.existsSync(p),
  resolveFileToolTarget: resolveFileToolTargetFs,
  briefApproval: briefApprovalFs,
  canonicalStatus: canonicalStatusGit,
  indexBlobSha256: indexBlobSha256Git
};

function commitDeny(cause) {
  return { decision: 'deny', reason: 'git commit - ' + cause + ' - commit from a normal terminal (R3c)' };
}
const GIT_ENV_OVERRIDE_RE = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$/;
function commitGate(f, cwd, slot, gitCount, deps) {
  if (!slot) return briefCommitGate(f, cwd, gitCount, deps);
  if (typeof cwd !== 'string' || !cwd) return commitDeny('the session cwd is unknown, so the slot cannot be verified');
  if (f.formIssue) return commitDeny(f.formIssue);
  const envOverride = Object.keys(process.env).find((k) => GIT_ENV_OVERRIDE_RE.test(k));
  if (envOverride !== undefined) return commitDeny('the session environment sets ' + envOverride + ', so the commit may not act on the repository/index the gate inspected');
  if (f.plainCtx !== true) return commitDeny('not a single top-level git commit (compound, grouped, piped, wrapped or inside a compound command)');
  if (gitCount > 1) return commitDeny('another git command appears in the same call (the staged set is read before the call runs)');
  const root = slotRootOf(cwd);
  if (root === null) return commitDeny('the Worker slot root could not be resolved');
  let repo;
  try {
    repo = deps.repoRoot(cwd);
  } catch (e) {
    return commitDeny('the repository root could not be resolved (' + (e && e.message ? e.message : String(e)) + ')');
  }
  if (typeof repo !== 'string' || normalizePath(repo).replace(/\/+$/, '') !== normalizePath(root).replace(/\/+$/, '')) {
    return commitDeny('the commit would run in a different repository than the Worker slot (nested repo or worktree)');
  }
  let head;
  try {
    head = deps.readHeadRef(root);
  } catch (e) {
    return commitDeny('HEAD could not be read (' + (e && e.message ? e.message : String(e)) + ')');
  }
  if (typeof head !== 'string' || !TASK_BRANCH_RE.test(head.trim())) return commitDeny('HEAD is not on a task/* branch');
  let cfg;
  try { cfg = deps.protectedConfigState(root, deps.deadline); }
  catch (e) { return commitDeny('git config integrity could not be verified (' + (e && e.message ? e.message : String(e)) + ')'); }
  if (!cfg || cfg.ok !== true) return commitDeny('protected git config is active (' + ((cfg && cfg.bad) || []).join(', ') + ')');
  let hooks;
  try { hooks = deps.hooksState(root); }
  catch (e) { return commitDeny('git hooks integrity could not be verified (' + (e && e.message ? e.message : String(e)) + ')'); }
  if (!hooks || hooks.ok !== true) return commitDeny('non-sample git hooks are installed (' + ((hooks && hooks.bad) || []).join(', ') + ')');
  let staged;
  try {
    staged = deps.stagedPaths(root, deps.deadline);
  } catch (e) {
    return commitDeny('the staged set could not be read (' + (e && e.message ? e.message : String(e)) + ')');
  }
  if (!Array.isArray(staged) || staged.some((p) => typeof p !== 'string')) return commitDeny('the staged set is unreadable');
  const bad = staged.find((p) => isStagedDenied(p));
  if (bad !== undefined) return commitDeny('the staged set touches a protected path (' + bad + ')');
  return { decision: 'allow', reason: 'commit gate passed (own task branch, plain form, clean staged set)' };
}

function resetGate(f, cwd, slot, deps) {
  if (slot) return { decision: 'allow', reason: 'task-slot reset behavior unchanged' };
  if (f.formIssue) return { decision: 'deny', reason: 'git reset - ' + f.formIssue + ' (R10-5)' };
  if (typeof cwd !== 'string' || !cwd) return { decision: 'deny', reason: 'git reset - cwd unknown (R10-5)' };
  if (Object.keys(process.env).some((k) => R10_GIT_OVERRIDE_RE.test(k))) return { decision: 'deny', reason: 'git reset with GIT_DIR/GIT_WORK_TREE environment override - denied (R10-5)' };
  let root;
  let head;
  try { root = deps.repoRoot(cwd); head = deps.readHeadRef(root); }
  catch (e) { return { decision: 'deny', reason: 'git reset - protected HEAD could not be verified (R10-5)' }; }
  const m = /^ref:\s+refs\/heads\/(.+)$/i.exec(String(head).trim());
  if (!m || !protectedRefName(m[1])) return { decision: 'allow', reason: 'reset is not on main/branch-dev' };
  const a = (f.args || []).filter((x) => x !== '-q' && x !== '--quiet');
  if (a.length === 0) return { decision: 'allow', reason: 'harmless index reset on protected branch' };
  if (a[0] === '--' && a.length > 1) return { decision: 'allow', reason: 'path-only unstaging on protected branch' };

  if (/^HEAD$/i.test(a[0] || '')) {
    if (a.length === 1) return { decision: 'allow', reason: 'harmless HEAD index reset on protected branch' };
    if (a[1] === '--' && a.length > 2) return { decision: 'allow', reason: 'HEAD path-only unstaging on protected branch' };
    if (a.length > 1 && !String(a[1]).startsWith('-')) return { decision: 'allow', reason: 'HEAD path-only unstaging on protected branch' };
  }

  if (/^refs\/heads\/(?:main|branch-dev)$/i.test(a[0] || '') &&
      a.length > 1 &&
      !String(a[1]).startsWith('-')) {
    return { decision: 'allow', reason: 'protected-ref path-only unstaging on protected branch' };
  }

  if (a.length === 1 && !String(a[0]).startsWith('-')) {
    const fp = path.resolve(root, a[0]);
    if (deps.pathExists(fp)) return { decision: 'allow', reason: 'existing-file unstaging on protected branch' };
  }
  return { decision: 'deny', reason: 'git reset can move main/branch-dev - denied in every session (R10-5)' };
}

function fileToolDecision(input, deps) {
  const tool = input && input.tool_name;
  if (!R10_FILE_TOOLS.has(tool)) return { decision: 'allow', reason: 'no opinion on tool ' + String(tool) };
  const ti = input.tool_input || {};
  const raw = ti.file_path || ti.path || ti.notebook_path || ti.filePath || ti.notebookPath;
  if (typeof raw !== 'string' || !raw) return { decision: 'deny', reason: tool + ' path missing/unresolvable - denied (R10-6)' };
  try {
    const resolved = deps.resolveFileToolTarget(input.cwd, raw);
    if (isDotGitText(resolved) || isDotGitText(raw)) return { decision: 'deny', reason: tool + ' targeting .git - denied in every session (R10-6)' };
    return { decision: 'allow', reason: 'no .git file-tool target detected' };
  } catch (e) {
    return { decision: 'deny', reason: tool + ' path could not be resolved - denied fail-closed (R10-6)' };
  }
}

function decisionFor(cls, slot) {
  switch (cls) {
    case 'destructive':
    case 'interpreter':
    case 'unresolvable':
    case 'git-program':
    case 'push':
    case 'integration':
      return 'deny';
    case 'netlify':
    case 'protected':
      return slot ? 'deny' : 'ask';
    case 'commit':
      return 'deny';
    default:
      return 'deny';
  }
}

function decide(input, deps) {
  const tool = input && input.tool_name;
  const deadline = Date.now() + R10_BUDGET_MS;
  const gateDeps = Object.assign({}, DEFAULT_DEPS, deps, { deadline });
  if (R10_FILE_TOOLS.has(tool)) return fileToolDecision(input, gateDeps);
  if (tool !== 'Bash' && tool !== 'PowerShell') return { decision: 'allow', reason: 'no opinion on tool ' + String(tool) };
  if (tool === 'PowerShell' && isWorkerSlot(input.cwd)) return { decision: 'deny', reason: 'PowerShell tool - denied in Worker-slot sessions (R2)' };
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string') return { decision: 'deny', reason: 'missing or non-string command (fail closed)' };

  const findings = [];
  try { analyze(command, 0, findings); }
  catch (e) {
    if (e instanceof Unresolvable) return { decision: 'deny', reason: 'command could not be fully resolved (' + e.message + ') - fail closed' };
    throw e;
  }

  // R10-1: run a second classifier pass after shell escape removal. It is deny-only and never invokes the commit gate.
  const stripped = stripShellEscapes(command, tool);
  if (stripped !== command) {
    const alt = [];
    try { analyze(stripped, 0, alt); }
    catch (e) { return { decision: 'deny', reason: 'escape-normalized command could not be fully resolved - denied (R10-E)' }; }
    const norm = (arr) => arr.filter((f) => !(tool === 'Bash' && f.cls === 'git-program')).map((f) => f.cls + '|' + String(f.reason || '')).sort();
    const before = new Set(norm(findings));
    const revealed = norm(alt).find((x) => !before.has(x));
    if (revealed !== undefined) return { decision: 'deny', reason: 'shell escapes conceal a restricted operation - denied (R10-E)' };
  }

  if (Date.now() >= deadline) return { decision: 'deny', reason: 'r10 guard time budget exhausted - denied fail-closed (R10-7)' };
  const slot = isWorkerSlot(input.cwd);
  const gitCount = findings.filter((f) => f.cls === 'git-program').length;
  let best = { decision: 'allow', reason: 'no restricted operation detected' };
  const effective = tool === 'PowerShell' ? findings : findings.filter((f) => f.cls !== 'git-program');
  for (const f of effective) {
    if (Date.now() >= deadline) return { decision: 'deny', reason: 'r10 guard time budget exhausted - denied fail-closed (R10-7)' };
    if (f.cls === 'commit') {
      if (tool === 'PowerShell') continue;
      const g = commitGate(f, input.cwd, slot, gitCount, gateDeps);
      if (SEVERITY[g.decision] > SEVERITY[best.decision]) best = g;
      continue;
    }
    if (f.cls === 'reset') {
      const g = resetGate(f, input.cwd, slot, gateDeps);
      if (SEVERITY[g.decision] > SEVERITY[best.decision]) best = g;
      continue;
    }
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
    if (tool !== 'Bash' && tool !== 'PowerShell' && !R10_FILE_TOOLS.has(tool)) return { code: 0, stdout: '', stderr: '' };
    const toolInput = input.tool_input || {};
    if ((tool === 'Bash' || tool === 'PowerShell') && typeof toolInput.command !== 'string') return block('missing or non-string command (fail closed)');
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.env.CLAUDE_PROJECT_DIR;
    const r = decideFn({ tool_name: tool, tool_input: toolInput, cwd }, opts && opts.deps);
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

module.exports = { decide, runCli, isWorkerSlot, FAIL_CLOSED_EXIT, spawnBudgetMs, stripShellEscapes, KNOWN_GIT_SUBCOMMANDS };

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
