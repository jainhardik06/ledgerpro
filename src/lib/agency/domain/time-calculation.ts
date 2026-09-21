/**
 * Agency Vertical — Domain: time economics engine (Module 7, §23/§127)
 *
 * THE shared calculation service for time money (§127: calculation lives in
 * the engine, NEVER in React components, API routes, reports or PDFs). Pure
 * functions over FROZEN data — the only inputs are the entry's stored
 * durationMinutes, its billable flag, and the snapshots frozen at
 * creation/approval (§6/§7). Nothing here resolves a live rate; that is
 * resolveTimeEntryRates' job (agency.time.ts), and its output is frozen long
 * before this module ever runs.
 *
 * Rules encoded (binding):
 *
 *   §23  cost = hours × costRateSnapshot; billable value = hours ×
 *        billingRateSnapshot. hoursFromMinutes is the single hours factor.
 *   §24  a missing snapshot side yields NO amount — never a silent zero
 *        (rate contract §96). The entry's financialStatus is the honest
 *        signal, not an amount of 0.
 *   §113 only HOUR-unit snapshots price hours; DAY/FIXED snapshots are
 *        filtered upstream (resolveTimeEntryRates) and never reach here.
 *   Money all arithmetic goes through money.ts minor-units helpers —
 *        no ad-hoc float multiplication.
 *   Mixed an aggregation over mixed currencies returns null totals rather
 *        than converting or throwing (Rule: never fake a number).
 */
import type { Money } from '../types/money';
import { makeMoney, multiplyMoney, addMoney } from '../types/money';
import type { RateSnapshot, TimeEntry } from '../types/time';
import { hoursFromMinutes } from '../types/time';

/**
 * §23 — compute one entry's economics from its frozen snapshots.
 * Pure; exported as the §127 `calculateTimeEconomics` engine slot.
 */
export function calculateTimeEconomics(entry: {
  durationMinutes: number;
  billable: boolean;
  costRateSnapshot?: RateSnapshot;
  billingRateSnapshot?: RateSnapshot;
}): { calculatedCost?: Money; calculatedBillableAmount?: Money } {
  const hours = hoursFromMinutes(entry.durationMinutes);
  const calculatedCost = entry.costRateSnapshot
    ? multiplyMoney(makeMoney(entry.costRateSnapshot.amount, entry.costRateSnapshot.currency), hours)
    : undefined;
  const calculatedBillableAmount = entry.billable && entry.billingRateSnapshot
    ? multiplyMoney(makeMoney(entry.billingRateSnapshot.amount, entry.billingRateSnapshot.currency), hours)
    : undefined;
  return { calculatedCost, calculatedBillableAmount };
}

export interface TimeEconomicsTotals {
  /** Total tracked minutes across the aggregated entries. */
  totalMinutes: number;
  /** Σ calculatedCost; null when no entry carries cost or currencies mix. */
  totalCost: Money | null;
  /** Σ calculatedBillableAmount; null when none or mixed currencies. */
  totalBillable: Money | null;
  /** Distinct currencies seen on cost amounts (>1 makes totalCost null). */
  mixedCostCurrencies: boolean;
  /** Distinct currencies seen on billable amounts (>1 makes totalBillable null). */
  mixedBillableCurrencies: boolean;
}

/**
 * Aggregate stored economics over a set of entries (§118 planned-vs-actuals,
 * §119 unbilled-work engine, dashboards). Sums ONLY what was computed at
 * approval (§23) — DRAFT/REJECTED/blocked entries contribute duration but no
 * money, honestly. Mixed currencies never convert (money.ts rule): the
 * affected total is null and the flag says why.
 */
export function aggregateTimeEconomics(
  entries: ReadonlyArray<Pick<TimeEntry, 'durationMinutes' | 'calculatedCost' | 'calculatedBillableAmount'>>
): TimeEconomicsTotals {
  const costCurrencies = new Set<string>();
  const billableCurrencies = new Set<string>();
  let totalMinutes = 0;

  for (const e of entries) {
    totalMinutes += e.durationMinutes;
    if (e.calculatedCost) costCurrencies.add(e.calculatedCost.currency);
    if (e.calculatedBillableAmount) billableCurrencies.add(e.calculatedBillableAmount.currency);
  }

  const mixedCostCurrencies = costCurrencies.size > 1;
  const mixedBillableCurrencies = billableCurrencies.size > 1;

  const costs = entries.map(e => e.calculatedCost).filter((m): m is Money => !!m);
  const billables = entries.map(e => e.calculatedBillableAmount).filter((m): m is Money => !!m);

  return {
    totalMinutes,
    totalCost: costs.length > 0 && !mixedCostCurrencies ? addMoney(...costs) : null,
    totalBillable: billables.length > 0 && !mixedBillableCurrencies ? addMoney(...billables) : null,
    mixedCostCurrencies,
    mixedBillableCurrencies,
  };
}
