/**
 * Agency Vertical — Queries: performance strategy conventions (Step 0.13)
 *
 * The performance rulebook for every agency aggregation query
 * (PRD §105: fast at 100+ projects / 1,000+ invoices / 50,000+ time entries /
 * 100,000+ transactions).
 *
 * BINDING RULES for anything added to src/lib/agency/queries:
 *
 * 1. AGGREGATION, NOT RETRIEVAL — every summary number comes from a MongoDB
 *    aggregation pipeline (`aggregate([...])`) or an indexed `countDocuments`,
 *    never from `.find().toArray()` followed by JS summation. No entity list
 *    may be fetched for the purpose of totaling it.
 *
 * 2. INDEXED FILTERS — every pipeline's first stage matches an existing
 *    compound index prefix. Registry below (AGENCY_QUERY_INDEXES) is the
 *    contract between queries/ and the index creation in connectDb();
 *    a query may not ship without its index registered here.
 *
 * 3. TENANT FILTER FIRST — every pipeline's $match begins with tenantId
 *    (session-resolved). Non-negotiable (isolation audit 03).
 *
 * 4. DATE RANGES — windowed reports add a bounded $match on the business
 *    date field (YYYY-MM-DD strings compare correctly in MongoDB).
 *    Unbounded all-time scans are allowed only for dashboard KPIs whose
 *    index covers them; reports always bound the window.
 *
 * 5. SERVER-SIDE CALCULATION — metric formulas run in
 *    lib/agency/analytics over aggregation OUTPUT (already-grouped small
 *    result sets), not over raw entity lists. The browser receives finished
 *    numbers only.
 *
 * 6. PROJECTION — pipelines $project only the fields the metric needs.
 *
 * 7. LIMITS — row-level outputs (health table, receivables lists) are
 *    paginated/limited; pipelines that can't paginate must state why.
 *
 * 8. LOCAL FALLBACK — for dev/CI parity, each query provides a JSON-file
 *    fallback path implementing the SAME aggregation semantics in JS over
 *    the local store (small data, acceptable there). The contract is the
 *    same numbers, not the same engine.
 *
 * 9. NO PREMATURE CACHING (Module 1.20) — the dashboard runs on indexed
 *    MongoDB aggregation + server-side calculation, period. No distributed
 *    cache, no Redis, no per-tenant memoization. Caching may be added ONLY
 *    when measured performance requires it (agency_dashboard_query_duration
 *    telemetry shows the SLA breach); the cache then lives behind the query
 *    service — the API contract and the UI never change. Observability
 *    BEFORE optimization.
 *
 * 10. NOTHING SIMULATED FROM THE DEFERRED LIST (Module 1.30) — inside the
 *     dashboard (and everywhere else in the Agency vertical) these are
 *     explicitly NOT built yet, and none of them may be stubbed with fake
 *     behavior or fabricated numbers:
 *       - AI recommendations / AI financial assistant
 *       - resource heat maps
 *       - retainer burn engine
 *       - scope-creep AI
 *       - client portal
 *       - proposal analytics
 *       - advanced sales forecasting
 *       - predictive cash flow
 *     Information-architecture placeholders (a labeled section that says
 *     what WILL live there) are fine; simulated capability is not. When one
 *     of these ships, delete its line here in the same commit.
 */

