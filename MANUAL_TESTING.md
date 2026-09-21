# Money OS — Agency Vertical Manual Testing Guide

Complete step-by-step manual test flows for every Agency page, feature, drawer
and popup — run by three personas:

| Persona | Who | What they can reach |
| :--- | :--- | :--- |
| **A — Super Admin** | Platform operator (`superadmin`) | Platform Console (`/super-admin/*`) — no tenant data of its own |
| **B — Tenant Admin** | Agency owner (creates the workspace) | The full Agency vertical + core Money OS |
| **C — User** | Team member invited by the Tenant Admin | Time, expenses, read-only shared views |

> Run against a production build: `npm run build && npm run start` →
> http://localhost:3000. Hard-refresh (Ctrl+Shift+R) once after any rebuild so
> the service worker updates (cache names are versioned — old caches are
> dropped automatically on the next SW activation).

---

## 0. Setup & Accounts

1. **Start**: `npm run start` → open http://localhost:3000.
2. **Super Admin login** (Persona A):
   - Go to `/login`, username `superadmin` + the password from the comment
     above `SUPER_ADMIN_PASSWORD_HASH` in `.env.local`.
   - Expect: redirected to `/super-admin` (Mission Control), top-left says
     "Platform Console".
3. **Create the Tenant Admin** (Persona B) — two ways:
   - Self-serve: logout → **Sign up** → tenant name `Test Agency`, username
     `testadmin`, strong password. Expect: auto-login → `/dashboard`.
   - OR as Super Admin: Organizations → (tenant row menu) — use impersonation
     for an existing agency tenant instead of creating new.
4. **Activate Agency mode** (Persona B):
   - `/dashboard/settings` → find the vertical/app-mode setting → switch to
     **Agency** → save.
   - Logout → login again. Expect: sidebar now shows **Agency Command
     Center**, Agency Clients, Agency Projects, Time Tracking, Expenses,
     Invoices, Receivables, Payments, Alert Center (+ Profitability and Rate
     Cards for admins only).

---

## A. Super Admin — Platform Console

### A1. Mission Control (`/super-admin`)
- [ ] KPI cards render with real numbers (tenants, users, revenue) — no zeros
      masquerading where data exists, no blank/`NaN`.
- [ ] Every sidebar item opens its page without console errors.

### A2. Organizations (`/super-admin/tenants`)
- [ ] Tenant list loads; search by name filters live.
- [ ] Row menu → **Impersonate** a tenant with appMode Agency → lands on
      `/dashboard` with the red impersonation bar at the top of the page and
      the tenant's own sidebar.
- [ ] Row menu → suspend/reactivate a tenant (use a throwaway tenant):
      suspended tenant's users get 403 "Organization account is suspended" on
      login; reactivating restores login.

### A3. Agency Analytics (`/super-admin/agency`) — *the Agency connection*
- [ ] KPI row: Agency tenants, Active projects, Hours (30d), Invoiced,
      Collected, Outstanding. If the fleet mixes currencies, money cards show
      **"Mixed"** with a per-currency tooltip — never a converted number.
- [ ] Activation funnel renders 5 stages (client → project → rates → time →
      invoice) with real bar widths.
- [ ] Per-tenant table: click **Snapshot** on an agency tenant → drawer opens
      with that tenant's delivery / money / profitability / rate-readiness
      numbers.
- [ ] **Cross-check**: open the same tenant via impersonation → its Agency
      Command Center must show the SAME invoiced/collected/outstanding
      numbers the snapshot showed (one engine, two views).
- [ ] Snapshot of a **Standard** (non-agency) tenant shows "has not activated
      the Agency vertical" — not zeros.
- [ ] **Negative**: logout, login as a Tenant Admin → directly navigating to
      `/super-admin/agency` and `/api/super-admin/agency` must fail (the page
      is console-gated; the API answers 401).

