# Module 3 — Agency Projects: Domain Model

**Status: COMPLETE** — verified 2026-09-09.
Spec: Money OS Agency Vertical Phase 1, Module 3 (§34–127).

## The entity (§36–§38)

A **project** is the delivery unit that time, costs and revenue attach to. It
lives strictly inside one tenant and references exactly one client of that
same tenant.

```
Project
  id, tenantId
  clientId            §80 — must be a SAME-tenant client, enforced at every layer
  name                required
  code?               §38 — short code for time/invoices/reports; immutable once set
  normalizedCode?     §111 — uppercased/trimmed code, the uniqueness probe key
  description?, projectType? (§78), tags? (§79)
  billingModel        FIXED_FEE | TIME_AND_MATERIALS | MILESTONE
  currency            §89 — immutable after activation
  startDate?, endDate?
  contractValue?, revenueBudget?, budgetCost?, targetMargin?, plannedHours?
  projectManagerId?   §58 — accountability owner, NOT membership
  status              §41 lifecycle (DRAFT on creation, §74)
  createdAt, updatedAt
```

Type source: `src/lib/agency/types/project.ts`. Repository:
`src/lib/db.ts` (project collection + local JSON fallback).

### Satellite collections

| Collection | Meaning | Key rules |
|---|---|---|
| `project_members` | a user contributing to delivery (§59) | one row per (projectId, userId) — unique index (§110); `allocationPercent` is metadata only, never scheduling (§60) |
| `work_items` | financial context for future time tracking (§61) | NOT task management (§63); DONE is terminal; no delete anywhere (§84) |
| `project_milestones` | billing checkpoints (§45) | amount XOR percentage (§46); percentage sum ≤ 100 pre-write, ≠100 at activation is advisory (§114–§115) |

## Integrity (§80/§81/§113)

- clientId must resolve to a client of the **session tenant**. A cross-tenant
  client id and a missing id produce the **identical** 400 — never an
  existence leak.
- projectManagerId and every member userId must be same-tenant users, same
  identical-response rule.
- Project reads are scoped by (id, tenantId): cross-tenant and unknown ids are
  the same 404.
- Checks run in the domain service (`src/lib/agency/domain/agency.projects.ts`),
  which is the only writer path — React components never touch MongoDB.

## Duplicate protection (§111)

Project codes are unique per tenant. `findProjectByCode(tenantId, code,
excludeProjectId?)` probes by `(tenantId, normalizedCode)`; a hit on create —
or on setting a code on a codeless draft — is a 409 naming the clashing
project. The Mongo unique index `{tenantId: 1, normalizedCode: 1}` backs the
probe. Codes are immutable once set (§38).

## Soft deletion (§112)

Projects are never hard-deleted. ARCHIVED (reachable only from COMPLETED,
§76) removes a project from default operational views; future modules depend
on historical project references.

## Invariants (§114–§115)

1. Every project belongs to exactly one tenant and one same-tenant client.
2. Status changes only through the dedicated lifecycle actions (§41).
3. Currency cannot change after activation (§89).
4. `revenueBudget` is the commercial ceiling, distinct from `contractValue`
   (§51–§52) so change orders can later diverge them.
5. Milestone percentages never sum above 100 (hard, pre-write); a sum ≠ 100
   at MILESTONE activation is a warning, not a block (§115).
6. Membership is unique per (project, user) — duplicates 409.
