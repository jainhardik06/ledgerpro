---
title: "Money OS — Agency Vertical"
subtitle: "Phase 1 Product Requirements Document & Complete Execution Plan"
---

**Document status:** Product/Engineering Specification
**Phase:** Agency Phase 1 — Agency Financial Operations Core
**Product:** Money OS
**Primary objective:** Add a complete agency-specific operating layer without turning Money OS into a generic project-management or ERP platform.

---

## Executive Summary

The right way to extend Money OS for agencies is **not** to turn Money OS into an "agency app." Agency should be one vertical layered on top of the existing Money OS financial platform.

Money OS already has the right foundation: multi-tenancy, RBAC, audit logs, accounts, transactions, budgets, recurring transactions, clients, reporting, exports, security hardening, and the `Agency` app mode.

Agency Phase 1 should therefore add the **minimum complete commercial/delivery-to-money loop**:

**Client → Project → Budget → Team → Time → Expenses → Cost → Billing → Invoice → Payment → Profitability**

Supporting research points to this as the central gap: connecting project delivery directly to financial profitability, while deliberately leaving full ERP/accounting, advanced resource planning, media buying, payroll, and other large systems outside the initial scope.

---

# 1. Product Context

Money OS is a broader multi-vertical financial operating system.

Its existing foundation already supports:

* organizations / tenants
* authentication
* role-based access
* transactions
* accounts
* budgets
* recurring transactions
* clients
* reports
* audit logs
* exports
* mobile-first UI
* financial dashboards
* production security controls

The repository also already models the tenant with an `appMode` that includes `Agency`, meaning the architecture already anticipates vertical-specific behavior.

Therefore, Phase 1 must **extend Money OS**, not fork it.

The target architecture is:

```text
                         MONEY OS
                            │
             ┌──────────────┼──────────────┐
             │              │              │
        Core Finance     Core SaaS     Core Platform
             │              │              │
      Transactions       Tenants       Auth / RBAC
      Accounts           Users         Audit
      Budgets            Settings      Security
      Reports            Billing       Observability
             │
             ▼
       AGENCY VERTICAL
             │
     ┌───────┼───────────────┐
     │       │               │
   Clients Projects       People
     │       │               │
     │    Time/Expenses     Rates
     │       │               │
     └───────┼───────────────┘
             │
          Billing
             │
         Invoices
             │
          Payments
             │
       Profitability
```

---

# 2. Phase 1 Product Definition

## Phase 1 name

**Agency Financial Operations Core**

This is deliberately narrower than "Agency Management Platform."

Phase 1 should make Money OS capable of answering, for an agency:

> "What are we working on, what have we spent delivering it, what can we bill, what has been billed, what has been collected, and are we actually making money?"

Supporting research identifies time tracking, cost rates, billing rates, project profitability, invoicing, payment collection, and Indian billing capabilities as the core MVP capabilities.

---

# 3. Phase 1 Strategic Goal

The Agency vertical should prove one fundamental product thesis:

> **Every unit of agency work should be traceable to a project, a financial cost, and eventually a commercial outcome.**

The complete Phase 1 loop is:

```text
Client
   ↓
Project
   ↓
Commercial Setup
   ↓
Project Budget
   ↓
Team Assignment
   ↓
Time + Expenses
   ↓
Internal Cost
   ↓
Billable Work
   ↓
Invoice
   ↓
Payment
   ↓
Project Profitability
```

---

# 4. Phase 1 Target Customer

Phase 1 should primarily serve:

### Primary

**5–30 person agencies**

Especially:

* web development agencies
* software development agencies
* digital marketing agencies
* creative/design agencies
* branding agencies
* consulting/service agencies

Supporting research identified 5–20 employees as the point where informal operational tracking begins breaking down, and 20–100 as the more advanced market requiring sophisticated planning.

Phase 1 should intentionally prioritize the **5–30 employee zone** rather than trying to solve the 100+ employee enterprise problem.

### Secondary

1–4 person agencies can use the same system, but advanced capacity planning is not a Phase 1 requirement.

---

# 5. What Phase 1 Is NOT

This boundary is extremely important.

Phase 1 is **not**:

* Asana
* ClickUp
* Monday.com
* a full PSA
* a full ERP
* QuickBooks replacement
* Zoho Books replacement
* payroll software
* HRIS
* media-buying platform
* advanced CRM
* proposal builder
* contract-signing system
* client portal
* advanced resource planning system
* AI scope-creep system

Supporting research specifically recommends avoiding double-entry accounting, media buying, and native payroll in favor of integrations.

Money OS should own the **financial intelligence around agency delivery**, not every agency activity.

---

# 6. Phase 1 Core Value Proposition

An agency owner should be able to open Money OS and immediately understand:

### Portfolio

* How much revenue is currently under contract?
* How much has been invoiced?
* How much has been collected?
* How much remains unbilled?
* Which projects are profitable?
* Which projects are at risk?

### Project

* What was the project budget?
* What is the contract value?
* How many hours were planned?
* How many hours have been consumed?
* What did that work actually cost?
* What has been billed?
* What remains billable?
* What is the estimated margin?

### Team

* Who worked on what?
* How many hours did they spend?
* How much did those hours cost the agency?
* How much billable work did they generate?

### Finance

* Which invoices are overdue?
* How much is outstanding?
* Which work has not yet been billed?
* Which expenses should be passed through to clients?

This is the Phase 1 product promise.

---

# 7. Phase 1 Module Map

Phase 1 contains these modules:

```text
AGENCY
│
├── Agency Dashboard
│
├── Clients
│
├── Projects
│   ├── Overview
│   ├── Budget
│   ├── Team
│   ├── Time
│   ├── Expenses
│   ├── Billing
│   ├── Profitability
│   └── Activity
│
├── Time Tracking
│
├── Rate Cards
│
├── Expenses
│
├── Invoices
│
├── Payments / Receivables
│
├── Profitability
│
├── Alerts
│
└── Agency Settings
```

Core Money OS modules remain available underneath:

```text
Transactions
Accounts
Budgets
Recurring
Reports
Team
Audit
Settings
```

---

# 8. Capability Boundary

A critical architectural rule:

## Core Money OS owns:

* money
* accounts
* transactions
* cash balances
* financial records
* authentication
* tenancy
* audit
* security

## Agency vertical owns:

* agency clients
* projects
* project budgets
* project members
* work items
* time
* cost rates
* billing rates
* billable expenses
* invoices
* invoice payments
* project financial calculations
* agency-specific alerts

This separation ensures another vertical can later reuse the same core.

---

# 9. Module 1 — Agency Dashboard

The Agency Dashboard becomes the first screen when:

```text
tenant.appMode === "Agency"
```

## Primary KPI cards

### Revenue

