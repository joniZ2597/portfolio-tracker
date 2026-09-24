# Task brief: NC-M1 — Briefing projection

This brief has operational effect only when the Owner has approved these exact contents and the
brief-only commit records them unchanged.

| | |
|---|---|
| ARC / Slice | **NC** (PLAN-READY) · **M1** Briefing projection · **Phase 1** |
| Preparation baseline | **`0c99e13`** = `branch-dev` (revalidated from `aa62aea`, 2026-09-24) |
| Last validated | `0c99e13`, 2026-09-24 — `index.html`, `qa/run-offline.js`, `qa/vis_score_caliper_offline.js` and `qa/eod_packet_v0_offline.js` are **byte-identical** across `aa62aea..0c99e13`; §5 scope, the caliper note and Lane-B serialization are unaffected |
| Branch / worktree | new `task/nc-briefing-projection`, separate worktree |
| `qa:offline` | **no change** — no suite added; assertions go into the existing EOD suite (effective count **46**) |
| Status | **CODE-READY** — brief committed `f2c94d0`; §10 revalidation performed against `0c99e13` |

**Objective.** A pure projector that turns the existing EOD packet into the daily briefing source
document, plus a frozen versioned prompt constant. **Deterministic, offline, no network.**

---

## 1 · Standing rulings carried in (not reopened)

| Ruling |
|---|
| **Separate `_eodPacketToBriefing` projector** — not an extension of `_eodPacketToMarkdown` |
| **Frozen, versioned prompt in repo** |
| **Whole portfolio is the default briefing scope** |
| **The existing EOD packet is the source boundary** |
| **No Notebook → Pulse writes or actions**, in any phase |
| **No second weight formula** — `eod.weight.pct` is authoritative |
| **DR / TJ / PL / S2 / S3 are not prerequisites** |
| **Phase 1 M1 is deterministic briefing projection only** |

## 2 · Reality check at `aa62aea`

| Component | State |
|---|---|
| `_eodBuildPacket` (`index.html:2671`) | exists, **strictly pure** — no storage, globals or DOM; every read hoisted into `_eodExportPacket` |
| `_eodPacketToMarkdown` (`:2867`) | exists — already renders `## Limitations`, `## Portfolio` |
| `_eodExportPacket` (`:2921`) | exists — the single ordered-I/O site; already downloads `.json` + `.md` via `_ptDownload` |
| `_ptDownload` | exists, 5 call sites |
| `packet.limitations[]` | exists as `{code, text}` — an already-authored data-limitation channel |
| Per-symbol `research.coverage` | closed vocabulary: `researched` · `failed` · `zero-accepted` · `not-researched` |
| `eod.weight` | exists as `{pct, unavailableReason}` per holding |
| `qa/eod_packet_v0_offline.js` | exists, **73** assertions |

**Conclusion: the PREP is satisfiable.** M1 adds a projector and a constant; it introduces no data
source, no computation and no network call.

## 3 · Scope

- `_eodPacketToBriefing(packet)` — a **pure** sibling of `_eodPacketToMarkdown`, never a replacement.
- `NOTEBOOK_BRIEFING_PROMPT` — one frozen, **version-tagged** top-level constant.
- One export action in the existing `_eodExportPacket` I/O site, reusing `_ptDownload`.

**State wording rule.** The projector **transports** `limitations[].text` and coverage states
**verbatim**; it does not author new state vocabulary. Any wording the projector must add of its own
lives in **one mapping table in one place**, so adopting DH-M0b later is a table edit, not a rewrite.

## 4 · Out of scope

Bridge integration (M3) · media generation/retrieval (M4) · reliability/automation (M5) ·
**portfolio-aware personalization (M6, Phase 2)** · weekly/monthly/history synthesis (outside the
ARC) · any change to `_eodBuildPacket`, `_p5BuildLocalContext` or any `_pf*` calculation · any
Notebook API call.

## 5 · Expected implementation files — **3**

```
index.html                              + _eodPacketToBriefing (pure)
                                        + NOTEBOOK_BRIEFING_PROMPT (frozen constant)
                                        + one export action inside _eodExportPacket
qa/eod_packet_v0_offline.js             + briefing-projection assertions (existing suite)
work/nc-briefing-projection/review.md   NEW  tracked task artifact
```

**No new suite. Suite count unchanged.**

