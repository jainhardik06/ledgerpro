/**
 * Agency Vertical — Profitability engine: contribution profit & margin
 * (Module 13, §64/§65/§82/§83)
 *
 *   Contribution Profit = Applicable Project Revenue − Delivery Cost   (§64)
 *   Margin %            = Profit / Revenue × 100                        (§65)
 *
 * Wraps the Module 1 kernel (domain/profitability.ts) — the ONE place the
 * formula lives; this file only adapts its Money/percent contract.
 *
 * §82 — revenue zero ⇒ margin is NULL ("N/A"), never a division by zero and
 * never a fake 0%. The kernel already encodes the rule (null margin at zero
 * revenue); this file preserves it in percent units.
 *
 * §83 — internal precision: marginPercent is stored at full floating
 * precision; DISPLAY rounds to 1 decimal (40.0%) per Money OS's global
 * formatting policy (money.ts rule 6 / formatPercentage). Round at the
 * renderer, never here.
 *
 * §66 — revenue in these formulas is the §62 applicable revenue, NEVER
 * collected cash. Pure and deterministic. No DB access.
 */
import type { Money } from '../types/money';
import { makeMoney } from '../types/money';
import { computeProfitability } from '../domain/profitability';

/**
 * Build a Money that may be NEGATIVE (profit when cost exceeds revenue).
 * money.ts's makeMoney refuses negatives by design — profit is the one
 * sanctioned signed money value in the vertical (subtractMoney's contract).
 */
export function signedMoney(value: number, currency: string): Money {
  return { amount: Math.round(value * 100) / 100, currency };
}

/** §64/§65 — the profit & margin computation for one project. */
export interface ProjectMarginResult {
  /** §64 — revenue − deliveryCost; may be negative. */
  grossProfit: Money;
  /** §65 — profit / revenue × 100; NULL when revenue = 0 (§82). */
  marginPercent: number | null;
}

/** §64/§65 — compute profit and margin from framed same-currency inputs. */
export function computeProjectMargin(revenue: Money, deliveryCost: Money): ProjectMarginResult {
  const { grossProfit, grossMargin } = computeProfitability({
    revenue: revenue.amount,
    deliveryCost: deliveryCost.amount,
  });
  return {
    grossProfit: signedMoney(grossProfit, revenue.currency),
    marginPercent: grossMargin === null ? null : grossMargin * 100,
  };
}
