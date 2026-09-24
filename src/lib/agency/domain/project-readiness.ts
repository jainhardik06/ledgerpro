/**
 * Agency Vertical — Domain: project financial readiness (Module 6, §108–§110/§125–§127)
 *
 * Readiness ≠ lifecycle (§108): a project's STATUS (DRAFT/ACTIVE/…) says where
 * it is in delivery; READINESS says whether its financial configuration is
 * complete enough for the future Time Tracking + profitability engine to be
 * meaningful. The two are deliberately separate dimensions.
 *
 * The checks (§109): Client / Billing Model / Revenue Budget / Cost Budget /
 * Planned Hours / Team / Cost Rates / Billing Rates. The last two run the
 * REAL resolution engine (§94) per active team member — no fake coverage.
 *
 * WARN, NEVER BLOCK (§127): missing rates never block creation or activation.
 * This module computes and reports; enforcement is a deliberate non-feature.
 *
 * COST PRIVACY (§99): this module resolves cost rates internally but surfaces
 * ONLY counts and booleans ("2/5 configured") — amounts never leave the
 * resolution engine, so the readiness payload is safe for every agency user.
 */
import type { Project, ProjectMember, WorkItem } from '../types/project';
import { BILLING_MODELS } from '../types/client';
import { agencyToday } from './agency.settings';
import { resolveCostRate, resolveBillingRate } from './rate-resolution';

export type ReadinessCheckKey =
  | 'client' | 'billingModel' | 'revenueBudget' | 'costBudget'
  | 'plannedHours' | 'team' | 'costRates' | 'billingRates'
  | 'projectActive' | 'workItems';

/** One line of the §109 readiness panel: a named check, its state, its story. */
export interface ReadinessCheck {
  key: ReadinessCheckKey;
  label: string;
  ready: boolean;
  /** Human sentence — the ⚠ rows say exactly WHAT is missing, never just "error". */
  detail: string;
}

export interface ProjectReadiness {
  checks: ReadinessCheck[];
  /** §125 RATE_READY — every active team member resolves a cost rate today. */
  rateReady: boolean;
  /**
   * §125 BILLING_READY — T&M only: every active member's role resolves a
   * billing rate today. null when the model isn't T&M (the check doesn't
   * apply — fixed-fee projects don't bill by role).
   */
  billingReady: boolean | null;
  /**
   * §126 READY_FOR_TRACKING — the composite the future Time Tracking module
   * can enforce: client linked, project ACTIVE, team configured, a work
   * item exists to log against, cost rates resolvable, and billing rates
   * resolvable where the model bills by role. Budgets and planned hours are
   * deliberately NOT part of this composite (§126 doesn't list them) — they
   * stay advisory checks above.
   */
  readyForTracking: boolean;
  /** §109 — "Configured Rates N/M team members", the panel's summary line. */
  configuredCostRates: { configured: number; total: number };
  configuredBillingRates: { configured: number; total: number } | null;
}