**Caliper note:** the EOD functions are **not** in `PROTECTED_FN_HASHES` (which pins `_ptScore*`,
`_srGroupResults`, `_srRenderGrouped`, `renderMainPanel`). **No caliper pin is expected to move** —
the Worker confirms this at gap-check; a pin movement is a STOP.

**Lane:** **B**. Touches `index.html`, so it is subject to the one-`index.html`-task-at-a-time
serialization.

## 6 · QA boundary

| ID | Assertion |
|---|---|
| **NB-1** | `_eodPacketToBriefing` is **pure** — two calls on one packet are byte-identical; extracted source free of `fetch`, `localStorage`, `document.`, `Date.now`, `Math.random` |
| **NB-2** | **every `packet.limitations[]` entry appears in the briefing text** — nothing silently dropped |
| **NB-3** | every holding's `research.coverage` appears explicitly |
| **NB-4** | **`_eodPacketToMarkdown` output is byte-unchanged** — the briefing is additive |
| **NB-5** | `NOTEBOOK_BRIEFING_PROMPT` exists exactly once and is version-tagged |
| **NB-6** | fixture packet with `weight.pct: null` for each of the three reasons renders **the reason in prose** — never blank, `0%` or `—` |
| **NB-7** | a packet with `total-incomplete` reconciliation **and** a stale EOD entry renders both states |
| **NB-8** | negative — no network primitive in the projector's extracted source |

**NB-6 is the load-bearing one:** an audio briefing cannot show a dash, so a null weight must be a
sentence.

## 7 · STOP conditions

1. Any file beyond the three in §5, or `review.md` absent from the implementation commit.
2. Any change to `_eodBuildPacket`, `_p5BuildLocalContext`, or any `_pf*` calculation.
3. **Any change to `_eodPacketToMarkdown` output** — the briefing is additive.
4. Any second weight definition; any recomputation of `eod.weight.pct`.
5. Any network call, Notebook API call, credential or token.
6. Any storage write or new `pt_*` key.
7. Any scoring, ranking or persistence effect.
8. **Any silent omission of a degraded/stale/unavailable state from the briefing text.**
9. Any new state vocabulary authored outside the single mapping table.
10. Any Lane A file; any caliper pin movement; any suite added.
11. Any M3/M4/M5/M6 work.

## 8 · Lifecycle / CLOSE

**Reachable and satisfiable offline.** Required at LAND: `npm run qa:offline` at its then-current
count · the EOD suite green with NB-1…NB-8 named.

## 9 · Actor-to-Evidence Closure Check

| closeCondition | Evidence | Phase | Actor | Authority | Possessable before CLOSE? |
|---|---|---|---|---|---|
| Projector is pure | NB-1 | impl | Worker | none | **YES** |
| All limitations survive | NB-2 | impl | Worker | none | **YES** |
| Markdown output unchanged | NB-4 | impl | Worker | read of tracked baseline | **YES** |
| Null weight renders its reason | NB-6 | impl | Worker | none | **YES** |
| `qa:offline` PASS | gate run | pre-LAND | Worker | none | **YES** |
| Diff minimal | reviewed diff | review | Codex / Owner | review | NO — gate after CODE-READY |
| LAND | approval | LAND | Owner | LAND | NO — by design |

**SATISFIABLE.** No live call, no credential, no Notebook access required — M1 produces a file.

## 10 · Execution dependencies and revalidation

**Blocking dependency: none.** All design decisions are standing rulings; the EOD packet exists.

**Lane-B sequencing** applies (one `index.html` task at a time), and NC-M1's position in the Lane-B
order is the Owner's to set — it is **not** hard-coded behind entries 9/11/10/12.

**Revalidation trigger.** Before execution, re-verify: `_eodBuildPacket` still pure · `_eodPacketToMarkdown`
unchanged · `packet.limitations[]` still `{code,text}` · `eod.weight` still `{pct, unavailableReason}`
· EOD suite still green · no caliper pin covers the EOD functions. **Re-run whenever `branch-dev`
moves.**

## 11 · Definition of done

`_eodPacketToBriefing` exists and is pure; `NOTEBOOK_BRIEFING_PROMPT` exists once, version-tagged;
one export action emits the briefing; `_eodPacketToMarkdown` output byte-unchanged; NB-1…NB-8 pass;
`qa:offline` green at its then-current count; `review.md` carries `## Lessons`, the files-changed
block and the final-check line.

**Not claimed:** that any media was produced. M1 produces a document and a prompt; the bridge is M3.
