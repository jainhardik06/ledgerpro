# Module 3 — Agency Projects: Definition of Done

**Status: COMPLETE** — verified 2026-09-09.
Spec: Money OS Agency Vertical Phase 1, Module 3 (§34–127).

## Architecture

```
UI (list / workspace / wizard drawer / command palette)
  → /api/agency/projects (§82 routes)
    → requireAgencyPermission (§28: dashboard.read vs projects.manage)
      → domain service (src/lib/agency/domain/agency.projects.ts)
        → validators (src/lib/agency/validators/project.ts)
          → db.ts project repository (evolved in place — no fork)
```

Every mutation audits via `createLog` (§86–§88). No React component touches
MongoDB. No raw Mongo documents leave the API. The §113 identical-response
rule holds at every probe point (client, manager, member, project id).

## §125 — Final Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | End-to-end workflow: login → dashboard → clients → create client → projects → create project (billing model, budget, manager) → team → milestone → activate → dashboard | ✅ | Bruno `32-Agency-Projects-E2E` (12 requests, §105 order): signup → agency mode → login → client → list users → create project (MILESTONE, PM assigned, full budget) → member → work item → milestone → activate → workspace → dashboard metrics |
| 2 | Tenant isolation | ✅ | Integration: cross-tenant client/manager/member → 400 identical to missing; cross-tenant project GET/lifecycle → 404 identical to unknown; repository scoped by session tenant |
| 3 | Client integrity | ✅ | §80 enforced in domain + tests; re-parenting refused |
| 4 | Project integrity | ✅ | §81 user integrity; §111 code uniqueness (409 + unique index); §114 invariants; membership unique index |
| 5 | Permission checks | ✅ | 401 unauthenticated; 403 NOT_AGENCY_TENANT; USER reads / admin writes (§28) |
| 6 | Auditability | ✅ | 15 audit event types; workspace Activity tab renders them; E2E #11 asserts activity ≥ 1 |
| 7 | Mobile UX | ✅ | List swaps table→cards; wizard drawer responsive; DOM order = mobile priority |
| 8 | Error handling | ✅ | 400/401/403/404/409/500 all covered with identical cross-tenant bodies (§113) |
| 9 | Tests | ✅ | Vitest 268/268 (46 project unit + 10 metrics unit + 37 integration); Bruno 48/48 requests, all assertions green |
| 10 | Production build | ✅ | `next build` EXIT=0; Bruno runs against the production server (`next start`), not dev |

## §110 — Performance / Indexes

`projects`: `{tenantId, status}`, `{tenantId, clientId}`, `{tenantId, startDate}`,
`{tenantId, projectManagerId}`, `{tenantId, normalizedCode}` (§111 uniqueness
probe). `project_members`: `{tenantId, projectId}` and `{projectId, userId}`
UNIQUE. `work_items`: `{tenantId, projectId, status}`.

## §117–§119 — UX Principles

- Progressive disclosure: 7-step wizard, one concern per step; the workspace
  reveals detail on demand.
- Command palette: Create Client, Create Project, **Search Projects**
  (navigate + focus), **Open Active Projects** (status-filtered deep link),
  Go to Agency Clients/Projects, View Profitability.
- Deep linking: `?status=ACTIVE` pre-sets the list filter; `/dashboard/agency/projects/[id]` is fully linkable.
- No notification spam: advisory warnings render inline in the workspace.

## §120 — Documentation Deliverables

| Deliverable | File |
|---|---|
| Projects domain model | `projects-domain.md` |
| Projects API reference | `projects-api.md` |
| Project lifecycle rules | `project-lifecycle.md` |
| Project financial model | `project-financial-model.md` |
| Module 3 acceptance | `projects-acceptance.md` (this file) |

## §106–§108 — Migration & Compatibility

- `projectId` on transactions is OPTIONAL (§90); existing transactions are
  never auto-assigned (§107); core Money OS behavior unchanged.
- No destructive migration: new collections and optional fields only;
  default-on-read means old rows keep working.
- Local JSON fallback (`connectDb` → `initLocalDb`) mirrors every new
  repository branch, so the local/dev path is behaviorally identical.

## Verification gates (final run, 2026-09-09)

`npx tsc --noEmit` — 0 errors · `npm run lint` — 0 errors ·
`npx vitest run` — 268/268 · `npx next build` — success ·
Bruno (local env, production server :3000) — all requests + assertions green.