### A4. Audit Logs & Event Audit
- [ ] Audit Logs lists entries including agency events (INVOICE_FINALIZED,
      PAYMENT_REVERSED, RATE_UPDATED …) with tenant + username + timestamp.
- [ ] No edit/delete control exists anywhere on log rows (immutable).

### A5. Growth / Revenue / Discovery / Security / Feature Flags
- [ ] Each page loads; widgets without configured API keys show
      "Configuration required" states, not fake numbers.

### A6. Exit impersonation
- [ ] From an impersonated session, click logout / exit impersonation →
      back to a clean Super Admin session.

---

## B. Tenant Admin — The Complete Agency Loop

The core thesis: **Client → Project → Budget → Team → Time & Expenses → Cost
→ Invoice → Payment → Profitability**. Test in this order — each step feeds
the next.

### B1. Agency Command Center (`/dashboard/agency`)
- [ ] Fresh agency: shows the **welcome/empty state** with a "create your
      first project" action — not a wall of zeros.
- [ ] After data exists (later flows): KPI cards (Contracted, Invoiced,
      Collected, Unbilled) show real values; period selector (This Month /
      Last Month / Quarter / Year) reloads with a new range statement
      including the tenant timezone; Refresh button refetches.
- [ ] Sections in order: KPIs → Alerts → Project health table → Receivables →
      Unbilled → Profitability + snapshot → Delivery → Trends.
- [ ] Project health table: statuses (Healthy/Watch/At Risk/Over
      Budget/Completed) colored; rows link to the project page.
- [ ] **No page crash** — the console must stay clean (a previous bug crashed
      this page on load; it is fixed, this check pins it).

### B2. Agency Clients (`/dashboard/agency/clients`)
- [ ] **New Client** button → drawer opens (right slide-over; full-screen on
      mobile). Fill identity (name, contact, email, phone, website) + billing
      (billing email, address, country, currency, GSTIN, place of supply) +
      commercial defaults + status → save → appears in the list.
- [ ] **Duplicate guard**: try creating the same company name again →
      rejected with a clear error.
- [ ] Row → open client detail page: Projects section, Transactions section,
      billing summary card.
- [ ] Client detail → Edit → change status (Active → Paused) → saved.
- [ ] Archive + Restore from the row menu; archived clients leave the
      default list.
- [ ] Mobile: list renders as cards; table hidden.

### B3. Agency Projects (`/dashboard/agency/projects`)
- [ ] **New Project** opens the 7-step wizard: Client → Basics → Commercial
      → Budget → Timeline → Team → Review.
      - Commercial step: choose **Fixed Fee** (contract value ₹500,000),
        **T&M**, or **Milestone**.
      - Budget step: revenue budget + delivery cost budget + planned hours;
        the wizard previews planned margin live.
      - Team step: add members with role + allocation %.
      - Create → project starts as **DRAFT** with its financial baseline.
- [ ] Project detail page tabs: **Overview / Team / Work Items / Time /
      Expenses / Billing / Profitability / Activity / Milestones** (milestone
      model only).
- [ ] Overview: financial summary card, budget burn, health status.
- [ ] Team tab: add/remove members; removing keeps history (member shows as
      former); PM assignment marks accountability.
- [ ] Work Items tab: create work item (name, estimate, assignee, status);
      move Not Started → In Progress → Done.
- [ ] Status transitions: Draft → Active (milestone projects require ≥1
      milestone first), On Hold, Complete, Cancel — each transition appears
      in the Activity tab.
- [ ] Milestones (milestone-model project): add 30% / 40% / 30% milestones;
      the allocation total warns below 100%.
- [ ] **Negative**: a plain USER (Persona C) must not see the create/wizard
      buttons (admin-gated actions hide, not 403-on-click).

### B4. Rate Cards (`/dashboard/agency/rate-cards`) — admin only
- [ ] **New Rate Card**: choose COST or BILLING type, currency.
- [ ] Open the card → **Add Rate** lines (e.g. Senior Dev ₹2,500/hr BILLING;
      Senior Dev ₹900/hr COST).
