# Browser Integrity QA — report template

Copy into `review.md` or the pilot note. One report per approved scenario. Values: `PASS`, `FAIL`,
`N/A (reason)`, `NOT IN SCOPE`, `NOT VERIFIED` as the Skill defines them.

```markdown
## Browser Integrity QA — <task id> — <date>

- Tested URL: <DEV URL>
- Deployed commit / build marker: <sha or marker, as observed in the page>
- Approved scenario: <from the brief's live-actions section>
- Approved live actions: <n>; performed: <n> (<list: e.g. 1 scan of NVDA>)

### Always-required
| Check | Result |
|---|---|
| `pt_results` byte-identical before/after | PASS / FAIL / N/A (scan was the approved action) |
| no unexpected `localStorage` writes or new keys | PASS / FAIL — permitted: <keys> |
| `pt_scan_telemetry` absent | PASS / FAIL / N/A (in scope) |
| memory-only stores absent after fresh reload | PASS / FAIL — <stores checked> |
| client gate flags on fresh load | <observed; hostname-enabled vs manually set> |
| app-level console errors | <count and classification; extension / message-channel noise separate> |

### Scope-conditional
| Check | Result |
|---|---|
| endpoints / statuses / call counts | PASS / FAIL / NOT IN SCOPE |
| canary or live API scenario | PASS / FAIL / NOT IN SCOPE (approved limit: <n>) |
| `<frontend_aesthetics>` requirements (CLAUDE.md) | PASS / FAIL / NOT IN SCOPE |

### Pre/post `pt_*` table (every `localStorage` key; `pt_*` rows first)
| Key | Pre hash (prefix) | Post hash (prefix) | Changed | Permitted by the brief |
|---|---|---|---|---|
| `pt_results` | <8 hex> | <8 hex> | yes / no | yes (<scanned entries>) / no |
| `pt_date` | … | … | … | … |
| `<other pt_* key>` | … | … | no | — |
| `<non-pt_ key with a changed hash>` | <8 hex> | <8 hex> | yes | yes / no |
| `<added or removed key, any prefix>` | — / <8 hex> | <8 hex> / — | added / removed | yes / no |

### Actions performed
| # | Action | Target | State check before retry | Result |
|---|---|---|---|---|
| 1 | <toggle inScan / scan / add / remove> | <ticker(s)> | <n/a or what was checked> | done / not fired / duplicated-prevented |

### Restore
- Selection restored to baseline: PASS / FAIL
- Active ticker restored: PASS / FAIL / N/A
- Temporary tickers removed: PASS / FAIL / N/A
- Session scratch keys cleared: PASS / FAIL

### Gate state
- Documented (brief / plan.md): <state>
- Runtime-verified: <state with evidence> / NOT VERIFIED

### Console findings
<app-level errors; noise classified separately>

### Evidence extracted (chunked, URLs and query strings stripped)
<field: value … per the brief's evidence list>

### Limitations
<scenarios not exercised, time-gated sessions, live checks not approved, unrendered UI, deferred validation>

### Required closeout action
NONE / <action>
```