* Contracted Revenue
* Invoiced Revenue
* Collected Revenue
* Unbilled Revenue

### Delivery

* Active Projects
* Hours Logged
* Billable Hours
* Non-Billable Hours

### Profitability

* Project Delivery Cost
* Gross Project Profit
* Average Project Margin
* At-Risk Projects

### Receivables

* Outstanding Invoices
* Overdue Amount
* Overdue Invoice Count

## Project health table

| Project | Client | Contract | Cost | Billed | Margin | Budget Burn | Status |
| ------- | ------ | -------: | ---: | -----: | -----: | ----------: | ------ |

Status values:

* Healthy
* Watch
* At Risk
* Over Budget
* Completed

## Dashboard alerts

Example:

```text
⚠ Project Atlas has consumed 84% of planned hours.

⚠ ₹1,24,000 of agency work remains unbilled.

⚠ Invoice INV-1042 is 17 days overdue.

⚠ Project Phoenix margin is below target.
```

---

# 10. Module 2 — Agency Clients

The current Money OS already has a Client concept and can associate transactions with clients.

Phase 1 expands this into an agency-grade client record.

## Client fields

### Identity

* ID
* tenantId
* company name
* contact name
* email
* phone
* website

### Billing

* billing email
* billing address
* billing country
* currency
* GSTIN
* tax registration status
* place of supply

### Commercial

* default billing model
* default payment terms
* default currency
* default tax profile

### Metadata

* industry
* notes
* status
* createdAt
* updatedAt

## Client status

```text
Prospect
Active
Paused
Inactive
Archived
```

Do not build a complete CRM pipeline in Phase 1.

---

# 11. Module 3 — Projects

This is the most important new entity.

A client may have:

```text
Client
 ├── Project A
 ├── Project B
 └── Project C
```

## Project fields

```text
Project
├── id
├── tenantId
├── clientId
├── name
├── code
├── description
├── status
├── billingModel
├── currency
├── startDate
├── endDate
├── contractValue
├── targetMargin
├── plannedHours
├── budgetCost
├── projectManagerId
├── createdAt
└── updatedAt
```

---

# 12. Project Status

```text
Draft
Active
On Hold
Completed
Cancelled
Archived
```

---

# 13. Billing Models

Phase 1 should support three commercial models.

## A. Fixed Fee

Example:

```text
Website redesign
Contract = ₹5,00,000
Planned hours = 350
```

Profitability:

```text
Contract Value
-
Actual Delivery Cost
=
Project Contribution Profit
```

## B. Time & Materials

Example:

```text
Developer: ₹2,500/hour
Designer: ₹1,800/hour
```

Revenue is calculated from approved billable time.

## C. Milestone / Fixed Installments

Example:

```text
30% Kickoff
40% Design Approval
30% Launch
```

Phase 1 can allow manually defined milestones.

Do not build a full contract/proposal engine yet.

---

# 14. Project Commercial Setup

When creating a project:

```text
Client
↓
Project
↓
Billing Model
↓
Contract Value
↓
Planned Hours
↓
Target Margin
↓
Billing Terms
```

The user should not need to configure every financial parameter manually.

Use sensible defaults from:

* client
* agency settings
* project type

---

# 15. Project Budget

Phase 1 should maintain **two budgets**.

## Revenue Budget

How much money the agency expects to earn.

## Delivery Cost Budget

How much it expects to spend delivering the project.

Optional third dimension:

## Hours Budget

How much team time is expected.

Therefore:

```text
Revenue Budget
Delivery Cost Budget
Hours Budget
```

This is much more valuable for agencies than the current generic category/month budget structure. The current Money OS budget system is category/month oriented.

---

# 16. Module 4 — Lightweight Project Work Items

Do NOT build a giant task-management system.

Phase 1 only requires enough structure to answer:

> "What was this person working on?"

Create:

```text
WorkItem
├── id
├── projectId
├── name
├── description
├── status
├── estimatedHours
├── assignedTo
└── createdAt
```

Statuses:

```text
Not Started
In Progress
Done
```

No:

* dependency engine
* Gantt
* Kanban builder
* automation builder
* advanced task hierarchy

Those belong later.

---

# 17. Module 5 — Project Team

A project needs explicit membership.

```text
ProjectMember
├── projectId
├── userId
├── role
├── allocationPercent
├── startDate
├── endDate
└── active
```

Example:

```text
Website Redesign

Hardik       → Project Manager → 20%
A             → Senior Dev    → 70%
B             → Designer      → 50%
C             → QA            → 20%
```

Advanced capacity planning is intentionally excluded.

---

# 18. Module 6 — Rate Cards

This is one of the most important Phase 1 features.

Supporting research explicitly identifies cost rates and billing rates as foundational because profitability cannot be calculated without them.

Money OS needs two distinct concepts.

## Internal Cost Rate

What the person's time costs the agency.

```text
Developer
Internal Cost = ₹900/hour
```

## Billing Rate

What the client is charged.

```text
Developer
Client Rate = ₹2,500/hour
```

Never combine these.

---

# 19. Rate Versioning

Rates must be historical.

Example:

```text
Developer Cost Rate

2025
₹700/hour

2026
₹900/hour
```

Historical reports must continue using ₹700 for 2025 time entries.

Supporting research specifically calls for versioned cost rates with effective dates so salary/rate changes do not rewrite historical profitability.

---

# 20. Rate Data Model

```text
RateCard
├── id
├── tenantId
├── name
├── type
│   ├── COST
│   └── BILLING
├── currency
└── status
```

```text
RateCardVersion
├── id
├── rateCardId
├── amount
├── effectiveFrom
├── effectiveTo
└── createdAt
```

For employee/project assignment:

```text
UserRateAssignment
├── userId
├── rateCardId
├── effectiveFrom
└── effectiveTo
```

---

# 21. Module 7 — Time Tracking

Time tracking must be extremely easy.

The entire value proposition collapses if employees do not use it.

Support:

### Manual Entry

```text
Project
Work Item
Date
Duration
Billable?
Notes
```

### Stopwatch

```text
Start
↓
Work
↓
Stop
↓
Review
↓
Save
```

---

# 22. Time Entry

```text
TimeEntry
├── id
├── tenantId
├── projectId
├── workItemId
├── userId
├── date
├── durationMinutes
├── billable
├── approvalStatus
├── billingStatus
├── costRateSnapshot
├── billingRateSnapshot
├── calculatedCost
├── calculatedBillableAmount
├── invoiceId
├── notes
├── createdAt
└── updatedAt
```

---

# 23. Rate Snapshot Rule

When time is saved:

```text
Current Rate
      ↓
Snapshot onto Time Entry
```

Never dynamically recalculate historical time entries from today's rates.

Example:

