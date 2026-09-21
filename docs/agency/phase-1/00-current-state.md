# 00 — Current State Baseline (Money OS / LedgerPro)

**Document status:** Step 0.1 deliverable — frozen baseline of the current product before any Agency vertical work begins.
**Date frozen:** 2026-09-08
**Source of truth:** Direct audit of the repository (not memory or assumptions).
**Question this document answers:** *"What exists today, and what must remain untouched?"*

---

## 1. Product Identity

- **Repo:** `jainhardik06/ledgerpro`, branch `main`, single Next.js application (not a monorepo).
- **Product name:** Money OS (LedgerPro SaaS Edition).
- **Pitch:** Multi-tenant SaaS financial command center for Small Businesses, Freelancers, Student Clubs, and Agencies.
- **App modes (verticals):** `Tenant.appMode ∈ { 'Standard', 'Student_Club', 'Agency' }` — stored in DB, already modeled, but today only drives cosmetic terminology (see §7).

## 2. Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16.2.7, App Router only (no Pages Router), React 19.2.4 |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), dark Linear-style theme, `clsx` + `tailwind-merge` |
| Charts | Recharts 3 |
| Icons | lucide-react |
| Database | Native `mongodb` driver 7 (no Mongoose/Prisma), JSON-file fallback for local dev |
| Auth | `jsonwebtoken` (HS256, 7-day expiry) in httpOnly cookie `token`; `bcryptjs` hashing |
| Analytics | PostHog (js + node), GA4 (`@google-analytics/data`), Google Search Console |
| PWA | `@duancanh2912/next-pwa`, offline queue via IndexedDB (`idb`) |
| Excel | `xlsx` for exports |
| Node engine | 22.x |

## 3. Current Routes

### 3.1 App pages

