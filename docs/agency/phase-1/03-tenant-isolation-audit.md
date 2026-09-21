# 03 — Tenant Isolation Audit (Step 0.6)

**Document status:** Step 0.6 deliverable — verification of the existing isolation model before any Agency data is introduced.
**Depends on:** `00-current-state.md` §7, `02-data-boundary.md`.
**Method:** line-by-line inspection of every `.collection(...)` call in `src/lib/db.ts` and `src/app/api/**`, plus the DAL (`src/lib/dal.ts`) and `src/services/transactionService.ts`.

---

## 1. The Agency Isolation Rule (binding)

```text
Authenticated User  (JWT cookie, verified by getSessionUser)
      ↓
Authenticated Tenant  (session.tenantId → getTenantById; never from request body/query)
      ↓
Agency Resource  (every read/write filters: resource.tenantId === session.tenantId)
```

**Never trusted from the browser:** `tenantId`, `userId`, role, or any entity id as an authorization basis. Entity ids from URLs/bodies may only select *within* the already-scoped tenant filter.

## 2. Audit Findings — Existing Model

### 2.1 Correctly tenant-scoped (core finance data) ✅

| Access | Evidence | Pattern |
| --- | --- | --- |
| Transactions CRUD | `db.ts:772-849` | find/update/delete filter `{ tenantId }` or `{ _id, tenantId }` |
| Accounts CRUD | `db.ts:869-905, 1371` | `{ tenantId }` / `{ _id, tenantId }` |
| Categories CRUD | `db.ts:925-960, 1389` | `{ tenantId }` / `{ _id, tenantId }` |
| Budgets CRUD | `db.ts:1025-1425` | `{ tenantId }` / `{ _id, tenantId }` |
| Recurring CRUD | `db.ts:1076-1142` | `{ tenantId }` / `{ _id, tenantId }` |
| Clients CRUD | `db.ts:1163-1201, 1445` | `{ tenantId }` / `{ _id, tenantId }` |
| Users (tenant view) | `db.ts:652` | `{ tenantId }` |
| `TenantDAL` | `dal.ts:18-19` | force-injects `tenantId` into every filter; stamps on insert; throws on empty tenantId |
| `TransactionService` | `transactionService.ts:8-11` | constructs DAL with session-resolved tenantId |
| `/api/search` tenant data | `search/route.ts:33-63` | `tenantId` from session; Mongo and local-JSON paths both filter |
| `/api/tenant`, `/api/broadcasts/active` | `route.ts:15, 22` | `_id: safeObjectId(session.tenantId)` |
| All `[id]` routes (clients, categories, accounts, budgets, transactions) | e.g. `clients/[id]/route.ts:8-15` | resolve `session.tenantId`, pass into tenant-filtered db function |

### 2.2 Deliberately unscoped (platform-level, not tenant data) — acceptable, gated by SUPER_ADMIN role ✅

| Access | Gate |
| --- | --- |
| `tenants`, `flags`, `tickets`, `broadcasts`, `subscribers`, `incidents`, `maintenances` collections | super-admin routes / public marketing endpoints (newsletter, contact) |
| `getLogs(undefined)` | `/api/logs/route.ts:19-20` — only when `session.role === 'SUPER_ADMIN'`; tenant users get `getLogs(session.tenantId)` |
| `getAllUsers()`, global analytics | super-admin console routes |
| Super-admin cross-tenant search (`tenants`, `users`) | `search/route.ts:91` — role check |
| Username-dedup cleanup `users.find({})` | `db.ts:369` — one-time index self-healing at connect, not request-driven |

### 2.3 Observations (not violations, but rules for Agency to follow)

1. **`getLogs` optional tenantId** — the escape hatch exists; agency code must never use it. Only the super-admin path may pass `undefined`.
2. **Local-JSON fallback parity** — `search/route.ts` and `db.ts` both re-implement filtering for the fallback. Agency repositories must scope in *both* modes (the `TenantDAL` does not currently support the local JSON store — see §4).
3. **No middleware** — enforcement is per-route. Each new `/api/agency/*` route must gate itself (Step 0.5's `requireAgencyCapability` exists precisely for this).
4. **Super admin can see tenant data via impersonation** — by design; agency routes must accept this (impersonated sessions carry the target `tenantId` in the JWT).

**Verdict: no tenant-isolation breaches found in the existing model.** The declared invariant — every tenant-data query filters by session-derived `tenantId` — holds.

## 3. Agency Enforcement Layer (established at Step 0)

All future agency repositories extend `AgencyTenantRepository` (`src/lib/agency/domain/agency.repository.ts`), which makes the rule structural rather than per-call discipline:

- Constructed **only** with a session-resolved tenantId (throws otherwise — same contract as `TenantDAL`).
- Every find/update/delete goes through `TenantDAL` (auto-scoped filters).
- Cross-tenant id access is therefore impossible by construction: `{ _id, tenantId }` both required.
- Agency API routes never see a raw tenantId — they get `{ context: { session, tenant, vertical } }` from `requireAgencyCapability()` (Step 0.5) and pass `context.session.tenantId` down.

## 4. Known Limitations to Address During Module Sprints

| Limitation | Plan |
| --- | --- |
| `TenantDAL`/repositories work only against MongoDB (`connectDb` returns `db: null` in local mode) | Agency repos implement the local-JSON fallback per-sprint alongside each entity (keeps dev/CI parity, `00-current-state.md` §4) — or Module 1 stores its aggregates tenant-scoped in the same dual pattern |
| No automated isolation tests exist | PRD §102 tenant-isolation API tests added with the first Bruno agency suite (Module 1): 401/403/404 matrix incl. cross-tenant id probes |
| Rate limiting absent on read routes | Apply `checkRateLimit` to agency aggregation endpoints (dashboard) when wired in Module 1 |

---

*Any future agency PR that queries an agency collection without going through `AgencyTenantRepository` (or an explicit, reviewed tenant-scoped aggregation in `queries/`) violates this audit and must be rejected.*
