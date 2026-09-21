# Financial Definitions Contract — Agency Vertical Phase 1

**Document status:** Step 0.8 deliverable — the formal, unambiguous definition of every Agency metric.
**Depends on:** `00-current-state.md`, `02-data-boundary.md`, the master PRD (§45–§52, §100–§101).
**Rule of the document:** every metric below is the ONE definition used by the API, dashboard, reports, exports, and alerts. Any code computing a metric differently is a bug. At Module 1, metrics whose source entities don't exist yet return zero — never a different formula.

---

## 0. Conventions

- **Currency:** every monetary metric is a plain non-negative number in the tenant's currency. No currency conversion in Phase 1.
- **Rounding:** money metrics are rounded to 2 decimal places (half-up) **only at the presentation/API boundary**, never inside intermediate calculations. Percentages likewise round at presentation to 1 decimal place.
- **Per-tenant scoping:** every metric is computed over resources where `resource.tenantId === session.tenantId`. This is a precondition, not part of the formulas.
- **Time basis:** metrics are point-in-time snapshots of *issued/recorded* documents, not accruals or forecasts. Unless stated, no date-window filtering at Module 1 (dashboard = all-time); windows arrive with reports.
- **Sign convention:** all metrics here are absolute (non-negative) magnitudes. Losses/negative profit are represented as negative values in Profit/Margin only, and are valid.
- **Formula authority:** the `lib/agency/analytics` module is the only implementer. Formulas below use operator notation; precedence is explicit via parentheses.

---

## 1. Revenue

**Question it answers:** what is the commercial value of the work we have committed to?

```
Revenue (Contracted Revenue)
  = Σ over projects P (in scope) of applicableRevenue(P)

applicableRevenue(P):
  by P.billingModel:
    FIXED_FEE   → P.contractValue
    TIME_AND_MATERIALS → Σ over approved billable time entries E of P:
                         E.billingRateSnapshot × E.durationMinutes / 60
    MILESTONE   → Σ over configured milestones M of P of M.amount
```

**In scope:** projects with `status ∈ { Active, On Hold }`. Draft projects are not revenue (not contracted). Completed/Cancelled/Archived projects are excluded from *current* portfolio revenue but included in all-time reporting (the dashboard scope is explicit in each KPI; see §8).

