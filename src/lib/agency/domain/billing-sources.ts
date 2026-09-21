/**
 * Agency Vertical — Domain: billing source aggregation (Module 9, §69/§70/§144)
 *
 * Sprint 9C — the eligible-item services the invoice wizard's "Billable
 * Items" step lists. Each returns ONLY items that may legally be added to a
 * draft RIGHT NOW (§70):
 *
 *   Time       APPROVED + billable + financialStatus READY + UNBILLED
 *   Expense    APPROVED + billable + UNBILLED (§48)
 *   Milestone  COMPLETED + UNBILLED + a commercial definition (amount XOR
 *              percentage, §46)
 *
 * RESERVED items are deliberately EXCLUDED: they are already selected by
 * another draft (§65) — the wizard must not offer them, and the honest
 * signal is absence, not an error. INVOICED items are history (§62).
 *
 * Each service also returns the value the item would bill at — frozen
 * source money, never a live re-derivation:
 *   Time       calculatedBillableAmount (§23 — hours × frozen snapshot)
 *   Expense    clientChargeAmount (§49 — the charge, never the cost)
 *   Milestone  amount, or percentage × project contractValue (§73 — frozen
 *              at read here and re-frozen into the line at add-time)
 *
 * Percentage milestones on projects without a contract value are excluded
 * and COUNTED (motive: the §97 never-hide-missing-config rule — the caller
 * surfaces "N milestones cannot be valued", not a silently shorter list).
 */
import {
  getProjects, getProjectById, getProjectMilestones,
  getTimeEntries, getExpenses, updateTimeEntry, getProjectMembers,
  type ExpenseFilters,
} from '@/lib/db';
import type { TimeEntry } from '../types/time';
import { isInvoiceEligible } from '../types/time';
import type { Expense } from '../types/expense';
import type { ProjectMilestone, Project } from '../types/project';
import { milestoneHasSingleCommercialDefinition } from '../types/project';
import { makeMoney, multiplyMoney, type Money } from '../types/money';
import { resolveTimeEntryRates } from './agency.time';
import { calculateTimeEconomics } from './time-calculation';

// ---------- §70 time ----------

/** One billable time entry with its frozen billable value and display bits. */
export interface BillableTimeItem {
  entry: TimeEntry;
  /** §23 — hours × billingRateSnapshot, frozen at approval. */
  amount: Money;
}

export interface UnpricedTimeSummary {
  count: number;
  durationMinutes: number;
  roles: string[];
}

export interface BillableTimeResult {
  items: BillableTimeItem[];
  unpriced: UnpricedTimeSummary;
}

/**
 * §70/§144 — approved, billable, rate-ready, unbilled time with honest
 * accounting for unpriced entries (§96/§97). If rates were configured after
 * entry creation, attempts to resolve them now so work is not permanently blocked.
 */
export async function getBillableTimeDetailed(
  tenantId: string,
  filters: { projectId?: string } = {}
): Promise<BillableTimeResult> {
  const entries = await getTimeEntries(tenantId, {
    ...(filters.projectId !== undefined && { projectId: filters.projectId }),
    approvalStatus: 'APPROVED',
    billingStatus: 'UNBILLED',
    billable: true,
  });

  const items: BillableTimeItem[] = [];
  const unpriced: UnpricedTimeSummary = { count: 0, durationMinutes: 0, roles: [] };
  const roleSet = new Set<string>();

  for (const entry of entries) {
    // If rate was unconfigured at approval time, try to resolve it now (rates configured since)
    if (!isInvoiceEligible(entry) || entry.calculatedBillableAmount === undefined) {
      if (entry.billingStatus === 'UNBILLED' && entry.approvalStatus === 'APPROVED' && entry.billable) {
        try {
          const rates = await resolveTimeEntryRates({
            tenantId,
            projectId: entry.projectId,
            userId: entry.userId,
            date: entry.date,
            billable: true,
          });
          if (rates.billingRateSnapshot) {
            const economics = calculateTimeEconomics({
              durationMinutes: entry.durationMinutes,
              billable: true,
              costRateSnapshot: entry.costRateSnapshot ?? rates.costRateSnapshot ?? undefined,
              billingRateSnapshot: rates.billingRateSnapshot,
            });
            if (economics.calculatedBillableAmount) {
              await updateTimeEntry(entry.id, tenantId, {
                billingRateSnapshot: rates.billingRateSnapshot,
                costRateSnapshot: entry.costRateSnapshot ?? rates.costRateSnapshot ?? undefined,
                calculatedBillableAmount: economics.calculatedBillableAmount,
                ...(economics.calculatedCost && { calculatedCost: economics.calculatedCost }),
                financialStatus: rates.financialStatus,
              });
              entry.billingRateSnapshot = rates.billingRateSnapshot;
              entry.calculatedBillableAmount = economics.calculatedBillableAmount;
              entry.financialStatus = rates.financialStatus;
            }
          }
        } catch {
          // Resolution failed, keep original entry state
        }
      }
    }

    if (isInvoiceEligible(entry) && entry.calculatedBillableAmount !== undefined) {
      items.push({ entry, amount: entry.calculatedBillableAmount });
    } else {
      unpriced.count += 1;
      unpriced.durationMinutes += entry.durationMinutes;
      try {
        const members = await getProjectMembers(entry.projectId, tenantId);
        const member = members.find(m => m.userId === entry.userId);
        if (member?.role) roleSet.add(member.role);
      } catch {
        // Ignored
      }
    }
  }

  unpriced.roles = Array.from(roleSet);
  return { items, unpriced };
}

