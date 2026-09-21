# Module 2 — Agency Clients: Definition of Done

**Status: COMPLETE** — verified 2026-09-09.
Spec: Money OS Agency Vertical Phase 1, Module 2 (Clients & Projects foundation PRD, §4–§33).

## Architecture

```
UI (list/detail/drawer)
  → /api/agency/clients (§29 routes)
    → requireAgencyPermission (§28: read vs manage)
      → domain service (src/lib/agency/domain/agency.clients.ts)
        → validators (src/lib/agency/validators/client.ts)
          → db.ts client repository (evolved in place, §5 — no fork)
```

Every mutation audits via the existing `createLog` (§27). No React component
touches MongoDB. No raw Mongo documents leave the API (mapClientDoc strips
`_id`; `normalizedName` is internal-only).

## §33 — Client Acceptance Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Existing Client model remains compatible | ✅ | Legacy `POST /api/clients {name}` → 200 with default status ACTIVE; `Client` interface fields all optional (§17); `getTransactions` clientId filter additive |
| 2 | Agency client creation works | ✅ | Bruno `31-Agency-Clients-E2E` #4: 201 with full §16 profile (contact/billing/tax/commercial) |
| 3 | Client editing works | ✅ | E2E #9: partial PATCH without name → 200 |
| 4 | Client archive works | ✅ | E2E #12–13: ACTIVE→INACTIVE→ARCHIVED; illegal ACTIVE→ARCHIVED refused (E2E #10) |
| 5 | Client restore works | ✅ | E2E #15: ARCHIVED→INACTIVE; restore of non-archived refused (E2E #11) |
| 6 | Billing profile works | ✅ | E2E #4 asserts `billingProfile` round-trips; unit tests validate billing email independently of contact email |
| 7 | Commercial defaults work | ✅ | E2E #4: `commercialDefaults.billingModel/paymentTerms/currency` persisted and returned |
| 8 | Tax profile is stored safely | ✅ | E2E #4: GSTIN round-trip; country-agnostic shape (§11); unit tests |
| 9 | Search works | ✅ | E2E #7: `?search=acme` finds both clients incl. normalized duplicate; integration tests route search through `searchClients` |
| 10 | Pagination works | ✅ | API: page/limit clamped (1–100), verified `page=1&limit=1` vs `page=2&limit=1`; UI: Previous/Next with limit+1 hasMore probe |
| 11 | Tenant isolation works | ✅ | Integration: A cannot read/patch/archive B's client (404, repository scoped by session tenant); E2E detail of agency client shows 0 Standard-tenant transactions |
| 12 | Authorization works | ✅ | Integration: USER reads OK, writes 403 (§28); Standard tenant 403 `NOT_AGENCY_TENANT` (E2E #18); write routes gated on `agency.clients.manage` |
| 13 | Audit events exist | ✅ | E2E #8: 'Add Client' in activity timeline; integration asserts `createLog` called on create/archive |
| 14 | Mobile form works | ✅ | Responsive: drawer full-width ≤sm, form grids `grid-cols-1 sm:grid-cols-2`, list swaps table→cards on mobile; DOM order = mobile priority order |
| 15 | Empty state works | ✅ | Empty-state card with CTA (admins only); loading skeleton without numbers; error state with Retry |
| 16 | Error state works | ✅ | 400 invalid payload, 404 unknown/cross-tenant, 409 duplicate, 500 guarded; UI surfaces clean messages |
| 17 | Regression tests pass | ✅ | Vitest 169/169 (11 files, incl. Module 1 suites untouched); Bruno 36/36 requests, 95/95 assertions |

## §98 — Module 2 Release Gate

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Client schema stable | ✅ | `AgencyClient` contract (types/client.ts) + nullable expansion §17; default-on-read (§106) — no migration, no ID rewrites |
| 2 | Client API stable | ✅ | §29 route set: GET/POST `/api/agency/clients`, GET/PATCH `/[id]`, POST `/[id]/archive`, POST `/[id]/restore`, `?search=`; §30 pipeline order enforced in every handler |
| 3 | Client UI stable | ✅ | List (`/dashboard/agency/clients`), detail (`/[id]`), create/edit via existing Drawer pattern (§25), progressive disclosure (§23–24), duplicate flow (§18) |
| 4 | Tenant isolation verified | ✅ | see §33 #11 — integration tests + live smoke |
| 5 | Audit verified | ✅ | see §33 #13 |
| 6 | Existing clients preserved | ✅ | see §33 #1 — legacy API + legacy signature both live-tested |
| 7 | Transaction references still work | ✅ | Live: created txn with clientId under agency tenant → appears in client detail (§21); under standard tenant → hidden from agency tenant (isolation) |
| 8 | Search works | ✅ | see §33 #9 |
| 9 | Mobile works | ✅ | see §33 #14 |
| 10 | Tests pass | ✅ | Vitest 169/169; Bruno 36/36 + 95/95 assertions |
| 11 | Production build passes | ✅ | `next build` EXIT=0; all 4 client routes + dashboard route registered |

## Step 2.7 — Dashboard Integration (§92)

`activeClients` in the Agency Snapshot is LIVE:
- `queries/client-counts.ts` — indexed `countDocuments({tenantId, status: ACTIVE ∪ missing})` (legacy §106 clients count as ACTIVE), local-JSON fallback
- `analytics/dashboard.ts` — `getAgencyDashboard(..., sources?)` stays pure; `AgencySnapshotSummary.activeClientsReady` is the readiness flag
- `AgencySnapshotCard` — Active Clients line uses its own flag (no longer gated on the projects sprint)
- E2E #16 asserts `activeClientsReady === true` and a live count ≥ 1

## §117 — Command Palette (final audit addition)

Module 2's capability is wired into the palette — no stale "Coming in Phase 1"
affordances for shipped features:
- **Create Client** (Agency Actions, TENANT_ADMIN only per §28) → navigates
  to `/dashboard/agency/clients` and opens the client drawer via the
  `open-new-agency-client` event (same pattern as core quick actions).
- **Add Client / Sponsor** quick action swaps to "Add Agency Client" for
  agency workspaces; read-only USERs get no create entry at all.
- **Go to Clients Directory** swaps to "Go to Agency Clients" for agency
  workspaces (mirrors the dashboard nav swap).
- **Client search matches** (§118 deep link) route agency workspaces to
  `/dashboard/agency/clients/:id` instead of the core Clients Directory.

Step 2.3's named validators are extracted and exported:
`validateClientTaxProfile()` / `validateClientCommercialDefaults()`
(`src/lib/agency/validators/client.ts`), reused by `validateClientCreate`
and unit-tested standalone.

## Known boundaries (honest, by design)

- **USER-role UI gating** is enforced server-side (403) and the UI hides
  manage buttons for non-admins; a live USER-session UI walkthrough needs the
  team-invite flow (admin console) and is covered at the API layer instead.
- **Projects column / project counts** say "Coming with Projects" — Module 3
  wires them; never a fake zero.
- **Billed/Collected/Outstanding** say "Coming with Billing/Payments".
- The duplicate probe warns on `tenantId + normalizedName` (§18/§32); it is
  advisory — duplicates are legal by design.
- Legacy `/api/clients` DELETE still exists for the core Standard/Club
  verticals (unchanged behavior); the agency namespace has no delete path at
  all (§15).

## Verification run (2026-09-09)

```
npx tsc --noEmit          → EXIT 0
npm run lint              → clean (0 errors, 0 warnings)
npx vitest run            → 11 files, 175/175 tests
npx next build            → EXIT 0
npm run test:api (bru)    → 36/36 requests, 95/95 assertions (PASS, port 3000)
live smoke (port 3100)    → 401/403/201/400/404/409 matrix all as specified
```

Final audit (same day, post §117 wiring) re-ran every gate against the
updated build: tsc 0, lint clean, vitest 175/175, next build EXIT 0,
Bruno 36/36 + 95/95 on port 3000.
