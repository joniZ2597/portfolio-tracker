# findings — copy-ready tables

## A. Finding table (pilot or DEV evidence)

One row per finding. Primary class is mandatory; a secondary class only when the evidence shows a
second cause. Exact observed values are mandatory: the string, the number, the ticker, the surface.

```markdown
### Findings — <scenario> — <date> — <build marker>

| ID | Ticker | Primary | Secondary | Observed (exact) | Expected / why wrong | Surface (function) |
|---|---|---|---|---|---|---|
| <M1> | <TICKER> | A / B / C / D | — / A / B / C / D | "<exact text or value>" | <what the data or rule says> | <function from references/ai-surfaces.md> |

Classes: A deterministic · B AI narrative / prompt · C source / data · D portfolio-awareness.
Counts: A <n> · B <n> · C <n> · D <n> (secondary counted separately).
```

## B. Wording-check table (offline)

```markdown
### Wording checks — baseline <commit>

| Surface (function) | Check | String / term | Expected | Result | Planted negative |
|---|---|---|---|---|---|
| <function> | exact string | "<new string>" | present exactly once | PASS / FAIL | <id>: old string re-introduced → FAIL |
| <function> | banned term | `<regex>` | 0 hits in output and prompt | PASS / FAIL | <id>: term re-introduced → FAIL |
| <function> | enum → display | `<enum>` → "<display>" | via the real mapping function | PASS / FAIL | <id>: mapping removed → FAIL |

Live calls: none.
```

## C. Consumer-impact note

```markdown
### Consumer impact — <changed field or string>

| Consumer (function) | What it displays | Covered by the brief | Assertion |
|---|---|---|---|
| <function> | <label / grouping / persisted field> | yes (<§>) / no → STOP | <assertion id> |
```

## D. DEV hand-off (to browser-integrity-qa)

```markdown
### DEV hand-off

- Approved live step: <from the brief> — triggered by the Owner or COWORK, not by this task.
- Evidence fields to extract: <list>.
- Permitted `pt_*` changes: <list>.
```