```text
Time entry on 2026-03-01
Cost rate = ₹800

Employee gets new rate
Cost rate = ₹1,000

Historical entry remains:
₹800
```

This is essential for trustworthy reports.

---

# 24. Time Approval

Phase 1 should include lightweight approval.

Statuses:

```text
Draft
Submitted
Approved
Rejected
```

Default workflow:

```text
Employee
   ↓
Submit timesheet
   ↓
Project Manager / Admin
   ↓
Approve
   ↓
Eligible for billing
```

This avoids accidental billing of unreviewed time.

---

# 25. Billable vs Non-Billable

Every time entry must explicitly contain:

```text
billable: true | false
```

### Billable

Client development work.

### Non-billable

* internal meetings
* training
* sales support
* administration
* internal product work

This distinction becomes essential for utilization and profitability later.

---

# 26. Module 8 — Agency Expenses

Do not create a completely separate financial universe.

Extend Money OS transactions with agency metadata.

Current transactions already support tenant, user, type, amount, date, category, account and client.

Add:

```text
projectId
billable
markupPercent
expenseStatus
invoiceId
vendor
receiptReference
```

---

# 27. Expense Types

```text
Internal Expense
Billable Expense
Pass-through Expense
```

Examples:

```text
Internal
→ Team travel

Billable
→ Client-specific stock image

Pass-through
→ External contractor cost
```

---

# 28. Expense Workflow

```text
Expense Created
      ↓
Project linked?
      ↓
Billable?
      ↓
Needs approval?
      ↓
Approved
      ↓
Unbilled
      ↓
Invoice
      ↓
Billed
```

---

# 29. Expense Markup

Support basic markup:

```text
Cost = ₹10,000
Markup = 20%
Client Amount = ₹12,000
```

Do not build sophisticated purchasing or vendor-management workflows yet.

---

# 30. First-Class "Unbilled Work"

This concept should be fundamental to Phase 1.

Money OS must separately identify:

```text
Unbilled Time
Unbilled Expenses
Unbilled Milestones
Unbilled Project Value
```

An agency can be profitable on paper while losing cash because completed work has not been invoiced.

The system must therefore make this visible.

---

# 31. Module 9 — Invoicing

Phase 1 should introduce an agency-aware invoice system.

Invoice fields:

```text
Invoice
├── id
├── tenantId
├── clientId
├── projectId
├── invoiceNumber
├── issueDate
├── dueDate
├── currency
├── subtotal
├── discount
├── tax
├── total
├── amountPaid
├── amountDue
├── status
├── notes
├── terms
└── createdAt
```

---

# 32. Invoice Status

```text
Draft
Sent
Partially Paid
Paid
Overdue
Void
```

---

# 33. Invoice Lines

Support:

```text
Time
Expense
Milestone
Fixed Fee
Manual
```

Example:

```text
Development       42 hours      ₹105,000
Design              8 hours      ₹14,400
Stock assets                    ₹12,000
------------------------------------------------
Subtotal                         ₹131,400
GST                              ₹23,652
------------------------------------------------
Total                            ₹155,052
```

---

# 34. Billing Protection Rules

A time entry can only be invoiced once.

An expense can only be billed once.

An invoice cannot be duplicated accidentally.

The system should enforce:

```text
unbilled → invoice
```

not:

```text
already billed → invoice again
```

Use immutable billing references.

---

# 35. Module 10 — Payments

Invoice and payment must be separate concepts.

```text
Invoice
    ≠
Payment
```

An invoice represents:

> money owed

A payment represents:

> money received

This separation is essential.

---

# 36. Payment Model

```text
Payment
├── id
├── tenantId
├── invoiceId
├── clientId
├── amount
├── receivedAt
├── method
├── reference
├── accountId
├── gateway
├── gatewayPaymentId
├── withholdingAmount
└── status
```

Payment methods:

```text
Bank Transfer
UPI
Cash
Card
Razorpay
Other
```

---

# 37. Partial Payments

Must support:

```text
Invoice
₹100,000

Payment 1
₹40,000

Payment 2
₹60,000
```

Result:

```text
Paid = ₹100,000
Due = ₹0
```

Likewise:

```text
Invoice = ₹100,000
Paid = ₹60,000
Due = ₹40,000
Status = Partially Paid
```

---

# 38. Money OS Ledger Integration

Do not create duplicate financial truth.

When a payment is received:

```text
Payment
   ↓
Validated
   ↓
Linked Invoice
   ↓
Money OS Credit Transaction
   ↓
Account Balance Updated
```

The transaction should contain:

```text
invoiceId
paymentId
clientId
projectId
```

This gives Money OS a unified cash ledger.

---

# 39. Payment Idempotency

Gateway callbacks can arrive more than once.

Therefore:

```text
gatewayPaymentId
```

must be unique per provider/tenant.

Duplicate webhook:

```text
Ignore / reconcile
```

Never:

```text
Duplicate payment
Duplicate cash transaction
```

---

# 40. Module 11 — Indian Billing Foundation

Supporting research identifies GST, TDS, HSN/SAC and Razorpay as important Indian requirements.

Phase 1 should build an **India-ready invoice model**, but not attempt to become a complete tax platform.

Support:

* GSTIN
* HSN/SAC
* CGST
* SGST
* IGST
* place of supply
* tax-exempt configuration
* invoice tax lines
* TDS/withholding recording
* invoice numbering
* billing address
* tax identifiers

Tax rates must be configurable rather than hard-coded.

---

# 41. TDS Architecture

Do not treat TDS as GST.

Represent separately:

```text
Invoice Total
+
GST
-
TDS / Withholding
=
Net Receivable / Settlement
```

The exact applicable rate/rule should be configurable and validated against the agency's accounting/tax setup rather than embedded as a universal constant.

---

# 42. E-Invoicing

Phase 1 should prepare the invoice architecture for e-invoicing.

But do not build the full IRP integration initially.

Prepare fields such as:

```text
IRN
Acknowledgement Number
Acknowledgement Date
QR Payload
```

but keep actual IRP integration in a future integration layer.

---

# 43. Module 12 — Razorpay

Phase 1 should integrate Razorpay at the payment-collection layer.

Recommended flow:

```text
Invoice
   ↓
Create Payment Link
   ↓
Client Pays
   ↓
Razorpay
   ↓
Webhook
   ↓
Money OS
   ↓
Payment Reconciliation
   ↓
Invoice Updated
   ↓
Cash Transaction
```

Supporting research specifically recommends payment links and automated webhook reconciliation.

Webhook processing must include:

* signature verification
* idempotency
* payment lookup
* invoice mapping
* transaction creation
* audit logging
* failure/retry handling

---

# 44. Module 13 — Project Profitability

This is the central Agency Phase 1 feature.

The project page should have a dedicated **Profitability Center**.