/**
 * §70/§144 — approved, billable, rate-ready, unbilled time. projectId
 * scopes to one engagement; without it, the whole tenant's billable time is
 * listed (the invoice center's client-level flow filters further in the
 * route, which knows the client's projects).
 */
export async function getBillableTime(
  tenantId: string,
  filters: { projectId?: string } = {}
): Promise<BillableTimeItem[]> {
  const result = await getBillableTimeDetailed(tenantId, filters);
  return result.items;
}

// ---------- §70 expenses ----------

/** One billable expense with its client charge (§49). */
export interface BillableExpenseItem {
  expense: Expense;
  /** §49 — the client charge (cost + markup), never the raw cost. */
  amount: Money;
}

/** §70/§144/§48 — approved, billable, unbilled expenses. */
export async function getBillableExpenses(
  tenantId: string,
  filters: Omit<ExpenseFilters, 'billable' | 'status' | 'billingStatus'> = {}
): Promise<BillableExpenseItem[]> {
  const expenses = await getExpenses(tenantId, {
    ...filters,
    billable: true,
    status: 'APPROVED',
    billingStatus: 'UNBILLED',
  });
  return expenses
    .filter(e => e.clientChargeAmount !== undefined)
    .map(expense => ({ expense, amount: expense.clientChargeAmount! }));
}

// ---------- §70 milestones ----------

/** One billable milestone with its frozen invoiceable value. */
export interface BillableMilestoneItem {
  milestone: ProjectMilestone;
  project: Project;
  /** §73 — amount, or percentage × contractValue (frozen at read). */
  amount: Money;
}

export interface BillableMilestonesResult {
  items: BillableMilestoneItem[];
  /** §97 — milestones that exist and are COMPLETED but cannot be valued
   *  (percentage-based, project has no contract value). Counted, never hidden. */
  unvaluable: number;
}

/**
 * §70/§144/§73 — COMPLETED, unbilled milestones with a commercial
 * definition. Scopes to one project when projectId is given (the project
 * billing tab); otherwise it walks every non-archived project of the tenant
 * (the invoice center's project picker feeds the chosen project in).
 */
export async function getBillableMilestones(
  tenantId: string,
  filters: { projectId?: string } = {}
): Promise<BillableMilestonesResult> {
  const projects = filters.projectId !== undefined
    ? [await getProjectById(filters.projectId, tenantId)].filter((p): p is Project => p !== null)
    : (await getProjects(tenantId)).filter(p => p.status !== 'ARCHIVED');

  const items: BillableMilestoneItem[] = [];
  let unvaluable = 0;

  for (const project of projects) {
    const milestones = await getProjectMilestones(project.id, tenantId);
    for (const milestone of milestones) {
      if (milestone.status !== 'COMPLETED') continue;
      if (milestone.billingStatus === 'INVOICED' || milestone.billingStatus === 'RESERVED') continue;
      if (!milestoneHasSingleCommercialDefinition(milestone)) continue;

      if (milestone.amount !== undefined) {
        items.push({ milestone, project, amount: makeMoney(milestone.amount, project.currency) });
      } else if (project.contractValue !== undefined) {
        // §73 — freeze percentage × contract value at read time.
        const amount = multiplyMoney(
          makeMoney(project.contractValue, project.currency),
          milestone.percentage! / 100
        );
        items.push({ milestone, project, amount });
      } else {
        // §97 — honest count, never a hidden gap.
        unvaluable += 1;
      }
    }
  }

  return { items, unvaluable };
}
