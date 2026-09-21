/**
 * Agency Vertical — Domain: profitability engine (Module 1.12)
 *
 * THE single place where profit and margin are computed (definitions §4–§6).
 * Dashboard components display its output; they never re-derive formulas —
 * if a card shows "Gross Profit", the number came from here.
 *
 *   Gross Profit = Revenue − Delivery Cost          (§5)
 *   Gross Margin = (Revenue − Cost) / Revenue       (§6)
 *
 * Margin is null when Revenue = 0 (no baseline — never a fabricated 0% or
 * ±∞). All arithmetic on resolved domain inputs; this engine is pure and
 * deterministic — the same inputs always yield the same outputs.
 */

/** Profitability snapshot (definitions §4–§6, Module 1.12 display contract). */
export interface ProfitabilityResult {
  /** Gross profit in minor units: revenue − deliveryCost (§5). */
  readonly grossProfit: number;
  /** Gross margin (0–1); null when revenue = 0 (§6 no-baseline rule). */
  readonly grossMargin: number | null;
}

/**
 * Compute gross profitability (Module 1.12 domain abstraction).
 * Revenue here is the applicable revenue in scope (§1) — NOT collected
 * cash and NOT invoiced value (Module 1.5 separation rules).
 */
export function computeProfitability(input: {
  /** Applicable revenue in scope, minor units (§1). */
  readonly revenue: number;
  /** Delivery cost in scope, minor units (§4). */
  readonly deliveryCost: number;
}): ProfitabilityResult {
  const grossProfit = input.revenue - input.deliveryCost;
  const grossMargin = input.revenue === 0 ? null : grossProfit / input.revenue;
  return { grossProfit, grossMargin };
}