---

# 45. Core Profitability Metrics

### Contracted Value

```text
Total project commercial value
```

### Delivery Cost

```text
Time Cost
+
Billable/Non-Billable Project Expenses
```

### Billed Revenue

```text
Invoices issued
```

### Collected Revenue

```text
Payments received
```

### Unbilled Value

```text
Approved billable work
-
Already invoiced work
```

---

# 46. Profitability Calculation

For fixed-fee projects:

```text
Project Contribution Profit
=
Contract Value
-
Actual Delivery Cost
```

For T&M projects:

```text
Billable Revenue
=
Approved Billable Hours × Billing Rate

Project Contribution Profit
=
Billable Revenue
-
Delivery Cost
```

For milestone projects:

```text
Commercial Value
=
Configured Project/Milestone Revenue

Profit
=
Commercial Revenue
-
Actual Delivery Cost
```

---

# 47. Margin

```text
Margin %
=
Profit / Revenue × 100
```

Example:

```text
Project value       ₹500,000
Delivery cost       ₹300,000

Profit              ₹200,000
Margin              40%
```

---

# 48. Important Reporting Distinction

Do not mix:

```text
Revenue
Billing
Cash
Profitability
```

The dashboard must explicitly separate:

### Revenue
What the commercial model says the project is worth.

### Billing
What has been invoiced.

### Cash
What has actually been collected.

### Cost
What the agency has spent delivering the project.

### Margin
What remains after delivery cost.

This prevents misleading project dashboards.

---

# 49. Project Profitability View

Example:

```text
WEBSITE REDESIGN
────────────────────────────────

Contract Value             ₹500,000
Billed                     ₹300,000
Collected                  ₹220,000
Unbilled                   ₹200,000

Delivery Cost              ₹245,000
Gross Project Profit       ₹255,000
Margin                     51%

Planned Hours              400
Used Hours                 316
Budget Burn                 79%

Status                     WATCH
```

---

# 50. Budget Burn

Phase 1 must include deterministic budget alerts.

Examples:

```text
50% → informational
75% → watch
80% → warning
100% → critical
110% → over-budget
```

Thresholds should be configurable.

---

# 51. Margin Alert

Example:

```text
Target Margin = 40%

Current Margin = 28%

→ At Risk
```

This is the Phase 1 version of scope creep detection.

Do not use AI. Use deterministic business rules first.

---

# 52. Scope-Creep Foundation

Full automatic scope-creep detection is Phase 2/3.

But Phase 1 should create the necessary foundation:

```text
Budget Hours
Actual Hours
Remaining Hours
Budget %
```

When:

```text
Actual Hours >= 80% Budget
```

show:

> "Project is approaching planned delivery capacity."

When:

```text
Actual Hours > Budget
```

show:

> "Project is over planned hours."

Supporting research itself recommends this simpler threshold-based implementation before advanced scope intelligence.

---

# 53. Module 14 — Receivables

Create an agency-level receivables view.

Metrics:

```text
Total Outstanding
Current
1–30 Days
31–60 Days
61–90 Days
90+ Days
```

Invoices should be sortable by:

* amount
* client
* due date
* project
* age
* status

---

# 54. Payment Terms

Support:

```text
Due on Receipt
7 Days
15 Days
30 Days
45 Days
60 Days
Custom
```

Default payment terms can live at the client or agency level.

---

# 55. Automatic Invoice Aging

Example:

```text
Invoice Date: 1 Sept
Due Date: 30 Sept

1 Oct
→ Overdue 1 day

15 Oct
→ Overdue 15 days
```

This feeds the Agency Dashboard automatically.

---

# 56. Module 15 — Agency Alerts

Phase 1 alerts should be deterministic.

Required alerts:

### Project

* 75% hours used
* 80% hours used
* 100% hours used
* over-budget
* margin below target

### Billing

* unbilled approved time
* unbilled expenses
* invoice due soon
* invoice overdue

### Cash

* large invoice overdue
* project completed with unbilled work

---

# 57. Alert Engine

Use a generic structure:

```text
AlertRule
├── id
├── tenantId
├── type
├── threshold
├── enabled
└── configuration
```

Then:

```text
Event
 ↓
Evaluate Rules
 ↓
Create Alert
 ↓
Display / Notify
```

This can later become the foundation for automation and AI.

---

# 58. Module 16 — Agency Reports

Phase 1 reporting should provide:

## Portfolio Report
* project count
* contract value
* billed
* collected
* delivery cost
* project profit
* average margin

## Project Profitability Report
* project
* client
* contract
* cost
* revenue
* margin
* hours

## Time Report
* employee
* billable hours
* non-billable hours
* total hours
* utilization

## Unbilled Work Report
* employee
* project
* client
* hours
* amount
* expense
* total unbilled

## Receivables Report
* client
* invoice
* due date
* outstanding
* aging

Export to CSV should reuse Money OS's existing reporting infrastructure. The current system already supports CSV and print-ready PDF reporting.

---

# 59. Module 17 — Agency Settings

## General
* agency name
* logo
* default currency
* timezone
* fiscal year

## Billing
* invoice prefix
* invoice numbering
* payment terms
* default tax profile
* default payment methods

## Profitability
* target project margin
* hour warning thresholds
* overdue thresholds

## Tax
* GST registration
* GSTIN
* state
* SAC defaults

## Payment
* Razorpay credentials
* webhook settings

Credentials must be encrypted and never exposed client-side.

---

# 60. Permissions

Existing Money OS has Tenant Admin/User roles.

Phase 1 should evolve this toward capability-based permissions without breaking existing tenants.

Recommended logical roles:

## Agency Admin
Full access.

## Finance
* invoices
* payments
* expenses
* financial reports
* clients

## Project Manager
* assigned projects
* budgets
* team
* time approval
* project profitability

## Team Member
* assigned projects
* own time
* own expenses
* limited project visibility

The underlying permission system should eventually operate on capabilities such as:

```text
projects.read
projects.write
projects.manage
time.read
time.write
time.approve
expenses.read
expenses.write
expenses.approve
invoices.read
invoices.write
payments.read
payments.write
profitability.read
settings.manage
```

---

# 61. Security Requirements

Every agency entity must contain:

```text
tenantId
```

Every query must enforce:

```text
tenantId === authenticatedTenantId
```

This follows the current Money OS multi-tenant isolation architecture.

Additional requirements:

* no cross-tenant client access
* no cross-tenant project access
* no cross-tenant invoice access
* no cross-tenant payments
* no client data exposure between organizations
* audit all financial mutations
* audit invoice voiding
* audit rate changes
* audit payment reconciliation
* audit budget changes

---

# 62. Financial Immutability

Financial records require stronger rules than ordinary CRUD.

