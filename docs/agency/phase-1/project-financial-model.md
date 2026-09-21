# Module 3 — Project Financial Model

**Status: COMPLETE** — verified 2026-09-09.
Spec: §43–§57, §66, §72. Source: validators
(`src/lib/agency/validators/project.ts`), dashboard scopes
(`src/lib/agency/metrics/project-metrics.ts`).

## Truth labels (§66)

Module 3 knows **PLANNED** economics only. Every surface is labeled as a
plan; ACTUAL / BILLED / COLLECTED arrive with Time Tracking and Invoicing and
are never rendered as fake zeros. On the dashboard, project-owned metrics
report `sourceReady: true` while invoice/payment/time-owned metrics stay
`sourceReady: false` until their modules land.

## The planned fields

| Field | Meaning | Rules |
|---|---|---|
| `contractValue` | the negotiated fee (§43) | FIXED_FEE draft without it (and without revenueBudget) → advisory warning, never a reject (§73) |
| `revenueBudget` | the commercial ceiling (§51) | = contractValue for fixed fee; expected billable value for T&M; Σ milestone amounts for milestone projects. Deliberately separate from contractValue so change orders can diverge them (§52) |
| `budgetCost` | planned cost of delivery (§53) | may legitimately equal revenueBudget (100% cost budget) — warned about only via the margin math |
| `targetMargin` | 0–100 (§54) | advisory only |
| `plannedHours` | delivery baseline for future Time Tracking (§56) | never interpreted as actuals |

Derived, never stored:

- **planned margin** = (revenueBudget − budgetCost) / revenueBudget — needs
  BOTH baselines, otherwise honestly "—" (§54)
- **implied cost/hour** = budgetCost / plannedHours — needs both, otherwise
  "—" (§57)
- **implied rate/hour** = revenueBudget / plannedHours (§57) — shown by the
  creation wizard's Budget step

## Validation posture (§73)

Everything commercial is optional at creation (a draft may have no numbers);
the activation gate (§75) turns the important gaps into warnings and only
the structural gaps into rejects. Impossible margins (cost above revenue)
surface as advisory messages with the exact rounded figure, not blocks.

## Smart defaults (§49/§72)

Selecting a client in the wizard pre-fills empty commercial fields from the
client's `commercialDefaults` (currency, billing model), falling back to
`billingProfile`. User-entered values are NEVER overwritten; no defaults and
missing client are no-ops. Implementation is a pure module
(`src/lib/agency/defaults/project-defaults.ts`) shared by wizard and tests.

## Dashboard aggregation (§6/§91)

Over ACTIVE projects: `contractedRevenue` = Σ(contractValue ?? revenueBudget);
`plannedMargin` aggregates (ΣrevenueBudget − ΣbudgetCost) / ΣrevenueBudget
when both baselines exist, else null. Portfolio rows span
ACTIVE ∪ ON_HOLD ∪ COMPLETED. A project with no value is a REAL zero in the
sum — absent data is "not set", not zero.
