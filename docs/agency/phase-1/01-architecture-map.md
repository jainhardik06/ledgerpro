# 01 — Agency Architecture Map (Step 0.2)

**Document status:** Step 0.2 deliverable — the authoritative map of where Agency Phase 1 code lives and the rules that govern it.
**Depends on:** `00-current-state.md` (baseline & compatibility contract).
**Question this document answers:** *"Where does every piece of Agency code go, and what must never leak into core?"*

---

## 1. Mapping Principle

The existing repo separates concerns cleanly:

```text
src/app          → routes (pages + API), grouped by Next.js route groups
src/components   → UI, split into /ui (primitives) and /dashboard (shell/feature)
src/lib          → server-side logic (db, auth, validation, analytics, rate limiting)
src/services     → thin client/server services (transactionService)
src/hooks        → React hooks
tests/bruno      → API tests
.maestro/flows   → E2E mobile flows
.github/workflows → CI gates
docs/            → product/engineering docs
```

Agency gets its **own vertical slices** through each of these — never mixed into core files:

```text
src/
├── app/
│   ├── dashboard/
│   │   └── agency/                       ← Module 1 page (Command Center lives here first)
│   │
│   └── api/
│       └── agency/
│           └── dashboard/                ← Module 1 API (GET only, aggregated KPIs)
│
├── components/
│   └── agency/
│       └── dashboard/                    ← Module 1 UI components (KPI cards, health table, alerts)
│
└── lib/
    └── agency/
        ├── domain/                       ← entity types + repository functions (tenant-scoped)
        ├── analytics/                    ← calculation engine (KPIs, margins, burn) — PRD's "financials"
        ├── permissions/                  ← agency capability checks (wraps existing RBAC)
        ├── validators/                   ← agency input validation (extends src/lib/validation.ts conventions)
        └── queries/                      ← read-side aggregation queries (server-side, indexed)
```

`src/components/agency/dashboard/*` renders; **all business logic lives in `src/lib/agency/*`** — mirrored server-side (calculations) and shared types (client-safe).

## 2. Layer Contract

| Layer | Path | May import from | May never import from |
| --- | --- | --- | --- |
| API routes | `src/app/api/agency/**` | `lib/agency/*`, `lib/auth`, `lib/db`, `lib/logger` | components, pages |
| Domain (types + repos) | `src/lib/agency/domain` | `lib/db` (connectDb/TenantDAL), mongodb types | app, components, React |
| Analytics engine | `src/lib/agency/analytics` | domain, queries | app, components, React |
| Queries | `src/lib/agency/queries` | domain, `lib/db` | app, components, React |
| Permissions | `src/lib/agency/permissions` | `lib/auth`, domain types | app, components, React |
| Validators | `src/lib/agency/validators` | domain types | app, components, React |
| UI components | `src/components/agency/**` | `components/ui/*`, `components/dashboard/DashboardProvider`, domain **types** (client-safe), fetch API routes | lib/agency/analytics internals, lib/db directly |
| Pages | `src/app/dashboard/agency/**` | `components/agency/**`, `components/ui/*`, `DashboardProvider` | lib/db, lib/agency internals beyond type imports |

**Hard rules (enforced in review, not lint — for now):**

1. No Agency business logic inside generic dashboard components (`components/dashboard/*`, `components/ui/*`).
2. No financial calculation in React pages/components — the API returns computed numbers; the page renders them (PRD §83).
3. No direct `lib/db` or MongoDB access from components/pages.
4. Agency API routes never trust `tenantId`/`userId`/ids from the request — resolve from `getSessionUser()`.
5. All agency entity reads/writes go through `lib/agency/domain` repositories that are tenant-scoped (via `TenantDAL` or explicit tenantId filters).

## 3. Module 1 — Agency Command Center (target file map)