### Time
Once invoiced: `cannot silently change`

### Invoice
Once issued: `cannot be silently edited`

Instead:

```text
Void
Credit
Replacement
```

### Payment
Cannot be deleted.

It must be:

```text
Reversed
Refunded
Adjusted
```

with an audit record.

---

# 63. Audit Events

Add events such as:

```text
PROJECT_CREATED
PROJECT_UPDATED
PROJECT_BUDGET_CHANGED

RATE_CREATED
RATE_UPDATED

TIME_CREATED
TIME_UPDATED
TIME_APPROVED
TIME_REJECTED

EXPENSE_CREATED
EXPENSE_APPROVED

INVOICE_CREATED
INVOICE_SENT
INVOICE_VOIDED

PAYMENT_CREATED
PAYMENT_RECONCILED
PAYMENT_REVERSED

PROJECT_STATUS_CHANGED
PROJECT_COMPLETED
```

The existing Money OS already has an immutable activity log architecture.

---

# 64. Data Architecture

Recommended Phase 1 entities:

```text
Tenant
User
Client
Project
ProjectMember
WorkItem
RateCard
RateCardVersion
UserRateAssignment
TimeEntry
Expense
Invoice
InvoiceLine
Payment
ProjectBudget
Alert
AlertRule
TaxProfile
```

Existing entities remain:

```text
Transaction
Account
Budget
RecurringTransaction
SystemLog
```

---

# 65. Relationship Model

```text
Tenant
 │
 ├── Users
 │
 ├── Clients
 │      │
 │      └── Projects
 │             │
 │             ├── ProjectMembers
 │             ├── WorkItems
 │             ├── TimeEntries
 │             ├── Expenses
 │             ├── Budgets
 │             └── Invoices
 │                     │
 │                     └── Payments
 │
 ├── RateCards
 │
 ├── Accounts
 │
 └── Transactions
```

---

# 66. Project-to-Finance Mapping

Every important agency event should be traceable:

```text
Time Entry
   ↓
Project
   ↓
Client
   ↓
Invoice
   ↓
Payment
   ↓
Account
   ↓
Transaction
```

This traceability is one of the most important architectural properties of Phase 1.

---

# 67. Proposed API Surface

## Clients

```http
GET    /api/agency/clients
POST   /api/agency/clients
GET    /api/agency/clients/:id
PATCH  /api/agency/clients/:id
```

## Projects

```http
GET    /api/agency/projects
POST   /api/agency/projects
GET    /api/agency/projects/:id
PATCH  /api/agency/projects/:id
```

## Time

```http
GET    /api/agency/time
POST   /api/agency/time
PATCH  /api/agency/time/:id
POST   /api/agency/time/:id/submit
POST   /api/agency/time/:id/approve
POST   /api/agency/time/:id/reject
```

## Rates

```http
GET    /api/agency/rates
POST   /api/agency/rates
PATCH  /api/agency/rates/:id
```

## Expenses

```http
GET    /api/agency/expenses
POST   /api/agency/expenses
PATCH  /api/agency/expenses/:id
```

## Invoices

```http
GET    /api/agency/invoices
POST   /api/agency/invoices
GET    /api/agency/invoices/:id
POST   /api/agency/invoices/:id/send
POST   /api/agency/invoices/:id/void
```

## Payments

```http
GET    /api/agency/payments
POST   /api/agency/payments
POST   /api/agency/payments/reconcile
```

## Profitability

```http
GET /api/agency/projects/:id/profitability
GET /api/agency/profitability
```

## Alerts

```http
GET   /api/agency/alerts
PATCH /api/agency/alerts/:id
```

---

# 68. API Design Rules

All Agency APIs must:

1. authenticate
2. resolve tenant
3. validate role/capability
4. validate body
5. enforce tenant isolation
6. validate entity ownership
7. execute domain operation
8. write audit record where appropriate
9. return normalized response

Never trust `tenantId`, `userId`, `projectId`, `clientId` directly from the browser.

Resolve authorization from the authenticated session.

---

# 69. Indexing Strategy

At minimum:

```text
projects:
tenantId + status

projects:
tenantId + clientId

timeEntries:
tenantId + projectId + date

timeEntries:
tenantId + userId + date

timeEntries:
tenantId + billingStatus

expenses:
tenantId + projectId + billable

invoices:
tenantId + clientId + status

invoices:
tenantId + dueDate

payments:
tenantId + invoiceId

payments:
tenantId + gatewayPaymentId

rateVersions:
tenantId + effectiveFrom

alerts:
tenantId + status
```

The existing system already creates indexes for core tenant-bound entities, so Phase 1 should extend that approach rather than introduce a different persistence model.

---

# 70. UX Architecture

Preserve Money OS's existing design language.

The existing product uses:

* slide-over drawers
* Command Palette
* mobile-first responsive layouts
* progressive disclosure
* data-dense dashboards
* responsive tables

Agency should feel like a natural extension.

---

# 71. Agency Navigation

Recommended:

```text
Overview

Work
  Projects
  Time
  Expenses

Money
  Invoices
  Payments
  Profitability

Clients

Reports

Team

Audit

Settings
```

The main navigation should not overwhelm users with every underlying Money OS module.

---

# 72. Command Palette

Extend the existing Command Palette.

Examples:

```text
Create Project
Log Time
Start Timer
Create Invoice
Record Payment
Find Client
Find Project
View Profitability
View Overdue Invoices
```

The current Command Palette is already a core Money OS interaction pattern.

---

# 73. Project Page UX

The project page should contain:

```text
Project Header

Overview
│
├── Financial Summary
├── Budget Burn
├── Team
├── Recent Time
└── Recent Billing

Tabs

Time
Expenses
Invoices
Profitability
Activity
```

The user should never need to navigate through five unrelated screens to answer: "Is this project making money?"

---

# 74. Time UX

The fastest interaction should be:

```text
Cmd/Ctrl + K
→ Start Timer
→ Select Project
→ Select Work Item
→ Start
```

Stop:

```text
Stop Timer
→ Review
→ Save
```

Manual entry should take seconds.

---

# 75. Mobile Requirements

Time tracking should be optimized for mobile.

On mobile:

```text
Project
Work Item
Duration
Billable
Save
```

should fit into a simple single-screen workflow.

The current Money OS already emphasizes mobile usability and thumb-friendly drawers.

---

# 76. Agency Onboarding

When an organization activates Agency mode:

```text
Welcome
 ↓
Agency profile
 ↓
Currency
 ↓
Tax settings
 ↓
Invoice settings
 ↓
Team
 ↓
Rate setup
 ↓
First client
 ↓
First project
```

Do not force users to configure everything before entering the product.

Use progressive onboarding.

---

# 77. Smart Project Creation

Project creation should guide the user:

