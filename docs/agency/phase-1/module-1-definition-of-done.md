# Module 1 — Agency Command Center: Definition of Done (Module 1.29)

Status: **COMPLETE** — verified 2026-09-09.

Every item below was verified against the running application, the test
suite, or the production build — not assumed. Evidence points to the file
or test that proves each item.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Agency route exists | ✅ | `src/app/dashboard/agency/page.tsx` (Agency Command Center, capability-gated) |
| 2 | Agency dashboard API exists | ✅ | `src/app/api/agency/dashboard/route.ts` — GET, grouped Module 1.17 contract, `force-dynamic` |
| 3 | Agency authorization works | ✅ | `src/lib/agency/permissions/authorization.ts` + `vertical.ts` (Session → Tenant → Agency Mode → Permission); `tests/integration/authorization.test.ts` (15 tests: 401 / 403 codes / role matrix / deny-by-default) |
| 4 | Tenant isolation works | ✅ | `tests/integration/security.test.ts` — tenant always resolved from the verified JWT (URL `tenantId` ignored), no cross-tenant identifiers in payloads; Bruno E2E against the live DB |
| 5 | Date filtering works | ✅ | `tests/integration/date-filtering.test.ts` (13 tests: all five periods, year/quarter boundaries, equal-length previous window, tenant-tz scope) |
| 6 | KPI contract is stable | ✅ | `src/lib/agency/types/agency.dashboard-metrics.ts` + `metrics.ts` constructors; `tests/integration/dashboard-aggregation.test.ts` pins kinds/values/`sourceReady` |
| 7 | Project health contract is stable | ✅ | `src/lib/agency/types/agency.dashboard.ts` (`ProjectHealthRow`) + deterministic engine `domain/project-health.ts`; `tests/unit/project-health.test.ts` (17 tests) |
| 8 | Receivables contract is stable | ✅ | `AgencyReceivablesSummary` (outstanding / dueSoon / overdue / overdueCount / aging buckets); `tests/unit/receivables-aging.test.ts` |
| 9 | Unbilled contract is stable | ✅ | `AgencyUnbilledSummary` — `totalUnbilled` always the derived sum of the three lines; pinned in `dashboard-aggregation.test.ts` |
| 10 | Profitability contract is stable | ✅ | `domain/profitability.ts` single engine; `tests/unit/profitability.test.ts` (margin null on zero revenue, PRD 43.4% example) |
| 11 | Empty states exist | ✅ | `EmptyAgencyState` (Module 1.21 welcome panel, honest primary action) — shown when the portfolio is empty |
| 12 | Error states exist | ✅ | ERROR branch with retry; UNAUTHORIZED branches (AUTH / TENANT / CAPABILITY) — `page.tsx`, copy in `screen-state.ts` |
| 13 | Loading states exist | ✅ | Skeleton (no numbers, no zeros) + `aria-busy`; refetch indicator in `AgencyHeader` |
| 14 | Partial data states exist | ✅ | `sourceReady: false` → "—" + named pending source ("Waiting for time tracking"), never ₹0 — `KpiCard`, `PrimaryKpiRow`, per-section pending notes (Module 1.22) |
| 15 | Mobile layout works | ✅ | Module 1.23 DOM order = mobile order (KPI → alerts → table → receivables → unbilled → profitability → delivery → trends); responsive grids throughout |
| 16 | Accessibility passes | ✅ | Module 1.24: semantic headings, `scope="col"`, sr-only chart summaries (`figcaption`), sr-only severity/direction text, dot+text status badges, global `:focus-visible`, ≥4.5:1 pending-note contrast |
| 17 | Unit tests pass | ✅ | `npx vitest run` — **109/109** across 9 files |
| 18 | API tests pass | ✅ | Route-handler integration tests in `tests/integration/` (grouped contract, Server-Timing, 400/401/403 shapes, no raw Mongo documents) |
| 19 | E2E tests pass | ✅ | `tests/bruno/30-Agency-E2E/` — signup → mode switch → login → dashboard → metrics → period filter → alerts → Standard-tenant rejection: 7/7 requests, 28/28 assertions |
| 20 | Security tests pass | ✅ | Tenant A↔B isolation + vertical boundary (vitest) and the live-DB E2E legs — all green |
| 21 | Cross-vertical regression passes | ✅ | `tests/integration/cross-vertical.test.ts` + `tests/bruno/40-Cross-Vertical/` — Standard unchanged, Student Club unchanged, Agency available (10/10 requests) |
| 22 | Production build passes | ✅ | `npx next build` EXIT=0 (verified after the final fix) |
| 23 | Observability exists | ✅ | `analytics/observability.ts` — `trackAgencyOperation` (duration/error telemetry), `DASHBOARD_PERFORMANCE_TARGET_MS`, `durationBucket`; `Server-Timing` header on every dashboard response; client TTFB/API/render reporting |

## Notable defect caught by the Module 1.26 matrix

The E2E flow exposed a production bug: `getTenantById()` (`src/lib/db.ts`)
dropped `appMode` in its MongoDB branch, so every Mongo-backed tenant
resolved as Standard and the Agency gate rejected legitimate Agency tenants
after login. The local-JSON branch (and the mocked unit tests) passed
because it spreads the full tenant. Fixed in the same session; the E2E now
runs green against the real database.

## Module 1.30 — explicitly NOT built (verified absent)

Grep-verified across `src/` — none of these exist, and none may be
simulated (binding rule #10 in `src/lib/agency/queries/conventions.ts`):

- AI recommendations
- AI financial assistant
- Resource heat maps
- Retainer burn engine
- Scope-creep AI
- Client portal
- Proposal analytics
- Advanced sales forecasting
- Predictive cash flow

The only "AI" reference in the Agency vertical is the health engine's
"NO AI (PRD §51)" note — it is deterministic by design. Labeled
information-architecture placeholders are permitted; fabricated capability
is not. When one of these ships, its line is deleted from the rule in the
same commit.
