/**
 * Agency Vertical — Query: rate readiness signals (Module 6, §123–§124)
 *
 * The operational questions the agency should be able to answer BEFORE Time
 * Tracking begins (§123): how many projects are financially ready, how many
 * are missing rate configuration, and how many active users carry no cost
 * rate. These surface on the dashboard snapshot (§124) as "Agency Readiness"
 * lines — counts only, never amounts, so the payload is safe for every
 * agency user (§99 cost privacy).
 *
 * "Financially ready" is the §126 composite (client + ACTIVE + team + work
 * item + cost rates + billing-where-T&M), computed by the SAME
 * computeProjectReadiness the project workspace uses — a dashboard number
 * and its detail page can never disagree.
 */
import { getProjects, getProjectMembers, getProjectWorkItems, getUsersByTenant } from '@/lib/db';
import type { Project } from '../types/project';
import { computeProjectReadiness } from '../domain/project-readiness';
import { resolveCostRate } from '../domain/rate-resolution';
import { agencyToday } from '../domain/agency.settings';

export interface RateReadinessMetrics {
  /** Deliverable-scope projects (ACTIVE ∪ ON_HOLD) evaluated. */
  projectsTotal: number;
  /** §126 READY_FOR_TRACKING — structurally and economically complete. */
  projectsReadyForTracking: number;
  /** At least one active member fails rate resolution (cost, or billing on T&M). */
  projectsMissingRates: number;
  /** Active tenant users resolving NO cost rate today — the §123 staffing gap. */
  usersWithoutCostRate: number;
  /** Active tenant users evaluated. */
  usersTotal: number;
}

/** Projects whose readiness is worth measuring — deliverable scope, not drafts or history. */
const READINESS_SCOPES: Project['status'][] = ['ACTIVE', 'ON_HOLD'];

export async function getRateReadinessMetrics(tenantId: string): Promise<RateReadinessMetrics> {
  // §44 — one agency-timezone "today", computed ONCE and passed down to
  // every per-project readiness computation below.
  const date = await agencyToday(tenantId);

  // ---- projects: the §126 composite per project (§123) ----
  // Same load pattern as the portfolio query (limit 1000 — the repo clamps
  // to its page ceiling; Phase 1 tenants sit far below it).
  const allProjects = await getProjects(tenantId, { page: 1, limit: 1000 });
  const projects = allProjects.filter(p => READINESS_SCOPES.includes(p.status));
  let projectsReadyForTracking = 0;
  let projectsMissingRates = 0;
  for (const project of projects) {
    const [members, workItems] = await Promise.all([
      getProjectMembers(project.id, tenantId),
      getProjectWorkItems(project.id, tenantId),
    ]);
    const readiness = await computeProjectReadiness(tenantId, project, members, workItems, date);
    if (readiness.readyForTracking) projectsReadyForTracking++;
    if (!readiness.rateReady || readiness.billingReady === false) projectsMissingRates++;
  }

  // ---- users: who has no cost rate at all (§123/§124) ----
  const users = (await getUsersByTenant(tenantId)).filter(u => u.status !== 'LOCKED' && !!u.id);
  let usersWithoutCostRate = 0;
  for (const u of users) {
    const resolved = await resolveCostRate(tenantId, u.id!, date);
    if (resolved.status !== 'RESOLVED') usersWithoutCostRate++;
  }

  return {
    projectsTotal: projects.length,
    projectsReadyForTracking,
    projectsMissingRates,
    usersWithoutCostRate,
    usersTotal: users.length,
  };
}