```text
Client
↓
Project Name
↓
Billing Model
↓
Contract Value
↓
Hours Budget
↓
Target Margin
↓
Team
↓
Create Project
```

Then Money OS can immediately display the project's financial baseline.

---

# 78. First-Time Agency Experience

A new agency should immediately see:

```text
No active projects yet.

Create your first project
```

Then:

```text
Create Project
→ Add Team
→ Set Rates
→ Log Time
→ See Profitability
```

The first 10 minutes should demonstrate the entire product thesis.

---

# 79. Core User Journeys

## Journey A — Create Project

```text
Admin
→ Clients
→ Select Client
→ Create Project
→ Fixed Fee
→ ₹500,000
→ 400h
→ 40% target margin
→ Assign team
→ Save
```

Expected result:

```text
Project created
Budget initialized
Profitability baseline available
```

## Journey B — Track Work

```text
Developer
→ Start timer
→ Website Redesign
→ Frontend
→ Stop
→ 2h 15m
→ Billable
```

Expected result:

```text
Time entry = Approved/Billable workflow
Cost calculated
Potential billable value calculated
Project budget updated
```

## Journey C — Invoice Work

```text
PM
→ Project
→ Billing
→ Generate Invoice
→ Select approved time
→ Select billable expenses
→ Tax
→ Preview
→ Issue
```

Expected result:

```text
Invoice created
Selected items marked billed
Unbilled amount decreases
```

## Journey D — Receive Payment

```text
Client pays
→ Razorpay webhook
→ Payment verified
→ Payment created
→ Invoice updated
→ Cash transaction created
→ Account balance updated
```

## Journey E — Owner Checks Profit

```text
Owner
→ Dashboard
→ Project
→ Profitability
```

Sees:

```text
Contract       ₹500k
Cost           ₹280k
Billed         ₹350k
Collected      ₹200k
Unbilled       ₹150k
Margin         44%
Hours          72%
```

---

# 80. Phase 1 Success Metrics

Product success should be measured around actual financial behavior.

## Activation

Percentage of agency tenants that:

```text
create client
→ create project
→ configure rates
→ log time
```

## Core Adoption

Track:

* active projects
* time entries/week
* billable time %
* invoices/month
* payments reconciled
* projects with profitability data

## Financial Accuracy

Measure:

```text
Time Cost Accuracy
Invoice Mapping Accuracy
Payment Reconciliation Accuracy
Unbilled Work Accuracy
Profitability Calculation Accuracy
```

These are more important than generic DAU metrics.

---

# 81. North-Star Product Metric

A strong Phase 1 north-star metric:

> **Percentage of active agency projects with complete financial traceability.**

Definition — a project is "financially traceable" when it has:

```text
Client
+
Budget
+
Time/Expense
+
Cost
+
Billing
+
Profitability
```

---

# 82. Engineering Principle — One Source of Truth

Do not create:

```text
Agency revenue table
+
Money OS revenue table
```

Instead:

```text
Money OS Core Financial Truth
             ↑
       Agency metadata
```

Agency modules should enrich core finance rather than duplicate it.

---

# 83. Engineering Principle — Domain Layer

Do not place profitability calculations directly inside React pages.

Use domain services:

```text
calculateProjectCost()
calculateProjectRevenue()
calculateUnbilledWork()
calculateProjectProfit()
calculateMargin()
calculateInvoiceBalance()
calculateAging()
evaluateProjectAlerts()
```

This ensures Dashboard, API, Reports, and Exports all use exactly the same calculations.

---

# 84. Engineering Principle — Financial Calculation Engine

Create a dedicated module:

```text
src/lib/agency/financials/
```

Example:

```text
cost.ts
revenue.ts
profitability.ts
billing.ts
receivables.ts
tax.ts
alerts.ts
```

Never duplicate formulas across routes/components.

---

# 85. Recommended Code Structure

```text
src/
├── app/
│   ├── dashboard/
│   │   ├── agency/
│   │   ├── clients/
│   │   ├── projects/
│   │   ├── time/
│   │   ├── expenses/
│   │   ├── invoices/
│   │   ├── payments/
│   │   └── profitability/
│   │
│   └── api/
│       └── agency/
│           ├── clients/
│           ├── projects/
│           ├── time/
│           ├── expenses/
│           ├── invoices/
│           ├── payments/
│           └── profitability/
│
├── lib/
│   ├── agency/
│   │   ├── domain/
│   │   ├── financials/
│   │   ├── permissions/
│   │   ├── validators/
│   │   └── alerts/
│   │
│   ├── auth/
│   ├── db/
│   └── finance/
│
└── components/
    └── agency/
```

This avoids contaminating unrelated Money OS verticals with agency-specific code.

---

# 86. Agency Feature Flags

Agency functionality should be activated through configuration.

Example:

```text
appMode = Agency
```

But do not write `if (agency) everywhere`.

Prefer:

```typescript
vertical = "agency"
capabilities = [...]
```

This makes future verticals cleaner.

---

# 87. Backward Compatibility

Existing Money OS tenants must continue working.

Important rule:

```text
Existing Standard tenant
→ unchanged behavior

Existing Student Club tenant
→ unchanged behavior

Agency tenant
→ new Agency capabilities
```

Do not require existing users to create projects, rates, invoices, etc.

---

# 88. Migration Strategy

Existing clients should remain valid.

Existing transactions can optionally be associated with `clientId` and `projectId`, but these fields remain nullable.

Therefore:

```text
Existing Transaction
clientId = null
projectId = null
```

remains fully valid.

---

# 89. Phase 1 Execution Roadmap

Phase 1 should be executed as several controlled engineering slices.

## Sprint 0 — Architecture & Domain Foundation

### Deliverables
* agency domain structure
* data model
* tenant isolation rules
* schema migration design
* permission design
* financial calculation specifications
* API conventions
* feature flag strategy
* test strategy

### Exit criterion
Engineering can implement Agency modules without duplicating the core financial layer.

---

# 90. Sprint 1 — Clients & Projects

Build:
* agency client profile
* project entity
* project creation
* project status
* billing model
* commercial values
* project budget
* project members
* lightweight work items

### Acceptance

User can:

```text
Create Client
→ Create Project
→ Set Budget
→ Assign Team
→ Create Work Item
```

and see the project in the Agency dashboard.

---

# 91. Sprint 2 — Rate Engine

Build:
* cost rate cards
* billing rate cards
* effective dates
* user assignments
* rate snapshots
* validation
* admin screens

### Acceptance

Changing an employee's current rate does not alter historical time costs.

---

# 92. Sprint 3 — Time Tracking

Build:
* manual time entry
* stopwatch
* work-item association
* billable/non-billable
* submission
* approval
* rejection
* project budget burn
* time reports

### Acceptance