| Area | Routes |
| --- | --- |
| Auth group `(auth)` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify`, `/invite`, `/error` |
| Marketing group `(marketing)` | `/about`, `/accessibility`, `/blog`, `/changelog`, `/contact`, `/contact-support`, `/cookie-policy`, `/docs`, `/dpa`, `/faq`, `/features/*` (7 sub-pages), `/guides`, `/pricing`, `/privacy`, `/refund-policy`, `/security`, `/status`, `/support`, `/support/getting-started`, `/terms`, `/use-cases/*` (agencies, freelancers, small-businesses, student-clubs) |
| Dashboard | `/dashboard` (Command Center), `/dashboard/transactions`, `/dashboard/accounts`, `/dashboard/budgets`, `/dashboard/recurring`, `/dashboard/clients`, `/dashboard/reports`, `/dashboard/team`, `/dashboard/growth`, `/dashboard/audit`, `/dashboard/settings` |
| Super Admin | `/super-admin/*` — analytics-diagnostics, attribution, audit, communications, discovery (directories, social), event-audit, features, growth, revenue, security, settings, support, tenants, users |
| Other | `/offline` |

### 3.2 API routes (`src/app/api`)

Core tenant-scoped domains: `auth/{login,logout,me,signup}`, `tenant`, `tenant/users[/id]`, `transactions[/id]`, `accounts[/id]`, `budgets[/id]`, `categories[/id]`, `clients[/id]`, `recurring[/id]` + `recurring/trigger`, `settings`, `logs`, `search`, `health`, `status`.

Platform domains: `super-admin/*` (analytics, audit, communications, features, impersonate, revenue, security, subscribers, support, tenants, users), `broadcasts/active`, `contact`, `internal/bot-track`, `newsletter/subscribe`.

**Route conventions:** each handler calls `getSessionUser()`, returns 401 when absent, resolves `session.tenantId` from the JWT (never from the request body), validates payloads, writes an audit log via `createLog()` for mutations, and returns normalized JSON. There is **no `src/middleware.ts`** — enforcement is per-route.

## 4. MongoDB Collections & Indexes

Collections in use: `tenants`, `users`, `transactions`, `accounts`, `categories`, `budgets`, `recurring`, `clients`, `logs`, `flags`, `tickets`, `broadcasts`, `subscribers`, `incidents`, `maintenances`, plus growth-DB collections (`directories`, `directory_submissions`, `social_profiles`).

Indexes created at connect time in `connectDb()` (`src/lib/db.ts:347`):

```text
transactions: { tenantId: 1, date: -1, createdAt: -1 }
logs:         { tenantId: 1, timestamp: -1 }
logs:         { action: 1, timestamp: -1 }
clients:      { tenantId: 1, createdAt: -1 }
budgets:      { tenantId: 1, category: 1, month: 1 }  (unique)
users:        { username: 1 }  (unique, case-insensitive collation, self-healing dedup)
```

**Persistence model (dual-mode):** if `MONGODB_URI` is unset → local JSON file `.data/local_db.json` (dev/CI only; production refuses to start without URI). Growth analytics uses a separate `MONGODB_GROWTH_URI` connection. Connection is a module-level singleton. **Every Agency entity must extend this model** — same connect pattern, tenant-bound collections, indexes created the same way.

## 5. Core Interfaces / Types (`src/lib/db.ts`)

| Entity | Key fields |
| --- | --- |
| `Tenant` | name, status (ACTIVE/SUSPENDED), plan (FREE/STARTER/ENTERPRISE), settings, limits.maxUsers, `appMode?`, attribution, createdAt |
| `User` | username (globally unique), passwordHash, role (TENANT_ADMIN/USER), tenantId, status (ACTIVE/LOCKED), attribution |
| `Transaction` | tenantId, userId, username, accountId?, `clientId?` (nullable), type (Credit/Debit), description, amount, date (YYYY-MM-DD), category?, notes? |
| `Client` | tenantId, name, email? — **minimal; no billing/GST/commercial fields** |
| `Category` / `Account` / `Budget` / `RecurringTransaction` | standard finance fields; Budget is category+month+limitAmount only (no project concept) |
| `SystemLog` | tenantId?, username, action, details, ipAddress?, severity (INFO/WARN/CRITICAL), timestamp |
| FeatureFlag, SupportTicket, Broadcast, NewsletterSubscriber, SystemIncident, SystemMaintenance | platform-level entities |

## 6. Authentication & Permission Model (current)

- JWT payload: `{ userId, username, role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER', tenantId?, impersonatedBy? }`.
- Cookie-based session, 7-day expiry; `getSessionUser()` verifies and decodes.
- Super Admin: global, has impersonation (`impersonatedBy` flag drives the rose "exit impersonation" bar).
- Tenant Admin: full org management (Team Workspace, Growth, Audit, Settings sidebar items in `dashboard/layout.tsx:80`).
- User: ledger operations only.
- **No capability/permission system exists.** RBAC is the 3-role hierarchy only. Rate limiting exists (`src/lib/rateLimit.ts`, in-memory `checkRateLimit(key, limit, windowMs)`), used on sensitive routes (login/signup).

## 7. Tenant Isolation Implementation

- **Primary pattern:** every `db.ts` function takes `tenantId` and scopes every find/update/delete by it. All data-bearing entities carry `tenantId`.
- **Newer pattern (DAL):** `src/lib/dal.ts` exports `TenantDAL` — a class constructed with a tenantId that force-injects `tenantId` into every filter on find/findOne/insert/update/delete (insert stamps it onto the doc). Throws if constructed with empty tenantId. Adopted only partially — most routes still call `db.ts` functions directly.
- `appMode` is cosmetic today: the only consumer is `src/app/dashboard/layout.tsx:23-24` (`clientTerm = appMode === 'Student_Club' ? 'Sponsors' : 'Clients'`).

**Agency must route all data access through tenant-scoped access — resolving tenantId from the session, never the client.**

## 8. Dashboard State Model

- `src/components/dashboard/DashboardProvider.tsx` — React context providing `user`, `tenant`, `loading`, `logout`; hydrates via `fetch('/api/auth/me')` then `/api/tenant`; re-fetches on route change.
- `src/app/dashboard/layout.tsx` — shell: desktop sidebar + mobile drawer nav, TopBar with breadcrumbs, BroadcastBanner, and the global `CommandPalette` (545 lines, `src/components/ui/CommandPalette.tsx`), opened via Cmd+K / `open-command-palette` event.
- UI primitives in `src/components/ui/`: `Drawer` (slide-over, mobile bottom-anchored close), `Card`, `Button`, `Input`, `Table`, `BrandMark`, `BetaBadge`, `Logo`.
- Design docs exist: `docs/BRAND.md`, `docs/COMPONENT_GUIDELINES.md`, `docs/MOTION.md`.

## 9. Financial Calculations (current)

- **Where they live:** client-side inside dashboard pages (e.g. `/dashboard` Command Center computes cash flow from fetched transactions; `/dashboard/reports` computes totals per tab in the page component) plus a thin `src/services/transactionService.ts` (50 lines).
- **Cash balances:** derived from `Account.initialBalance` + sum of its transactions (computed in API/pages, not a stored balance).
- **Budget logic:** category/month `limitAmount` vs. summed transactions for the category/month, with warning/critical risk thresholds in the UI.
- **Recurring engine:** "login-evaluated trigger" — `/api/recurring/trigger` back-posts missed transactions on login, avoiding a 24/7 cron.
- **Reports:** per-tab aggregation in the Reports page, 1-click CSV export (`page.tsx:450`), print-ready PDF via browser print.
- ⚠️ **There is no server-side domain calculation layer.** This is a gap the Agency vertical must not repeat — PRD §83 requires all agency financial math in shared domain services, never in React pages.

## 10. Testing Coverage

| Type | Status |
| --- | --- |
| Bruno API tests | `tests/bruno/00-Smoke` (Health Check) — run via `npm run test:api` (`bru run --env local`); CI starts the server in background then runs Bruno |
| Maestro E2E (mobile) | `.maestro/flows/` — `01_auth_flow`, `02_dashboard_flow`, `03_transactions_flow`, `04_accounts_flow`, `05_clients_flow` + subflows |
| Unit tests | None |
| Lint | ESLint 9 (`eslint-config-next`) — CI job 1 |
| Security | Gitleaks secret scanning (`.github/workflows/gitleaks.yml`) — CI job 2 |
| Integration / financial-invariant tests | None — PRD §100-101 requires these for Agency |

## 11. Deployment / CI Behavior

- `.github/workflows/backend-ci.yml` — on push/PR: job 1 (Node 22, install, **lint**, **next build**, Bruno API tests against background server), job 2 (Gitleaks).
- CI fallbacks exist for JWT_SECRET and DB (per commit `1a22f52`) so builds/tests pass without real secrets.
- Husky git hooks (`prepare` script).
- PWA manifest/service worker via `next-pwa`; offline fallback page `/offline`; offline mutation queue in `useOfflineQueue` + IndexedDB.
- Repo hygiene: untracked `docs/moneyos-agency-prd.md` (the master PRD) and `money-os-discovery/.env.production` (an Astro marketing site, separate from this app).

## 12. What Must Remain Untouched (Compatibility Contract)

1. **Existing tenants' behavior.** Standard and Student_Club tenants must see zero functional change (PRD §87). `appMode === 'Agency'` gates all new behavior.
2. **Existing entities and collections.** `Transaction`, `Account`, `Budget`, `Client`, `Category`, `RecurringTransaction`, `SystemLog` schemas stay valid. Agency additions to them must be **nullable, optional fields only** (e.g. `projectId`, `billable`, `invoiceId` on Transaction per PRD §26).
3. **Auth model.** JWT cookie flow, `TokenPayload`, `getSessionUser()`, the 3-role hierarchy, impersonation — extended (capabilities layered on top), not replaced.
4. **Data access patterns.** `db.ts` function signatures and the local-JSON fallback must keep working. New Agency code uses `TenantDAL`/tenant-scoped functions; no unscoped collection access.
5. **Routes.** All current pages and API routes keep their contracts. Agency gets new namespaces only (`/api/agency/*`, `src/app/dashboard/agency*`).
6. **UI conventions.** Dark theme, Drawer, CommandPalette, mobile-first patterns, progressive-disclosure tables. Agency screens must follow `docs/BRAND.md` / `docs/COMPONENT_GUIDELINES.md`.
7. **CI gates.** Lint + build + Bruno smoke + Gitleaks must stay green; Agency work extends test suites rather than bypassing them.
8. **Recurring engine & rate limiting.** Login-evaluated trigger stays the automation model for Phase 1 (PRD's alert engine should follow the same no-cron philosophy where possible).

## 13. Known Gaps the Agency Vertical Will Fill (context for later steps)

- No Project/Time/Rate/Invoice/Payment entities or domains at all.
- `Client` too thin for agency use (no billing/GSTIN/terms/status).
- RBAC lacks capabilities (PRD §60) — needed for PM/Finance/Team Member roles.
- No server-side financial calculation layer (PRD §83).
- No webhook handling infrastructure (needed for Razorpay, PRD §43).
- Bruno/Maestro coverage is smoke-level; PRD §100-104 demands financial invariant, isolation, and E2E tests.

---

*This document is the compatibility contract for Agency Phase 1. Any step that violates §12 must be escalated and re-planned, not silently worked around.*