```text
src/app/dashboard/agency/page.tsx            ← server component shell / client page (renders <AgencyCommandCenter/>)
src/app/api/agency/dashboard/route.ts        ← GET: authenticated, Agency-mode-gated, returns AgencyDashboardData

src/components/agency/dashboard/AgencyCommandCenter.tsx   ← layout: KPI rows + health table + alerts panel
src/components/agency/dashboard/KpiCard.tsx               ← single stat tile (uses components/ui/Card)
src/components/agency/dashboard/KpiRow.tsx                ← Revenue / Delivery / Profitability / Receivables rows
src/components/agency/dashboard/ProjectHealthTable.tsx    ← responsive table (uses components/ui/Table conventions)
src/components/agency/dashboard/AlertsPanel.tsx           ← deterministic alert list

src/lib/agency/domain/agency.entities.ts     ← AgencyProject, AgencyKpi, ProjectHealthRow, AgencyAlert (types for Module 1; grows per sprint)
src/lib/agency/domain/agency.repository.ts   ← tenant-scoped reads of agency data
src/lib/agency/analytics/dashboard.ts        ← calculateDashboardKpis() / calculateProjectHealth() — pure functions
src/lib/agency/queries/dashboard.queries.ts  ← server-side aggregation queries
src/lib/agency/permissions/agency.permissions.ts ← isAgencyMode(tenant), requireAgencyCapability()
src/lib/agency/validators/agency.validators.ts   ← shared input validators (empty for Module 1, contract established)
```

Types re-exported for client use via `src/lib/agency/domain/agency.entities.ts` (types only — no server imports in that file, so it stays client-safe).

## 4. Route & Navigation Integration (minimal, Module 1)

- **Page:** `/dashboard/agency` (new; nothing existing changes).
- **Sidebar:** `src/app/dashboard/layout.tsx` gets ONE conditional — when `tenant?.appMode === 'Agency'`, the sidebar replaces the "Command Center" entry (or adds "Agency Command Center" at top). No other nav changes until later modules.
- **Command Palette:** `src/components/ui/CommandPalette.tsx` gets ONE contextual addition — a "Go to Agency Command Center" command for Agency-mode users (same pattern as existing `Workspace` section entries, needs `tenant` from `/api/auth/me` → `/api/tenant` like `DashboardProvider` does).
- **API gate:** `/api/agency/*` routes check `session`, `session.tenantId`, resolve the tenant, and 403 when `appMode !== 'Agency'` (see `permissions`).

## 5. Data-Layer Placement (for later steps, mapped now)

- New Agency collections (projects, project_members, work_items, rate cards, time entries, invoices, payments, alerts…) — all tenant-bound, created/indexed in `connectDb()` alongside existing indexes.
- Agency metadata on the existing `transactions` collection — nullable fields only (PRD §26): `projectId?`, `billable?`, `markupPercent?`, `expenseStatus?`, `invoiceId?`, `vendor?`, `receiptReference?`.
- The local-JSON fallback (`.data/local_db.json`) gets the same agency collections in `LocalDbSchema` so dev/CI parity holds.
- All repository functions in `lib/agency/domain` accept `tenantId` (session-resolved) — never infer it from payloads.

## 6. Naming & Convention Standards

| Thing | Convention | Example |
| --- | --- | --- |
| Collections | lower_snake plural | `agency_projects`, `rate_cards`, `time_entries` |
| Files in lib/agency | `agency.*.ts` or domain nouns | `agency.entities.ts`, `dashboard.queries.ts` |
| API responses | normalized JSON `{ success, data?, error? }` matching existing route style | |
| Audit | `createLog(username, action, details, tenantId)` — agency actions prefixed `Agency:` | `Agency: Viewed Command Center` is not needed (read-only); mutations get `Agency: Create Project` etc. |
| Analytics events | PostHog via `captureEvent`, names in `docs/EVENT_TAXONOMY.md` style | `AGENCY_DASHBOARD_VIEWED` |
| Errors | throw/return with clear messages; API routes 401/403/404/400 per existing conventions | |
| Types | exported interfaces, camelCase fields, ISO dates or `YYYY-MM-DD` strings matching core `Transaction.date` | |

## 7. What This Map Explicitly Forbids (recap of §2 + §00.12)

- No `if (agency)` sprinkled through core pages — one conditional in the layout nav + palette entry + API gate, everything else lives in agency paths.
- No new top-level folders; no renaming of core files.
- No Agency code touching growth-DB collections or super-admin routes.
- No client-side recomputation of KPIs returned by the API.

---

*This map is binding for Module 1 implementation. Deviations require updating this document first.*