- [ ] **Change Rate** on a line → new version row with effective dates; the
      old version closes the day before — history is never rewritten.
- [ ] COST cards: **Assign to User** → pick a team member + effective date.
- [ ] **Snapshot rule check** (do this before logging time in B5): after
      logging time in the next step, come back and change the rate — the
      already-logged entry keeps its original cost.
- [ ] User cost drawer (`Team Workspace` → user row → cost rate) shows
      version history.
- [ ] **Negative**: Persona C has no Rate Cards nav item at all.

### B5. Time Tracking (`/dashboard/agency/time`)
- [ ] **Timer widget** at the top: pick project (+ optional work item) →
      **Start timer** → live ticking display (green border while running).
- [ ] **Stop & review** → review drawer opens with the computed duration →
      adjust if needed → mark billable → save → entry appears in the list.
- [ ] **One active timer**: try starting a second timer while one runs →
      refused with a clear message.
- [ ] **Command palette route**: Ctrl+K → "Start Timer" → the page scrolls
      to the widget and focuses the project select.
- [ ] **Manual entry**: Log time button → drawer: project, work item, date,
      duration, billable toggle, notes → save. Cost + billable value are
      snapshotted at save (visible once rates are configured).
- [ ] Submit a few entries (select checkboxes → Submit) → status becomes
      SUBMITTED.
- [ ] **Timesheet view** (`/dashboard/agency/time/timesheet`): weekly grid
      with daily totals.
- [ ] **Approvals view** (`/dashboard/agency/time/approvals`): approve one,
      reject one with a note; the rejected entry becomes editable again for
      its owner; approved entries become invoice-eligible.
- [ ] **Rate snapshot verification** (from B4): the entry logged before the
      rate change still shows the OLD cost.

### B6. Expenses (`/dashboard/agency/expenses`)
- [ ] **Record expense** drawer: link to project, amount, date, vendor,
      receipt reference; toggle **billable** with **markup %** (₹10,000 + 20%
      → client amount ₹12,000 preview); internal vs billable vs pass-through
      type.
- [ ] Expense appears in the Today / This week / History tabs.
- [ ] **Approvals** (`/dashboard/agency/expenses/approvals`): approve a
      billable expense → it becomes invoice-eligible (UNBILLED).
- [ ] Reject one → owner can edit and resubmit.
- [ ] Project page → Expenses tab shows the project's expenses with cost vs
      client charge.

### B7. Invoices (`/dashboard/agency/invoices`)
- [ ] Project page → **Billing** tab → **Generate invoice** (or Invoices page
      → New invoice) → the wizard steps:
      1. Client & dates (issue date, payment terms → due date preview),
      2. **Select approved time** (only approved+unbilled entries appear),
      3. **Select billable expenses** (approved + unbilled),
      4. Milestones (milestone projects),
      5. Tax: pick GST profile → CGST/SGST or IGST by place of supply,
         HSN/SAC codes, TDS withholding rule; totals recompute live
         (subtotal − discount + tax),
      6. Preview → **Create draft**.
- [ ] Draft invoice detail: lines grouped by source; the money pipeline card
      (subtotal → discount → tax lines → total); draft carries no number yet.
- [ ] **Finalize** → invoice number assigned with the tenant prefix
      (Agency Settings → Billing → invoice prefix; default `INV-000001`).
- [ ] **Billing protection**: try selecting the same time entry in a second
      invoice → it no longer appears in the selectable list (billed once,
      immutable reference).
- [ ] **Send** → status SENT; **Void** → status VOID with an audit entry;
      confirm the time entries return to unbilled? (No — voided invoices
      keep references; verify the documented behavior in the UI copy.)
- [ ] **Collect online** (payment link): with no Razorpay keys configured →
      the action fails CLOSED with a clear 503/"not configured" message —
      never a fake link.
- [ ] Partial payment flow is next (B8) — leave this invoice partly unpaid.

