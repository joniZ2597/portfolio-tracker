# plan-sections — copy-ready blocks for `plan.md` and `review.md`

Fill every cell from a Grep / Read result or from the brief; a cell without a source is a gap, not
a guess. Name suites and symbols, never line numbers. Verify names at the task baseline.

## A. Coupling-sweep table (`plan.md`)

```markdown
### Coupling sweep — baseline `<commit>`, edit targets: `<fn1>`, `<fn2>`, `<file/region>`

| Suite | Symbol / pin | Class | What trips it | Tripped by the planned edit? | Covered by the brief? | ASK-tier? |
|---|---|---|---|---|---|---|
| `qa/<suite>.js` | `<key or constant>` | a / b / c / d / e | `<byte change / edit outside mask / new callee / signature / literal>` | yes / no / only if `<condition>` | yes (`<brief §>`) / no | yes / no |

Sweep matches brief: **yes / no** — `<if no: the uncovered rows, reported as STOP-1 material per AGENTS.md>`
Explained non-tripped hits: `<suite · symbol · why not tripped>`
```

## B. Requirement → assertion map (`plan.md`)

```markdown
### Requirement → assertion map

| Req (brief §) | Assertion id | Suite | Asserts | Planted negative |
|---|---|---|---|---|
| `<§n.m text>` | `<ID-n>` | `qa/<suite>.js` | `<what the assertion proves>` | `<negative id>` |

Every requirement has ≥ 1 row; every assertion id appears in exactly one requirement row.
```

## C. Planted-negative list (`plan.md`)

```markdown
### Planted negatives

| Negative id | Mutates (production source / fixture input) | Anchor (occurs exactly once) | Expected failing check | Positive control |
|---|---|---|---|---|
| `<NEG-n>` | `<file · function>` | `<literal or line>` | `<assertion id>` | unmutated source passes `<assertion id>` |
```

## D. Re-pin ledger (`review.md`)

```markdown
### Re-pin ledger

| Suite | Pin | EOL form | Old value | New value | Revert proof (reverting only the brief's listed lines restores the old value) |
|---|---|---|---|---|---|
| `qa/<suite>.js` | `<key>` | LF / CRLF | `<64-hex>` | `<64-hex>` | PASS / FAIL |

Pins re-pinned: `<n>`, all named in the brief at `<§>`. Pins the brief does not name: none.
```

## E. Closing sweep (`review.md`)

```markdown
### Sweep re-run at the final diff

Baseline `<commit>`, same edit targets. New hits since `plan.md`: none / `<rows>`.
Suite count: `<n>` (from the runner's summary line in `qa.log`; baseline `<n>`).
```
