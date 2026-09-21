# 02 — Core vs Agency Data Boundary (Step 0.3)

**Document status:** Step 0.3 deliverable — the entity ownership boundary between core Money OS and the Agency vertical.
**Depends on:** `00-current-state.md`, `01-architecture-map.md`.
**Rule of the document:** this defines the boundary only. No new entity is fully implemented at Step 0 beyond what the namespace skeleton needs.

---

## 1. Why This Boundary Exists

Money OS is the parent product; Agency is one vertical. Two failure modes this boundary prevents:

1. **Leakage up** — agency-specific fields/rules appearing in core interfaces, forcing every future vertical to carry agency baggage.
2. **Duplication down** — agency code creating parallel financial entities (a second transaction/revenue ledger) instead of enriching the core one.

Principle from the PRD (§82): **core financial truth stays singular; agency metadata enriches it.**

## 2. Core Entities — Owned by Money OS (unchanged home: `src/lib/db.ts`)

| Entity | Interface | Collection | Agency may… |
| --- | --- | --- | --- |
| `Tenant` | `db.ts:26` | `tenants` | **read** (`appMode`, name, plan); never mutate from agency code (app-mode switching stays in existing settings/tenant flows) |
| `User` | `db.ts:44` | `users` | **read + reference** (assign as `projectManagerId`, `ProjectMember.userId`); creation/role changes stay in core user management |
| `Transaction` | `db.ts:56` | `transactions` | **create with agency metadata, read, update agency fields only** — via agency repositories |
| `Account` | `db.ts:91` | `accounts` | **read + reference** (`Payment.accountId`); payments credit balances through core transaction creation |
| `Category` | `db.ts:82` | `categories` | read only |
| `Budget` | `db.ts:101` | `budgets` | untouched by agency — project budgets are separate agency entities |
| `RecurringTransaction` | `db.ts:111` | `recurring` | untouched in Phase 1 |
| `SystemLog` | `db.ts:128` | `logs` | **append** (`createLog`) with `Agency:` action prefixes |
| `Client` | `db.ts:73` | `clients` | **extend with agency fields (nullable/optional)** — the shared client record; agency profile data lives on it |

**Core invariants that hold regardless of vertical:**
- Every entity carries `tenantId`; every query is tenant-scoped.
- Financial mutations write audit logs.
- Existing tenants with zero agency data must behave exactly as today (§00.12).

## 3. Agency Entities — Owned by the Agency Vertical (home: `src/lib/agency/domain/`)

Not implemented at Step 0 — this is the ownership registry for the sprints that follow.

| Entity | Collection (planned) | Purpose | References |
| --- | --- | --- | --- |
| `Project` | `agency_projects` | central new entity: client + commercial setup + status | `clientId` → Client, `projectManagerId` → User |
| `ProjectMember` | `agency_project_members` | team assignment + allocation | `projectId`, `userId` |
| `ProjectBudget` | `agency_project_budgets` | revenue / delivery-cost / hours budgets | `projectId` |
| `WorkItem` | `agency_work_items` | lightweight work unit for time attachment | `projectId`, `assignedTo` → User |
| `RateCard` | `agency_rate_cards` | named COST or BILLING rate card | — |
| `RateCardVersion` | `agency_rate_card_versions` | effective-dated amounts (historical immutability) | `rateCardId` |
| `UserRateAssignment` | `agency_user_rate_assignments` | user → rate card with effective dates | `userId`, `rateCardId` |
| `TimeEntry` | `agency_time_entries` | time with billable flag, approvals, **rate snapshots** | `projectId`, `workItemId`, `userId`, `invoiceId`? |
| `Expense` | *(not a new collection)* | **metadata on core `Transaction`**: `projectId`, `billable`, `markupPercent`, `expenseStatus`, `invoiceId`, `vendor`, `receiptReference` | extends Transaction |
| `Invoice` | `agency_invoices` | agency invoice header + status lifecycle | `clientId`, `projectId` |
| `InvoiceLine` | `agency_invoice_lines` | time / expense / milestone / fixed / manual lines | `invoiceId`, source refs |
| `Payment` | `agency_payments` | money received; links to invoice + account; `gatewayPaymentId` unique | `invoiceId`, `accountId`, `clientId` |
| `Alert` | `agency_alerts` | deterministic alert instances | rule refs |
| `AlertRule` | `agency_alert_rules` | configurable thresholds | — |

**Agency invariants (bind every future implementation):**
- Every agency entity carries `tenantId`; every agency query is tenant-scoped via session-resolved tenantId.
- Rate changes never rewrite historical `TimeEntry` snapshots (PRD §23).
- Time/expense is invoiceable **exactly once** (billing protection, PRD §34).
- Payments create core credit `Transaction`s and update `Account` balances — no parallel ledger (PRD §38).
- Invoices/payments are void/reverse-only after issue; audit every financial mutation.

## 4. The Shared Surface — Where the Two Worlds Meet

Exactly four touchpoints; anything outside these is a boundary violation:

```text
1. Client        ← extended in place (optional agency fields) — shared record, one source of truth
2. Transaction   ← agency expense metadata (all optional) + payment-generated credit transactions
3. User          ← referenced by agency membership/assignment entities (read-only)
4. SystemLog     ← agency audit events appended through existing createLog()
```

Rules for the shared surface:
- **Additive, optional, nullable** — pre-agency documents remain 100% valid.
- Agency repositories are the **only** writers of agency fields on core entities.
- No core function signature changes; no core route contract changes.

## 5. Boundary Violations — What This Explicitly Forbids

- ❌ Agency fields on `Tenant`, `Account`, `Category`, `Budget`, `RecurringTransaction` (settings belong in agency settings entities/fields defined in their own sprint).
- ❌ `AgencyRevenue` or any parallel financial aggregate collection — revenue is derived (queries/analytics) from invoices/payments/time, never stored as competing truth.
- ❌ Agency code writing to `users`, `tenants`, core `budgets`, or `recurring` collections.
- ❌ Core (non-agency) code importing from `src/lib/agency/**` — dependency direction is one-way: agency → core, never core → agency.
- ❌ Storing computed profitability on entities — it's calculated in `lib/agency/analytics` from source data.

## 6. Deprecation/Change Rule

If a future step needs to move an entity across this boundary (e.g., `Client` splitting into core-Client + agency-ClientProfile), that step must update this document **before** writing code, and must preserve the "additive, optional, nullable" migration rule (PRD §88: no destructive migrations).

---

*This registry is the gate the domain namespace skeleton (Step 0.4) and every subsequent sprint is checked against.*