/** Index registry: every agency aggregation query declares its required index here. */
export const AGENCY_QUERY_INDEXES = {
  // Module 2 — clients (dashboard snapshot activeClients count)
  clients: [
    { key: { tenantId: 1, status: 1 }, name: 'clients_tenant_status' },
  ],
  // Sprint 1 — projects (dashboard health table)
  projects: [
    { key: { tenantId: 1, status: 1 }, name: 'agency_projects_tenant_status' },
    { key: { tenantId: 1, clientId: 1 }, name: 'agency_projects_tenant_client' },
    // Module 3 — default list sort (newest first)
    { key: { tenantId: 1, createdAt: -1 }, name: 'agency_projects_tenant_created' },
  ],
  // Module 3 — sub-entity lookups (always project + tenant scoped)
  projectMembers: [
    { key: { tenantId: 1, projectId: 1 }, name: 'agency_project_members_tenant_project' },
    { key: { tenantId: 1, userId: 1 }, name: 'agency_project_members_tenant_user' },
  ],
  workItems: [
    { key: { tenantId: 1, projectId: 1 }, name: 'agency_work_items_tenant_project' },
  ],
  projectMilestones: [
    { key: { tenantId: 1, projectId: 1, sequence: 1 }, name: 'agency_milestones_tenant_project_seq' },
  ],
  // Sprint 3 — time entries (cost/hours aggregations)
  timeEntries: [
    { key: { tenantId: 1, projectId: 1, date: 1 }, name: 'agency_time_tenant_project_date' },
    { key: { tenantId: 1, userId: 1, date: 1 }, name: 'agency_time_tenant_user_date' },
    { key: { tenantId: 1, billingStatus: 1 }, name: 'agency_time_tenant_billingstatus' },
    // Module 7 §117 — dashboard hours window (queries/time-summary.ts)
    { key: { tenantId: 1, date: -1 }, name: 'agency_time_tenant_date' },
    // Module 7 §117 — §4/§7 approved-state money scans (created in connectDb)
    { key: { tenantId: 1, approvalStatus: 1, date: -1 }, name: 'agency_time_tenant_approval_date' },
  ],
  // Sprint 4 — expenses (transaction metadata)
  expenses: [
    { key: { tenantId: 1, projectId: 1, billable: 1 }, name: 'agency_expense_tenant_project_billable' },
    // Module 8 §119 — §4/§7 approved-state money scans (queries/expense-summary.ts)
    { key: { tenantId: 1, status: 1, expenseDate: -1 }, name: 'agency_expense_tenant_status_date' },
    // Module 8 §119 — §7 invoice-eligible billing filter
    { key: { tenantId: 1, billingStatus: 1 }, name: 'agency_expense_tenant_billing' },
  ],
  // Sprint 6 — invoices & payments
  invoices: [
    { key: { tenantId: 1, clientId: 1, status: 1 }, name: 'agency_invoices_tenant_client_status' },
    { key: { tenantId: 1, dueDate: 1 }, name: 'agency_invoices_tenant_duedate' },
  ],
  payments: [
    { key: { tenantId: 1, invoiceId: 1 }, name: 'agency_payments_tenant_invoice' },
    { key: { tenantId: 1, gatewayPaymentId: 1 }, name: 'agency_payments_tenant_gateway_id' },
  ],
} as const;

/**
 * Shape every agency aggregation query must follow:
 *
 *   export async function getXSummary(tenantId: string): Promise<XSummary> {
 *     const { db } = await connectDb();
 *     if (db) {
 *       const pipeline = [
 *         { $match: { tenantId, ...indexed windowed filters } },
 *         { $group:  { _id: 0, ...sums and averages only } },
 *         { $project: { ...minimum fields } },
 *       ];
 *       const rows = await db.collection('agency_x').aggregate(pipeline).toArray();
 *       return mapRows(rows);                       // analytics-friendly output
 *     }
 *     return computeFromLocalStore(tenantId);        // same semantics in JS
 *   }
 *
 * Queries return pre-aggregated rows; formulas (definitions doc) are applied
 * in lib/agency/analytics — never in the query, never in the browser.
 */
export const AGENCY_QUERY_CONVENTIONS = [
  'tenantId first in every $match',
  'index registered in AGENCY_QUERY_INDEXES before merge',
  'windowed $match on business dates for reports',
  'no find-then-sum — aggregate in the database',
  'project only needed fields',
  'local-JSON fallback with identical semantics',
  'no cache until telemetry proves one is needed (Module 1.20)',
  'nothing simulated from the Module 1.30 deferred list — no AI, no forecasting, no client portal',
] as const;
