/**
 * Agency Vertical — Queries: project metrics (Module 3, Step 3.8 / spec §92)
 *
 * Live project numbers for the Agency Command Center. Follows the
 * queries/conventions.ts rules: tenant-scoped, local-JSON fallback with
 * identical semantics, and every definition documented in exactly one place.
 *
 * Scope definitions (§92 — Module 3 makes PLANNED values live; actuals stay
 * with Time Tracking, billed/collected with Invoicing):
 *
 *   activeProjects     count of status ACTIVE projects (ON_HOLD is paused
 *                      delivery, not active — the KPI says "Active")
 *   contractedRevenue  Σ (contractValue ?? revenueBudget ?? 0) over ACTIVE
 *                      projects — the §1 committed commercial value
 *   plannedMargin      (ΣrevenueBudget − ΣbudgetCost) / ΣrevenueBudget over
 *                      ACTIVE projects that carry BOTH baselines; null when
 *                      none does (no-baseline rule, definitions §6)
 *   portfolio rows     health rows over ACTIVE ∪ ON_HOLD ∪ COMPLETED — real
 *                      delivery work; DRAFT/CANCELLED/ARCHIVED excluded.
 *                      cost/billed/collected are 0 (nothing recorded yet —
 *                      real zeros, not fabricated), margin and budgetBurn
 *                      are null (no actuals exist to compute them).
 */
import { connectDb, initLocalDb, getProjects, getClients } from '@/lib/db';
import { buildProjectHealthRow } from '../analytics/dashboard';
import { sortProjectsByHealth } from '../domain/project-health';
import type { ProjectHealthRow } from '../types/agency.dashboard';
import type { Project } from '../types/project';

/** AGENCY_QUERY_INDEXES registry entry (see conventions.ts rule 2). */
// projects: [{ key: { tenantId: 1, createdAt: -1 }, name: 'agency_projects_tenant_created' }]

/** The portfolio metrics the dashboard route resolves and threads as sources. */
export interface ProjectPortfolioMetrics {
  activeProjects: number;
  contractedRevenue: number;
  plannedMargin: number | null;
  rows: ProjectHealthRow[];
}

/** The §1 committed value of one project — contract first, ceiling fallback. */
function committedValue(p: Project): number {
  return p.contractValue ?? p.revenueBudget ?? 0;
}

/** Fetch the tenant's non-archived projects (Mongo with local fallback). */
async function loadTenantProjects(tenantId: string): Promise<Project[]> {
  const { db } = await connectDb();
  if (db) {
    try {
      return await getProjects(tenantId, { page: 1, limit: 1000 });
    } catch {
      // fall through to the local store
    }
  }
  const data = initLocalDb();
  return (data.projects as Project[])
    .filter(p => p.tenantId === tenantId && p.status !== 'ARCHIVED');
}

/**
 * The Module 3 dashboard source: all planned-economics project numbers in
 * one tenant-scoped pass. Pure read — mutations never happen here.
 */
export async function getProjectPortfolioMetrics(tenantId: string): Promise<ProjectPortfolioMetrics> {
  const projects = await loadTenantProjects(tenantId);

  const active = projects.filter(p => p.status === 'ACTIVE');

  // §6 no-baseline rule: margin only over ACTIVE projects carrying both
  // a revenue budget and a cost budget.
  const withBaselines = active.filter(
    p => p.revenueBudget !== undefined && p.revenueBudget > 0 && p.budgetCost !== undefined
  );
  let plannedMargin: number | null = null;
  if (withBaselines.length > 0) {
    const revenue = withBaselines.reduce((sum, p) => sum + (p.revenueBudget ?? 0), 0);
    const cost = withBaselines.reduce((sum, p) => sum + (p.budgetCost ?? 0), 0);
    plannedMargin = ((revenue - cost) / revenue) * 100;
  }

  // Portfolio health rows — client names resolved once for the batch.
  const clients = await getClients(tenantId, { page: 1, limit: 1000 });
  const clientNames = new Map(clients.map(c => [c.id, c.name]));
  const portfolio = projects.filter(
    p => p.status === 'ACTIVE' || p.status === 'ON_HOLD' || p.status === 'COMPLETED'
  );
  const rows = sortProjectsByHealth(portfolio.map(p => buildProjectHealthRow({
    projectId: p.id,
    name: p.name,
    clientName: clientNames.get(p.clientId) || '—',
    contractValue: committedValue(p),
    cost: 0,        // actual cost — Time Tracking (none recorded: a real zero)
    billed: 0,      // invoiced — Invoicing module (none issued: a real zero)
    collected: 0,   // payments — Payments module (none received: a real zero)
    margin: null,   // actual margin needs actuals (§6 no-baseline rule)
    budgetBurn: null, // burn needs logged hours (§8 no-baseline rule)
    completed: p.status === 'COMPLETED',
  })));

  return {
    activeProjects: active.length,
    contractedRevenue: active.reduce((sum, p) => sum + committedValue(p), 0),
    plannedMargin,
    rows,
  };
}

/**
 * Client-level project summary (spec §93–§94): the client list's Projects
 * column and the client page's project count / planned value. Non-archived
 * projects count — a DRAFT is attached work even before activation.
 */
export interface ClientProjectSummary {
  /** Non-archived projects referencing the client. */
  count: number;
  /** Status-ACTIVE projects referencing the client. */
  activeCount: number;
  /** Σ (contractValue ?? revenueBudget ?? 0) over non-archived projects — PLANNED value. */
  plannedValue: number;
}

export async function getClientProjectSummaries(
  tenantId: string
): Promise<Map<string, ClientProjectSummary>> {
  const projects = await loadTenantProjects(tenantId);
  const summaries = new Map<string, ClientProjectSummary>();
  for (const p of projects) {
    const current = summaries.get(p.clientId) || { count: 0, activeCount: 0, plannedValue: 0 };
    current.count += 1;
    if (p.status === 'ACTIVE') current.activeCount += 1;
    current.plannedValue += committedValue(p);
    summaries.set(p.clientId, current);
  }
  return summaries;
}