### B8. Payments (`/dashboard/agency/payments`)
- [ ] **Record payment** drawer: pick the SENT invoice, amount **less than
      the total** (e.g. ₹40,000 of ₹100,000), method (Bank Transfer / UPI /
      Cash / Card / Other), bank account, reference → creates a **PENDING**
      payment.
- [ ] **Confirm** the payment → invoice becomes **PARTIALLY_PAID**, amount
      paid ₹40,000 / due ₹60,000; a Credit transaction appears in core
      Transactions and the chosen account's balance increases by ₹40,000.
- [ ] Record + confirm the remaining ₹60,000 → invoice **PAID**, due ₹0.
- [ ] **Reverse** one payment (with a reason) → payment shows REVERSED in
      history, the account balance goes back down, invoice status recomputes
      (PARTIALLY_PAID or SENT as applicable). Payments are never deleted.
- [ ] Withholding (TDS): record a payment with a withholding amount → the
      invoice balance accounts for it.
- [ ] Payments list: status pills (PENDING amber / CONFIRMED green /
      REVERSED red).

### B9. Receivables (`/dashboard/agency/receivables`)
- [ ] Aging buckets: Current / 1–30 / 31–60 / 61–90 / 90+ with totals.
- [ ] Leave one invoice past its due date (or check an E2E-created one) →
      it shows OVERDUE with days-past-due.
- [ ] Tabs: by client, by project, collection history.
- [ ] **Cross-check**: Outstanding total here = Σ amount due of open
      invoices = the Command Center receivables card.

### B10. Profitability (`/dashboard/agency/profitability`) — admin only
- [ ] Portfolio report: per-project rows with contract, cost (time + expense
      labor breakdown), revenue, margin, hours, budget burn.
- [ ] Lenses/tabs: by project / by client / margin report.
- [ ] Project page → Profitability tab: the same numbers as the report for
      that project (one engine — they cannot disagree).
- [ ] Drill-downs: labor by member (hours × rate), expenses by vendor.
- [ ] Fixed-fee vs T&M vs Milestone math sanity: margin % = profit ÷ revenue.

### B11. Alert Center (`/dashboard/agency/alerts`)
- [ ] After the flows above: budget-burn alerts (75% / 80% / 100% hours),
      unbilled-work alerts, overdue-invoice alerts appear as STORED rows.
- [ ] **Evaluate now** (admin) re-runs the deterministic rules.
- [ ] Acknowledge / Resolve an alert (admin) → it leaves the active list,
      stays in history.
- [ ] Persona C sees the list read-only — no acknowledge/resolve buttons.

