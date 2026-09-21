# Module 3 — Project Lifecycle

**Status: COMPLETE** — verified 2026-09-09.
Spec: §41, §74–§77, §112. Source: `canTransitionProjectStatus`
(`src/lib/agency/types/project.ts`) + domain actions
(`src/lib/agency/domain/agency.projects.ts`).

## The state machine (§41)

```
                 ┌────────────┐
      create     │   DRAFT    │  (every project starts here, §74)
   ────────────▶ │            │
                 └─────┬──────┘
              activate │ ╲ cancel
                       ▼   ╲
                 ┌────────────┐
        ┌───────▶│   ACTIVE   │───────┐
        │ resume │            │ pause │
        │        └────────────┘       ▼
        │             │          ┌────────────┐
        │   complete  │          │  ON_HOLD   │
        │             ▼          └────────────┘
   ┌────┴───────┐ ┌────────────┐
   │  COMPLETED │ │ CANCELLED  │  (terminal)
   └────┬───────┘ └────────────┘
        │ archive
        ▼
   ┌────────────┐
   │  ARCHIVED  │  (terminal)
   └────────────┘
```

Legal transitions, exactly:

| From | To |
|---|---|
| DRAFT | ACTIVE, CANCELLED |
| ACTIVE | ON_HOLD, COMPLETED, CANCELLED |
| ON_HOLD | ACTIVE, COMPLETED, CANCELLED |
| COMPLETED | ACTIVE (explicit reopen), ARCHIVED |
| CANCELLED, ARCHIVED | — (terminal) |

Status can NEVER be smuggled through a POST/PATCH payload — the validator
rejects any `status` field outright; only the dedicated actions move it.

## The activation gate (§75)

A project goes ACTIVE only through `POST .../[id]/activate`, which enforces:

**Hard rejects (400):**
- missing commercial core (client / name / billing model / currency)
- MILESTONE project with zero non-cancelled milestones
- an illegal source status (CANCELLED/ARCHIVED)

**Advisory warnings (returned with the 200):**
- FIXED_FEE with neither contractValue nor revenueBudget
- TIME_AND_MATERIALS with no plannedHours baseline
- MILESTONE whose percentage milestones total ≠ 100 (§115) — under-allocation
  is negotiable, so it warns rather than blocks

## Drafts (§74), reopen (§41), archive (§76)

- Creation always lands in DRAFT — configure first, activate when ready.
- COMPLETED → ACTIVE is the explicit reopen; the audit log says so.
- ARCHIVED is reachable only from COMPLETED and is terminal. Projects with
  financial history are never deleted (§112) — ARCHIVED simply drops them
  from default operational views.
