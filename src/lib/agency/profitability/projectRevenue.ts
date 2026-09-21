/**
 * Agency Vertical — Profitability engine: applicable revenue (Module 13, §62)
 *
 * THE operational revenue concept — deliberately simple (§62: "do not
 * overcomplicate accounting revenue recognition"), clearly labeled per
 * billing model:
 *
 *   FIXED_FEE      contract value
 *   TIME_MATERIALS approved billable time value (ALL billing states —
 *                  invoiced time is still earned)
 *   MILESTONE      completed milestone value (amount, or percentage ×
 *                  contractValue — the §73 invoice-time formula)
 *
 * The exact accounting treatment of revenue recognition remains separate
 * from this operational profitability metric (§62, §73: "an operational
 * contribution measure, not a formal accounting revenue-recognition
 * statement").
 *
 * §66 — collected cash is NEVER revenue here. This function never sees a
 * payment; profitability and cash collection are separate views.
 *
 * Pure and deterministic. No DB access.
 */
import type { Money } from '../types/money';
import { makeMoney } from '../types/money';
import type { Project } from '../types/project';
import type { ProjectRevenueModel } from '../types/profitability';
import { revenueModelForBillingModel } from '../types/profitability';
import type {
  ProjectMilestoneAggregates, ProjectTimeAggregates,
} from '../queries/profitability-metrics';
import { frameInProjectCurrency } from './projectCosts';

/** §62 — the applicable-revenue computation for one project. */
export interface ProjectRevenueResult {
  revenueModel: ProjectRevenueModel;
  /** The §62 operational revenue, in the project currency. */
  applicableRevenue: Money;
  currencyMismatches: number;
  notes: string[];
}

/**
 * §62 — compute one project's applicable revenue from the aggregate sources.
 * A real zero (nothing earned yet) is legitimate — the MARGIN is what goes
 * null on zero revenue (§82), not the revenue itself.
 */
export function computeProjectRevenue(
  project: Pick<Project, 'billingModel' | 'currency' | 'contractValue'>,
  time: ProjectTimeAggregates | undefined,
  milestones: ProjectMilestoneAggregates | undefined
): ProjectRevenueResult {
  const currency = project.currency;
  const revenueModel = revenueModelForBillingModel(project.billingModel);
  const notes: string[] = [];
  let currencyMismatches = 0;

  if (revenueModel === 'FIXED_FEE') {
    // §62/§71 — the contract IS the revenue concept. A fixed-fee project
    // without a negotiated value has no revenue baseline: a real zero plus
    // an explanatory note (never a fabricated number, §82 discipline).
    if (project.contractValue === undefined || project.contractValue === null) {
      notes.push('Fixed-fee project has no contract value — applicable revenue is unresolvable (set the contract value)');
      return { revenueModel, applicableRevenue: makeMoney(0, currency), currencyMismatches: 0, notes };
    }
    return {
      revenueModel,
      applicableRevenue: makeMoney(project.contractValue, currency),
      currencyMismatches: 0,
      notes,
    };
  }

  if (revenueModel === 'TIME_MATERIALS') {
    // §62/§72 — approved billable time value, any billing state.
    const framed = frameInProjectCurrency(time?.billableValue ?? [], currency);
    currencyMismatches += framed.mismatches.length;
    if (framed.mismatches.length > 0) {
      notes.push(
        `Billable time value carries ${framed.mismatches.length} other-currency bucket(s) — excluded from ${currency} (§127: never converted)`
      );
    }
    return {
      revenueModel,
      applicableRevenue: makeMoney(framed.amount, currency),
      currencyMismatches,
      notes,
    };
  }

  // MILESTONE — §62/§73: completed milestone value. Amount milestones count
  // their amount; percentage milestones value at percentage × contractValue.
  const m = milestones;
  let amount = m?.completedAmount ?? 0;
  const percent = m?.completedPercent ?? 0;
  if (percent > 0) {
    if (project.contractValue === undefined || project.contractValue === null) {
      // §73 discipline — a percentage milestone without a contract value is
      // not fabricatable. Counted, never invented.
      notes.push(
        `${m?.completedPercentCount ?? 0} completed percentage milestone(s) cannot be valued — the project has no contract value (§73)`
      );
    } else {
      amount += (project.contractValue * percent) / 100;
    }
  }
  return {
    revenueModel,
    applicableRevenue: makeMoney(amount, currency),
    currencyMismatches: 0, // milestone money is project-currency by construction
    notes,
  };
}
