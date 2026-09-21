/**
 * Agency Vertical — Profitability engine: unbilled work (Module 13, §67)
 *
 *   Unbilled Work = Eligible Billable Work − Reserved / Invoiced Work
 *
 * The Module 9 billing lifecycle makes this a direct state read: UNBILLED
 * rows are the eligible-minus-reserved/invoiced set (the queries layer
 * already applied the §67 subset). Sources (§67):
 *
 *   TIME_MATERIALS   approved billable time        (UNBILLED rows only)
 *   MILESTONE        completed milestones           (UNBILLED rows only)
 *   FIXED_FEE        there is no per-item work — the CONTRACT is the billing
 *                    item ("Fixed Fee Billing Items", §67): unbilled =
 *                    max(0, contractValue − billedAmount) at the contract
 *                    level. Documented Phase 1 interpretation.
 *
 * Pure and deterministic. No DB access.
 */
import type { Money } from '../types/money';
import { makeMoney } from '../types/money';
import type { Project } from '../types/project';
import type {
  ProjectExpenseAggregates, ProjectMilestoneAggregates, ProjectTimeAggregates,
} from '../queries/profitability-metrics';
import { frameInProjectCurrency } from './projectCosts';
import { revenueModelForBillingModel } from '../types/profitability';

/** §67 — the unbilled-work computation for one project. */
export interface ProjectUnbilledResult {
  unbilledAmount: Money;
  currencyMismatches: number;
  notes: string[];
}

/**
 * §67 — compute one project's unbilled work. `billed` is the project's
 * §66 billedAmount (Σ totals over issued invoices) — needed only by the
 * fixed-fee contract-level interpretation.
 */
export function computeProjectUnbilled(
  project: Pick<Project, 'billingModel' | 'currency' | 'contractValue'>,
  billed: Money,
  time: ProjectTimeAggregates | undefined,
  expenses: ProjectExpenseAggregates | undefined,
  milestones: ProjectMilestoneAggregates | undefined
): ProjectUnbilledResult {
  const currency = project.currency;
  const notes: string[] = [];
  let currencyMismatches = 0;
  const revenueModel = revenueModelForBillingModel(project.billingModel);

  if (revenueModel === 'FIXED_FEE') {
    // Contract-level: what remains of the contract that has not been invoiced.
    // Without a contract value the number is unresolvable (real zero + note).
    if (project.contractValue === undefined || project.contractValue === null) {
      notes.push('Fixed-fee unbilled work is unresolvable — the project has no contract value');
      return { unbilledAmount: makeMoney(0, currency), currencyMismatches: 0, notes };
    }
    const remaining = Math.max(0, project.contractValue - billed.amount);
    return { unbilledAmount: makeMoney(remaining, currency), currencyMismatches: 0, notes };
  }

  // Source-state unbilled: time + expenses + milestones, §67 subset.
  const t = frameInProjectCurrency(time?.unbilledTime ?? [], currency);
  const e = frameInProjectCurrency(expenses?.unbilledCharge ?? [], currency);
  currencyMismatches = t.mismatches.length + e.mismatches.length;
  if (t.mismatches.length > 0 || e.mismatches.length > 0) {
    notes.push(
      `Unbilled sources carry ${t.mismatches.length + e.mismatches.length} other-currency bucket(s) — excluded from ${currency} (§127: never converted)`
    );
  }
  let amount = t.amount + e.amount;

  if (revenueModel === 'MILESTONE') {
    amount += milestones?.unbilledAmount ?? 0;
    const percent = milestones?.unbilledPercent ?? 0;
    if (percent > 0) {
      if (project.contractValue === undefined || project.contractValue === null) {
        notes.push(
          'Unbilled percentage milestones cannot be valued — the project has no contract value (§73)'
        );
      } else {
        amount += (project.contractValue * percent) / 100;
      }
    }
  }

  return { unbilledAmount: makeMoney(amount, currency), currencyMismatches, notes };
}