Employee can log time in seconds and manager can approve it.

---

# 93. Sprint 4 — Expense Integration

Build:
* project-linked expenses
* billable expenses
* expense approvals
* receipt metadata
* markup
* unbilled expense reporting

### Acceptance

An approved project expense can flow into invoice creation.

---

# 94. Sprint 5 — Profitability Engine

Build:
* project cost calculations
* revenue calculations
* margin calculations
* budget burn
* unbilled work
* project health state
* dashboard metrics

### Acceptance

Given known time/cost/rate data, every profitability metric produces deterministic, testable results.

This is the most important engineering checkpoint.

---

# 95. Sprint 6 — Invoicing & Receivables

Build:
* invoice
* invoice lines
* numbering
* status
* payment terms
* due dates
* partial payments
* aging
* billing from approved work
* invoice audit events

### Acceptance

Approved billable work can be converted into an invoice without duplicate billing.

---

# 96. Sprint 7 — India + Razorpay

Build:
* GST configuration
* CGST/SGST/IGST
* HSN/SAC
* GSTIN
* TDS/withholding recording
* Razorpay payment link
* webhook verification
* idempotency
* payment reconciliation

### Acceptance

A Razorpay payment can move from Gateway → Money OS → Payment → Invoice → Ledger without duplication.

---

# 97. Sprint 8 — Agency Dashboard & Alerts

Build:
* agency command center
* project portfolio
* receivables
* unbilled work
* profitability
* alert engine
* project health

### Acceptance

The owner can identify the most profitable project, least profitable project, over-budget project, unbilled project, and overdue invoice within one screen.

---

# 98. Sprint 9 — Reports, Security & Mobile Polish

Build:
* agency reports
* CSV export
* responsive layouts
* permissions
* audit review
* performance optimization
* API hardening
* rate limit validation where needed

The existing platform already has production hardening around pagination, indexing, authentication, rate limiting and security headers; Phase 1 should extend these conventions.

---

# 99. Sprint 10 — Full QA & Release

Run:

```text
Unit Tests
Integration Tests
API Tests
Security Tests
End-to-End Tests
Mobile Tests
Regression Tests
Financial Invariant Tests
Webhook Tests
Performance Tests
```

Then release behind an **Agency Phase 1 feature flag** before universal rollout.

---

# 100. Testing Strategy

Phase 1 requires unusually strong financial testing.

## Unit Tests

Test:

```text
cost calculation
revenue calculation
margin
tax
invoice totals
payment balances
invoice aging
budget burn
unbilled work
```

Example:

```text
10 hours
× ₹800 cost
=
₹8,000 cost
```

---

# 101. Financial Invariants

Create explicit invariant tests.

### Invoice

```text
Invoice Total
=
Subtotal
+
Tax
-
Discount
```

### Payment

```text
Amount Due
=
Invoice Total
-
Payments
```

### Project

```text
Profit
=
Applicable Revenue
-
Delivery Cost
```

### Billing

```text
Billed Time
<=
Approved Billable Time
```

These should be automated.

---

# 102. API Tests

Test:

```text
401 unauthenticated
403 unauthorized
404 foreign resource
400 invalid payload
409 duplicate operation
200 success
```

Especially:

```text
Tenant A cannot access Tenant B project
Tenant A cannot access Tenant B invoice
Tenant A cannot reconcile Tenant B payment
```

---

# 103. Security Tests

Specifically test:

* IDOR
* tenant isolation
* privilege escalation
* invoice tampering
* rate manipulation
* project access
* payment replay
* webhook replay
* forged Razorpay webhook
* unauthorized time approval
* unauthorized invoice voiding

Use the existing security architecture as the baseline rather than creating a separate security mechanism.

---

# 104. E2E Tests

Core Maestro journeys should include:

### Project

```text
Create Client
→ Create Project
→ Add Member
```

### Time

```text
Start Timer
→ Stop
→ Approve
```

### Billing

```text
Approved Time
→ Invoice
→ Payment
```

### Profitability

```text
Project
→ Time
→ Cost
→ Invoice
→ Payment
→ Dashboard
```

The current repository already contains Maestro testing infrastructure, so this should become part of the Agency release gate rather than a separate testing effort.

---

# 105. Performance Requirements

Agency dashboard should remain fast even with:

```text
100+ projects
1,000+ invoices
50,000+ time entries
100,000+ transactions
```

Do not calculate the entire portfolio by fetching everything into the browser.

Use:

```text
server-side aggregation
indexed queries
pagination
cached summary calculations where justified
```

---

# 106. Observability

Track:

```text
invoice creation failures
payment webhook failures
profitability calculation errors
tax calculation errors
time approval failures
API latency
database latency
```

Use the existing Money OS telemetry architecture as the foundation. The current application already exposes system telemetry for database/API/runtime health.

---

# 107. Migration Plan

Existing Agency-mode tenants must not lose data.

Migration sequence:

```text
Deploy schema additions
↓
Backfill nullable fields
↓
Create indexes
↓
Enable domain APIs
↓
Enable UI
↓
Enable Agency dashboard
```

No destructive migration should be required.

---

# 108. Rollout Strategy

Recommended:

```text
Development
 ↓
Internal Agency tenant
 ↓
Staging
 ↓
Pilot agencies
 ↓
Limited production
 ↓
General availability
```

Start with a small group of agencies representing web/software, digital marketing, and creative/design.

This validates whether the same financial model works across agency types.

---

# 109. Phase 1 Acceptance Checklist

Phase 1 is complete only when all of the following work.

### Client
* client creation
* billing information
* tax information
* project history

### Project
* create
* budget
* billing model
* team
* work items
* status

### Time
* manual entry
* timer
* cost calculation
* billing calculation
* approval
* historical rate snapshots

### Expenses
* project linkage
* billability
* approval
* billing

### Financial
* unbilled work
* project cost
* project revenue
* margin
* budget burn

### Invoicing
* invoice creation
* invoice lines
* tax
* due dates
* partial payment
* void

### Payments
* manual payment
* Razorpay
* webhook
* reconciliation
* ledger transaction

### Reporting
* project profitability
* time
* unbilled
* receivables
* exports

### Security
* tenant isolation
* permissions
* audit
* financial immutability

### UX
* desktop
* tablet
* mobile
* Command Palette
* drawers
* empty states
* loading states
* error states

---

# 110. Definition of Done

A Phase 1 feature is not complete simply because the UI exists.

Every feature must satisfy:

```text
UI
+
API
+
Validation
+
Authorization
+
Database
+
Indexes
+
Audit
+
Error Handling
+
Tests
+
Mobile
+
Accessibility
+
Observability
+
Documentation
```

---

# 111. Agency Phase 1 Backlog — P0 (Mandatory)

