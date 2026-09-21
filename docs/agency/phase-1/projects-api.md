# Module 3 — Agency Projects: API Reference

**Status: COMPLETE** — verified 2026-09-09.
Spec: §82–§85, §113. Route source: `src/app/api/agency/projects/`.

## Pipeline (§30 order, every handler)

```
authenticate → resolve tenant → verify Agency capability
  → authorize (§28 split) → validate → operate (domain) → audit → respond
```

Authorization: reads ride `agency.dashboard.read` (USERs may read);
every write rides `agency.projects.manage` (TENANT_ADMIN / SUPER_ADMIN only).
Non-agency tenants get 403 `{code: 'NOT_AGENCY_TENANT', redirectTo: '/dashboard'}`.

No raw Mongo documents leave the API — `mapProjectDoc` maps to the public
Project shape; label maps (`clientLabels`, `managerLabels`, `userLabels`)
resolve names so the UI never renders bare ids.

## Endpoints

| Method & path | Purpose | Spec |
|---|---|---|
| `GET /api/agency/projects` | list + search + filters + sort | §69/§82 |
| `POST /api/agency/projects` | create (DRAFT; wizard `members` ride along) | §37/§71/§74 |
| `GET /api/agency/projects/[id]` | workspace payload (project + members + work items + milestones + activity + labels) | §65/§102 |
| `PATCH /api/agency/projects/[id]` | partial update (never status, never clientId) | §25-style |
| `POST /api/agency/projects/[id]/[action]` | lifecycle: activate · pause · complete · cancel · archive | §41/§75 |
| `POST /api/agency/projects/[id]/members` | add member | §59/§83 |
| `PATCH /api/agency/projects/[id]/members/[memberId]` | update membership (identity fixed) | §83 |
| `DELETE /api/agency/projects/[id]/members/[memberId]` | remove membership (row goes, user stays) | §83 |
| `POST /api/agency/projects/[id]/work-items` | create work item | §61/§84 |
| `PATCH /api/agency/projects/[id]/work-items/[itemId]` | update work item | §84 |
| `POST /api/agency/projects/[id]/milestones` | create milestone | §45/§46/§85 |
| `PATCH /api/agency/projects/[id]/milestones/[milestoneId]` | update milestone | §85 |

`POST /api/transactions` accepts an optional `projectId` (§90) — never
mandatory, no existence enforcement at the core boundary (§107); existing
transactions are never auto-assigned.

## Query parameters — GET list (§69)

| Param | Notes |
|---|---|
| `search` | matches project name, code, or client name |
| `status` | one of PROJECT_STATUSES |
| `billingModel` | FIXED_FEE / TIME_AND_MATERIALS / MILESTONE |
| `clientId`, `projectManagerId` | filters |
| `page`, `limit` | limit clamped 1–100 (default 25) |
| `sort` | whitelist: `createdAt` (default), `startDate`, `endDate`, `contractValue`, `status` |
| `sortDir` | `asc` / `desc` (createdAt defaults desc, others asc) |

Unknown sort fields silently fall back to the default order — a stale link
still shows a list. ARCHIVED is hidden unless `includeArchived` (§40).

## Responses

- Advisory warnings (§73/§75/§115) return WITH the success status as
  `warnings: string[]` — problems are surfaced, never silently swallowed.
- Errors: 400 invalid payload / illegal transition / over-allocation;
  404 unknown-or-cross-tenant (identical bodies, §113); 401 unauthenticated;
  403 wrong vertical or non-admin write; 409 duplicate member or duplicate
  code (§111); 500 guarded with a generic message.

## Audit events (§86–§88)

`PROJECT_CREATED`, `PROJECT_UPDATED` (financial-field changes name the
fields), `PROJECT_ACTIVATED` / `PROJECT_PAUSED` / `PROJECT_COMPLETED` /
`PROJECT_CANCELLED` / `PROJECT_ARCHIVED`, `PROJECT_MANAGER_CHANGED`
(Module 5 §50), `PROJECT_MEMBER_ADDED` / `PROJECT_MEMBER_REMOVED`,
`PROJECT_MEMBER_ROLE_CHANGED` / `PROJECT_MEMBER_ALLOCATION_CHANGED`
(granular §50; membership-date changes ride `PROJECT_MEMBER_UPDATED`),
`WORK_ITEM_CREATED` / `WORK_ITEM_UPDATED`, `MILESTONE_CREATED` /
`MILESTONE_UPDATED`.