### B12. Reports (`/dashboard/agency/reports`)
- [ ] Tabs: Portfolio / Profitability / Time / Unbilled / Receivables.
- [ ] Time report: per-person billable vs non-billable hours + utilization.
- [ ] Unbilled report: unbilled time + expenses + milestones with amounts.
- [ ] **CSV export** downloads a file with the filtered rows.
- [ **Print/PDF** opens the print stylesheet (light background — intentional
      for paper).

### B13. Agency Settings (`/dashboard/agency/settings`)
- [ ] General: agency timezone (business-date anchor — changing it shifts
      "today" for aging/burn), default currency.
- [ ] Billing: payment terms, invoice prefix (change it → next finalized
      invoice uses the new prefix), tax profile defaults.
- [ ] Tax: GST registration, GSTIN, state, SAC defaults.
- [ ] Payment: Razorpay key id/secret + webhook secret → **save** (requires
      AGENCY_MASTER_KEY; without it the save fails closed with 503). After
      saving, the secret is never displayed again (encrypted at rest).
- [ ] Profitability thresholds: target margin, hour warning thresholds.

### B14. Team Workspace (`/dashboard/team`)
- [ ] **Invite User** → username + password → role USER → creates Persona C.
- [ ] User list shows roles; lock/unlock a user (locked → 403 on login).

### B15. Cross-vertical safety
- [ ] Create/inspect a **Standard** tenant: no Agency nav items, standard
      dashboard unchanged; `/dashboard/agency/*` deep links are refused with
      the application "not an agency workspace" response.
- [ ] Student Club mode: terminology swaps (Sponsors), no agency items.

---

## C. User (Persona C) — Team Member Experience

Log out, log in as the user invited in B14.

- [ ] Sidebar shows: Agency Command Center, Agency Clients, Agency Projects,
      Time Tracking, Expenses, Invoices, Receivables, Payments, Alert Center
      — but **NOT** Profitability, NOT Rate Cards, NOT Team/Audit/Settings
      admin items.
- [ ] **Time**: can start/stop the timer, log manual entries for projects
      they're a member of, submit for approval; sees only their own entries
      in the default list.
- [ ] **Expenses**: can record and see their own; approval buttons absent.
- [ ] **Read-only money**: Invoices / Payments / Receivables pages render
      lists without create/void/reverse/record buttons (those are admin
      affordances).
- [ ] **Cost privacy**: no cost/profit numbers anywhere for this role —
      delivery cost lines show pending states, not salary economics.
- [ ] **Negative on admin APIs** (optional, devtools): PUT/PATCH to
      `/api/agency/rate-cards/...` with the user session → 401/403.
- [ ] Command palette: navigation entries only — no admin actions.

---

## D. Cross-Cutting Checks

### D1. Reconciliation (the release-gate invariant)
After completing B1–B9 for one test tenant:
- [ ] Invoice total = subtotal − discount + tax.
- [ ] Invoice amount due = total − confirmed payments (+ withholding rules).
- [ ] Collected revenue (Command Center) = Σ confirmed − reversed payments.
- [ ] The cash transaction in core Transactions equals the payment amount,
      linked to the same client.
- [ ] All six surfaces agree: invoice store, core ledger, payment
      reconciliation overview, receivables engine, dashboard aggregate,
      reports.

### D2. Mobile (narrow the window to ~375px or use device emulation)
- [ ] Sidebar collapses to the hamburger drawer; every page is navigable.
- [ ] Data tables switch to card lists (clients, projects, rate cards, work
      items); wide tables scroll horizontally inside their borders — the page
      itself never scrolls sideways.
- [ ] Drawers become full-screen sheets with reachable close buttons.
- [ ] Timer + manual time entry fit one screen (project → work item →
      duration → billable → save).

### D3. PWA
- [ ] DevTools → Application → Manifest: name "Money OS", icons (any +
      maskable PNGs) resolve.
- [ ] Install the app (browser install icon / "Download App" in the mobile
      sidebar when offered) → launches standalone.
- [ ] DevTools → Network → Offline → reload a PUBLIC page (e.g. `/`): the
      offline page appears. Then go to `/dashboard` while offline → you are
      NOT served a cached authenticated page (fail-closed by design).

### D4. Security spot checks
- [ ] Log out → browser back → authenticated pages do not render (redirect
      to login).
- [ ] Copy a URL of another tenant's project/invoice id into the address bar
      (if you have two test tenants) → 404/403, never data.
- [ ] DevTools → Network: session cookie is HttpOnly (not readable in JS).

### D5. Known-benign console messages (do not file bugs)
- `contentscript.js … MaxListenersExceededWarning / ObjectMultiplex` — your
  browser extension (e.g. MetaMask), not the app.
- `Banner not shown: beforeinstallpromptevent.preventDefault()` — Chrome's
  standard note about the deferred install banner; the "Download App" button
  calls `prompt()` on click by design.
- Recharts `width(-1) height(-1)` warning — a chart measured inside a
  hidden container during tab switches; cosmetic only.

---

## Quick Regression Checklist (2-minute smoke)

1. Login as Tenant Admin → Agency Command Center renders without crash.
2. Start timer → stop → save → entry listed.
3. Open any invoice → totals pipeline correct.
4. Super Admin → Agency Analytics → snapshot drawer opens.
5. Narrow to mobile width → no horizontal page scroll anywhere.
