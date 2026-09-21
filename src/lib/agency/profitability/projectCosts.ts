/**
 * Agency Vertical — Profitability engine: delivery costs (Module 13, §63)
 *
 *   Delivery Cost = Labor Cost + Project Expenses        (§63)
 *   Labor         = Approved Time × Cost Rate Snapshot   (§63 — frozen, §6/§23)
 *   Expenses      = Approved Project Expenses            (§63)
 *
 * The aggregation ran in queries/profitability-metrics.ts; this file FRAMES
 * the per-currency sums in the project's own currency (§127 — never convert):
 * the project-currency bucket is the number, every other bucket is counted as
 * a mismatch and surfaced in the payload (explainable, never silently
 * dropped, never converted).
 *
 * Pure and deterministic: same inputs → same outputs. No DB access.
 */
import type { Money } from '../types/money';
import { makeMoney } from '../types/money';
import type {
  ProjectExpenseAggregates, ProjectTimeAggregates,
} from '../queries/profitability-metrics';
import type { CurrencyAmount } from '../queries/profitability-metrics';

/**
 * Take the project-currency bucket of a per-currency sum. Returns the framed
 * amount, the other buckets (mismatches), and their total — the caller
 * decides how to word the note.
 */
export function frameInProjectCurrency(
  sums: readonly CurrencyAmount[],
  currency: string
): { amount: number; mismatches: CurrencyAmount[] } {
  let amount = 0;
  const mismatches: CurrencyAmount[] = [];
  for (const sum of sums) {
    if (sum.currency === currency) amount += sum.amount;
    else if (sum.amount !== 0) mismatches.push(sum);
  }
  return { amount, mismatches };
}

/** §63 — the delivery-cost computation for one project. */
export interface ProjectCostsResult {
  /** Approved time × cost-rate snapshot, in the project currency. */
  laborCost: Money;
  /** Approved project expenses, in the project currency. */
  expenseCost: Money;
  /** laborCost + expenseCost (§63). */
  deliveryCost: Money;
  /** Source rows excluded because their currency ≠ the project currency. */
  currencyMismatches: number;
  /** §79 explainability notes (deterministic strings, never speculation). */
  notes: string[];
}

/**
 * §63 — compute one project's delivery cost from the aggregate sources.
 * `time`/`expenses` may be undefined (no rows exist for the project) — that
 * is a real zero, never a fabrication.
 */
export function computeProjectCosts(
  currency: string,
  time: ProjectTimeAggregates | undefined,
  expenses: ProjectExpenseAggregates | undefined
): ProjectCostsResult {
  const notes: string[] = [];
  let currencyMismatches = 0;

  const labor = frameInProjectCurrency(time?.laborCost ?? [], currency);
  currencyMismatches += labor.mismatches.length;
  const laborCost = makeMoney(labor.amount, currency);

  const spend = frameInProjectCurrency(expenses?.cost ?? [], currency);
  currencyMismatches += spend.mismatches.length;
  const expenseCost = makeMoney(spend.amount, currency);

  // §96 honesty — tracked-but-unpriced time is real delivery effort the cost
  // number does NOT carry. Counted, never zeroed silently.
  if (time && time.rateMissingCount > 0) {
    notes.push(
      `${time.rateMissingCount} approved time entr${time.rateMissingCount === 1 ? 'y has' : 'ies have'} no cost rate — their labor is not in the cost (rate configuration required, §96)`
    );
  }
  if (labor.mismatches.length > 0) {
    notes.push(
      `Labor cost carries ${labor.mismatches.length} other-currency bucket(s) — excluded from the project currency ${currency} (§127: never converted)`
    );
  }
  if (spend.mismatches.length > 0) {
    notes.push(
      `Expense cost carries ${spend.mismatches.length} other-currency bucket(s) — excluded from the project currency ${currency} (§127: never converted)`
    );
  }

  return {
    laborCost,
    expenseCost,
    deliveryCost: makeMoney(laborCost.amount + expenseCost.amount, currency),
    currencyMismatches,
    notes,
  };
}