```text
Agency Dashboard
Clients
Projects
Project Budgets
Project Team
Work Items
Cost Rates
Billing Rates
Rate Versioning
Time Tracking
Timer
Time Approval
Project Expenses
Unbilled Work
Project Profitability
Invoices
Invoice Lines
Partial Payments
Receivables
Invoice Aging
Basic GST
HSN/SAC
TDS Recording
Razorpay
Payment Webhooks
Agency Reports
Alerts
Audit
Permissions
```

---

# 112. Backlog — P1 (Prepare Architecture, Do Not Implement)

These should have data-model compatibility but not become Phase 1 scope:

```text
Retainers
Resource Capacity
Advanced Utilization
Client Portal
Milestones with automated billing
Change Orders
Proposal Builder
Digital Signatures
Recurring Client Billing
Advanced Approval Workflows
```

Supporting research places these capabilities in the next version rather than the initial core.

---

# 113. Backlog — P2 (Later)

```text
AI Financial Assistant
AI Scope Detection
Slack / Teams monitoring
Automated Workflows
Calendar-to-Timesheet
Advanced Forecasting
Scenario Planning
Predictive Cash Flow
```

---

# 114. Backlog — P3 (Integrate Instead of Build)

```text
Full Accounting
Payroll
Full HR
Media Buying
Enterprise ERP
Advanced Procurement
Bank Reconciliation Engine
```

Integrations should eventually include services such as:

```text
Zoho Books
Xero
QuickBooks
Razorpay
Google Workspace
Microsoft 365
Slack
Teams
```

Supporting research similarly recommends using integrations rather than rebuilding full accounting/payroll systems.

---

# 115. What Phase 1 Should Feel Like

The user should experience Money OS like this:

```text
                        MONEY OS
                           │
                 ┌─────────┴─────────┐
                 │                   │
            Daily Money          Agency Work
                 │                   │
         Transactions             Clients
         Accounts                 Projects
         Cash                    Team
         Expenses                Time
                 │                   │
                 └─────────┬─────────┘
                           │
                        Finance
                           │
                 ┌─────────┼─────────┐
                 │         │         │
              Billing    Cash     Profit
                 │         │         │
                 └─────────┼─────────┘
                           │
                     Decision Making
```

The agency vertical should therefore not feel like a separate application.

It should feel like: **Money OS understands how an agency makes money.**

---

# 116. The Phase 1 Product Loop

The final product loop to optimize relentlessly is:

```text
CLIENT
  ↓
PROJECT
  ↓
COMMERCIAL VALUE
  ↓
BUDGET
  ↓
TEAM
  ↓
TIME + EXPENSES
  ↓
ACTUAL COST
  ↓
UNBILLED WORK
  ↓
INVOICE
  ↓
PAYMENT
  ↓
CASH
  ↓
PROFITABILITY
```

And the reverse intelligence loop is:

```text
PROFITABILITY
      ↓
PROJECT HEALTH
      ↓
BUDGET ALERT
      ↓
MANAGER ACTION
      ↓
BILLING ACTION
      ↓
CASH ACTION
```

That is the core of Agency Phase 1.

---

# 117. Final Phase 1 Product Definition

**Money OS Agency Phase 1 is a financial operating layer for agencies that connects clients, projects, team time, expenses, billing, payments, and profitability while continuing to use Money OS as the underlying financial system.**

It deliberately does **not** attempt to become a complete agency ERP.

The phase is successful when an agency can operate this complete loop:

> **Create a client → create a project → assign commercial value and budget → assign people → track their time and expenses → calculate actual delivery cost → identify unbilled work → invoice the client → record payment → reconcile cash → see project profitability.**

That is enough to make Agency a real vertical inside Money OS rather than merely an "Agency mode" skin.

---

# 118. Recommended Phase 1 Release Gate

Do not ship Phase 1 until this sentence is true:

> **A 5–30 person agency can run a real client project through Money OS from project creation to payment collection and can trust the resulting profitability number.**

That should be the single most important acceptance criterion for the entire phase.

---

# 119. Phase 1 Scope Summary

| Area | Phase 1 |
| --- | --- |
| Agency Dashboard | ✅ |
| Clients | ✅ |
| Projects | ✅ |
| Project Budgets | ✅ |
| Lightweight Work Items | ✅ |
| Project Teams | ✅ |
| Cost Rates | ✅ |
| Billing Rates | ✅ |
| Rate Versioning | ✅ |
| Time Tracking | ✅ |
| Timesheet Approval | ✅ |
| Project Expenses | ✅ |
| Unbilled Work | ✅ |
| Project Profitability | ✅ |
| Invoices | ✅ |
| Partial Payments | ✅ |
| Receivables | ✅ |
| Invoice Aging | ✅ |
| GST Foundation | ✅ |
| HSN/SAC | ✅ |
| TDS Recording | ✅ |
| Razorpay | ✅ |
| Payment Webhooks | ✅ |
| Agency Reports | ✅ |
| Deterministic Alerts | ✅ |
| Audit | ✅ |
| Permission Model | ✅ |
| Mobile UX | ✅ |
| Retainers | ❌ Phase 2 |
| Resource Capacity | ❌ Phase 2 |
| Client Portal | ❌ Phase 2 |
| Change Orders | ❌ Phase 2 |
| Advanced Scope Creep | ❌ Phase 2/3 |
| Proposals | ❌ Phase 2/3 |
| Digital Signatures | ❌ Phase 2/3 |
| AI | ❌ Phase 3 |
| Full Accounting | ❌ Integrate |
| Payroll | ❌ Integrate |
| Media Buying | ❌ Avoid |

---

# 120. Final Architectural Principle

The most important decision is this:

```text
Money OS
    │
    ├── Standard vertical
    │
    ├── Student Club vertical
    │
    └── Agency vertical
            │
            ├── Agency UX
            ├── Agency Domain
            └── Agency Financial Intelligence
                       │
                       ▼
                 Core Money OS Finance
```

Do **not** build:

```text
Money OS → Agency App
```

Build:

```text
Money OS
  └── Agency Capability Layer
```

That keeps Agency as one powerful vertical while preserving Money OS as the broader product.

Supporting strategic research backs this direction: the opportunity is not to replace project-management software broadly, but to connect agency delivery directly to financial outcomes and margin protection.

The important outcome is that **Phase 1 is now a coherent product, not a collection of features**: it has a bounded customer, a financial model, entities, workflows, APIs, permissions, calculations, testing requirements, security rules, migration strategy, release gates, and a clear Phase 2 boundary.

---

## Closing Note

This PRD should be treated as the **master specification**. The next engineering artifact should be the **Phase 1 technical design**: MongoDB collections/schema changes, API contracts, exact financial calculation rules, and folder/file architecture — before implementation begins.