**Explicitly NOT revenue:**
- Invoiced amounts (that's Billed, §2) — invoicing is a consequence of revenue, not its definition.
- Payments received (that's Collected, §3).
- Unapproved time (approval gate, §7).
- Expenses with markup (those are expense pass-through, not delivery revenue).
- Core Money OS `Credit` transactions that are not linked to a project payment.

**Module 1 value:** `0` — projects don't exist yet.

---

## 2. Billed (Invoiced Revenue)

**Question it answers:** how much have we invoiced clients for?

```
Billed (Invoiced Revenue)
  = Σ over invoices I (in scope) of invoiceTotal(I)

invoiceTotal(I)
  = I.subtotal + I.tax − I.discount

In scope: invoices with status ∈ { Sent, Partially Paid, Paid, Overdue }
```

**Explicitly excluded:** `Draft` invoices (not issued — billing has not happened) and `Void` invoices (legally retracted — must vanish from Billed). Voiding therefore *decreases* Billed; that is correct and audited.

**Non-negotiable rules:**
- Billed is computed **from invoice documents**, never from marking time as billed. Invoice totals are frozen at issue.
- Time/expense lines are invoiceable **exactly once** (billing protection); a line's billed state is an immutable reference to its invoice.

**Module 1 value:** `0` — invoices don't exist yet.

---

## 3. Collected (Received Cash)

**Question it answers:** how much money have clients actually paid us?

```
Collected (Collected Revenue)
  = Σ over payments PAY (in scope) of PAY.amount

In scope: payments with status = Reconciled (or Recorded — see note)
```

**Note — payment status:** a payment exists the moment it's recorded (manual entry or webhook). It counts as Collected when recorded & valid; a `Reversed`/`Refunded` payment is excluded and, because payments are never deleted, reversal is an audited state change that *decreases* Collected.

**Explicitly NOT Collected:**
- Amount due on issued invoices (that's Outstanding, §9).
- Withholding/TDS amounts — `PAY.withholdingAmount` never counts as collected cash (see §10).
- Core Money OS credit transactions not created through agency payment reconciliation.

**Ledger link:** every valid payment creates exactly one core `Credit` Transaction carrying `invoiceId`, `paymentId`, `clientId`, `projectId` (PRD §38). Collected is therefore consistent with, but not defined from, the core ledger.

**Module 1 value:** `0` — payments don't exist yet.

---

## 4. Cost (Delivery Cost)

**Question it answers:** what has delivering our projects cost us?

```
Cost (Delivery Cost)
  = Σ over projects P (in scope) of projectCost(P)

projectCost(P)
  = timeCost(P) + expenseCost(P)

timeCost(P)
  = Σ over time entries E of P (all, billable AND non-billable):
    E.costRateSnapshot × E.durationMinutes / 60

expenseCost(P)
  = Σ over core Transactions T linked to P (T.projectId = P.id):
    T.amount                        (agency expense amounts, type Debit)
```

**Explicitly included:**
- Non-billable time — it cost the agency money even though the client won't pay for it (PRD §25).
- Billable and pass-through expenses at their **cost** (client amount after markup is a billing concept, not a cost concept).

**Explicitly excluded:**
- Payroll/salary as such (the cost rate model internalizes it); no payroll entity in Phase 1.
- Rejected time entries (never entered cost — see §7).
- Transactions without `projectId` (internal spend unrelated to projects).
- Invoice tax and markup amounts.

**Rate snapshot rule:** historical cost uses the rate frozen on the time entry at save time — never today's rate (PRD §23).

**Module 1 value:** `0` — time entries and project-linked transactions don't exist yet.

---

## 5. Profit (Project Contribution Profit)

**Question it answers:** what remains after delivery cost?

```
Profit
  = Revenue − Cost
```

Applying §1 and §4 over the same scope. Per-project: `applicableRevenue(P) − projectCost(P)`.

For FIXED_FEE projects specifically: `contractValue − actual delivery cost` (identical by construction). For TIME_AND_MATERIALS: `approved billable revenue − delivery cost`.

**This is contribution profit, not net profit:** overhead (rent, admin salaries, software subscriptions) is out of scope in Phase 1. The dashboard label must say "Gross Project Profit" / contribution, never "Net Profit".

**Valid range:** may be negative (loss-making project). Displayed as-is; never clamped.

**Module 1 value:** `0` (0 − 0).

---

## 6. Margin

**Question it answers:** what share of revenue survives delivery cost?

```
Margin % = (Revenue − Cost) / Revenue × 100
        = Profit / Revenue × 100
```

**Division guard:** when `Revenue = 0` → margin is `undefined` (rendered as "—", never 0% and never NaN/Infinity). A T&M project with zero approved billable time has no margin yet.

**Rounding:** 1 decimal at presentation.

**Target margin:** a per-project `targetMargin` (and agency default) compares against this value for At-Risk status (§11) — it is a *comparison input*, not part of the formula.

**Module 1 value:** `undefined` (Revenue 0 → "—").

---

## 7. Unbilled (Billable but not yet invoiced)

**Question it answers:** what work is done/approved and billable, but hasn't been invoiced?

```
Unbilled
  = UnbilledTime + UnbilledExpenses + UnbilledMilestones

UnbilledTime
  = Σ over time entries E where
      E.approvalStatus = Approved
      AND E.billable = true
      AND E.billingStatus = Unbilled
    of E.billingRateSnapshot × E.durationMinutes / 60

UnbilledExpenses
  = Σ over core Transactions T where
      T.projectId set
      AND T.billable = true
      AND T.expenseStatus = Approved   (or auto-approved)
      AND T.invoiceId is null
    of clientAmount(T) = T.amount × (1 + T.markupPercent/100)

UnbilledMilestones
  = Σ over milestones M where M.status = Completed AND M.invoiceId is null
    of M.amount
```

**Explicitly excluded:**
- Time that is billable but not yet **approved** (PRD §24 — approval gates billing eligibility; it is *unapproved*, not *unbilled*).
- Non-billable time (internal work is never invoiced).
- Draft/void invoices don't affect Unbilled — only *issued* invoices move items out of Unbilled (via `billingStatus`/`invoiceId` set at issue).
- FIXED_FEE work-in-progress: contract value minus billed is "unbilled project value" (§9-adjacent), tracked separately from this per-unit Unbilled.

**Module 1 value:** `0`.

---

## 8. Hours Metrics (Delivery KPIs)

```
HoursLogged      = Σ durationMinutes / 60 over ALL time entries in scope
BillableHours    = Σ over E where E.billable = true
NonBillableHours = HoursLogged − BillableHours
```

Scope: current reporting window's project set; time entries regardless of approval state count as *logged*.

```
BudgetBurn % = UsedHours / PlannedHours × 100    (undefined when PlannedHours = 0)
```

**Module 1 values:** `0` / `0` / `0` / `undefined`.

---

## 9. Receivables Metrics

```
invoiceBalance(I) = invoiceTotal(I) − Σ payments PAY of I of PAY.amount
                 (= I.amountDue, maintained transactionally on the invoice)

Outstanding      = Σ invoiceBalance(I) over I with status ∈ { Sent, Partially Paid, Overdue }
OverdueAmount    = Σ invoiceBalance(I) over I additionally where dueDate < today
OverdueCount     = count of those invoices

Aging bucket of I = days past due = max(0, today − I.dueDate) in days
  Current: not past due | 1–30 | 31–60 | 61–90 | 90+
```

**Explicitly excluded:** Draft and Void invoices. Payments reduce balance regardless of when received (no allocation rules in Phase 1 beyond chronological application to invoice balance).

**Withholding (TDS) adjustment — settlement view only:**
```
NetReceivable(I) = invoiceTotal(I) − withheld(I) − collected(I)
```
Withholding is recorded on payments (§3) and shown separately; it never mutates invoiceTotal.

**Module 1 values:** all `0` / empty aging.

---

## 10. Tax Definitions

```
invoiceTotal(I) = subtotal + tax − discount        (subtraction before addition order:
                                                  subtotal + (tax) − (discount))
tax = CGST + SGST + IGST  (exactly one of CGST+SGST or IGST per invoice,
                           by place-of-supply rule; rates configurable per TaxProfile)
```

- `withholdingAmount` (TDS) is **never** part of `tax` (PRD §41). It reduces the settlement amount, not the invoice total.
- Tax lines reference HSN/SAC codes per invoice line.
- Rates come from the tenant's TaxProfile (configurable) — never hard-coded.

**Module 1 values:** `0` everywhere; TaxProfile entity arrives with the India sprint.

---

## 11. Project Health & Alert Thresholds (deterministic)

```
Health status (priority order, first match wins):
  Completed   → status = Completed
  Over Budget → BudgetBurn > 100%   (or Cost > deliveryCostBudget when hours absent)
  At Risk     → Margin < targetMargin  (Margin defined; Revenue > 0)
             OR BudgetBurn ≥ 100%
  Watch       → BudgetBurn ≥ 75% OR Margin < targetMargin + 5pts
  Healthy     → otherwise
```

Alert thresholds (defaults, configurable via AlertRule later):
`50% info · 75% watch · 80% warning · 100% critical · >110% over-budget`, margin-below-target, unbilled > 0 aging past billing cycle, invoice overdue.

**Module 1 value:** no projects → empty health table, no alerts.

---

## 12. Metric → KPI Card Mapping (Module 1)

| KPI card | Metric | §ref |
| --- | --- | --- |
| Contracted Revenue | Revenue | 1 |
| Invoiced Revenue | Billed | 2 |
| Collected Revenue | Collected | 3 |
| Unbilled Revenue | Unbilled | 7 |
| Active Projects | count of projects status=Active | — |
| Hours Logged / Billable / Non-Billable | Hours metrics | 8 |
| Project Delivery Cost | Cost | 4 |
| Gross Project Profit | Profit | 5 |
| Average Project Margin | mean of per-project Margin where defined | 6 |
| At-Risk Projects | count health ∈ {At Risk, Over Budget} | 11 |
| Outstanding Invoices | Outstanding | 9 |
| Overdue Amount / Count | OverdueAmount / OverdueCount | 9 |

**Average Project Margin** = mean of per-project `Margin` **over projects where Margin is defined** (Revenue > 0). Undefined when no such project exists.

---

## 13. Module 1 Zero-Value Contract

The dashboard API returns, for a tenant with no agency data:

```json
{ "revenue": 0, "billed": 0, "collected": 0, "cost": 0, "profit": 0,
  "margin": null, "unbilled": 0, "activeProjects": 0,
  "hoursLogged": 0, "billableHours": 0, "nonBillableHours": 0,
  "atRiskProjects": 0, "outstanding": 0, "overdueAmount": 0,
  "overdueCount": 0, "projects": [], "alerts": [] }
```

`null` — not `0` and not absent — for undefined-by-division metrics (margin, budget burn). The analytics engine implements **exactly these definitions**; when a source entity arrives in a later sprint, its metric turns on with zero code changes to the formulas.

---

*Change rule: any change to a definition here requires updating this document first, then `lib/agency/analytics`, then the tests that pin each formula (PRD §100–101). Presentation layers may never compensate for a definition change.*