/** §110/§126 — compute a project's financial readiness against its ACTIVE team. */
export async function computeProjectReadiness(
  tenantId: string,
  project: Project,
  members: ProjectMember[],
  /** The project's work items — already fetched by the workspace GET; pass [] to treat "no work items" honestly. */
  workItems: WorkItem[] = [],
  /**
   * §44 — the "as of" date for rate resolution, in the AGENCY's timezone.
   * Callers looping over projects (rate-readiness) compute it once and pass
   * it down; omitted, this fetches the tenant itself.
   */
  asOf?: string
): Promise<ProjectReadiness> {
  const active = members.filter(m => m.active !== false);
  const date = asOf ?? await agencyToday(tenantId);

  // ---- cost rates: the real engine, per member (§94) ----
  let costConfigured = 0;
  const membersWithoutCostRate: string[] = [];
  for (const m of active) {
    const resolved = await resolveCostRate(tenantId, m.userId, date);
    if (resolved.status === 'RESOLVED') costConfigured++;
    else membersWithoutCostRate.push(m.userId);
  }
  const costTotal = active.length;

  // ---- billing rates: T&M only (§125) ----
  const isTm = project.billingModel === 'TIME_AND_MATERIALS';
  let billingConfigured = 0;
  const membersWithoutBillingRate: number[] = [];
  if (isTm) {
    for (let i = 0; i < active.length; i++) {
      const m = active[i];
      // §89 — billing prices a role, not a person. A member without a role
      // label cannot resolve; that is honestly "not configured".
      if (!m.role) {
        membersWithoutBillingRate.push(i);
        continue;
      }
      const resolved = await resolveBillingRate(tenantId, project.clientId, project.id, date, m.role);
      if (resolved.status === 'RESOLVED') billingConfigured++;
      else membersWithoutBillingRate.push(i);
    }
  }

  // §126 — the two structural dimensions: the project must be live (ACTIVE)
  // and there must be a work item to log time against. Archived items don't
  // count — they are completed-withdrawn work, not a logging target.
  const isActive = project.status === 'ACTIVE';
  const openWorkItems = workItems.filter(w => w.status !== 'ARCHIVED');

  const checks: ReadinessCheck[] = [
    {
      key: 'client',
      label: 'Client',
      ready: !!project.clientId,
      detail: project.clientId ? 'Linked to a client' : 'No client linked',
    },
    {
      key: 'billingModel',
      label: 'Billing Model',
      ready: BILLING_MODELS.includes(project.billingModel),
      detail: project.billingModel ? String(project.billingModel) : 'Not set',
    },
    {
      key: 'revenueBudget',
      label: 'Revenue Budget',
      ready: project.revenueBudget !== undefined && project.revenueBudget > 0,
      detail: project.revenueBudget !== undefined && project.revenueBudget > 0
        ? `${project.currency} ${project.revenueBudget.toLocaleString('en-IN')}`
        : 'Not set',
    },
    {
      key: 'costBudget',
      label: 'Cost Budget',
      ready: project.budgetCost !== undefined && project.budgetCost > 0,
      detail: project.budgetCost !== undefined && project.budgetCost > 0
        ? `${project.currency} ${project.budgetCost.toLocaleString('en-IN')}`
        : 'Not set',
    },
    {
      key: 'plannedHours',
      label: 'Planned Hours',
      ready: project.plannedHours !== undefined && project.plannedHours > 0,
      detail: project.plannedHours !== undefined && project.plannedHours > 0
        ? String(project.plannedHours)
        : 'Not set',
    },
    {
      key: 'team',
      label: 'Team',
      ready: costTotal > 0,
      detail: costTotal > 0
        ? `${costTotal} active ${costTotal === 1 ? 'member' : 'members'}`
        : 'No active team members',
    },
    {
      key: 'costRates',
      label: 'Cost Rates',
      ready: costTotal > 0 && costConfigured === costTotal,
      detail: costTotal === 0
        ? 'No team to price'
        : `Configured rates ${costConfigured}/${costTotal} team members${membersWithoutCostRate.length ? ' — resolve via cost card assignments' : ''}`,
    },
    {
      key: 'billingRates',
      label: 'Billing Rates',
      ready: !isTm || (costTotal > 0 && billingConfigured === costTotal),
      detail: !isTm
        ? `${project.billingModel} — billed as a whole, not by role`
        : costTotal === 0
          ? 'No team to price'
          : `Configured rates ${billingConfigured}/${costTotal} member roles${membersWithoutBillingRate.length ? ' — resolve via billing cards' : ''}`,
    },
    {
      key: 'projectActive',
      label: 'Project Active',
      ready: isActive,
      detail: isActive ? 'Project is live for delivery' : `Status ${project.status} — time tracking requires an active project`,
    },
    {
      key: 'workItems',
      label: 'Work Items',
      ready: openWorkItems.length > 0,
      detail: openWorkItems.length > 0
        ? `${openWorkItems.length} open ${openWorkItems.length === 1 ? 'item' : 'items'} to log against`
        : 'No open work items — create one before tracking time',
    },
  ];

  const rateReady = costTotal > 0 && costConfigured === costTotal;
  const billingReady = isTm ? (costTotal > 0 && billingConfigured === costTotal) : null;

  return {
    checks,
    rateReady,
    billingReady,
    // §126 composite — structural (client/active/team/work) + economic (cost,
    // and billing where the model bills by role). Advisory budget checks
    // stay out of it on purpose.
    readyForTracking:
      !!project.clientId
      && isActive
      && costTotal > 0
      && openWorkItems.length > 0
      && rateReady
      && billingReady !== false,
    configuredCostRates: { configured: costConfigured, total: costTotal },
    configuredBillingRates: isTm ? { configured: billingConfigured, total: costTotal } : null,
  };
}
