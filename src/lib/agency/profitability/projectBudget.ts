/**
 * Agency Vertical — Profitability engine: budget burn (Module 13, §74/§76)
 *
 * THREE separate burn indicators — never one generic budget percentage:
 *
 *   Hours Burn    actualHours / plannedHours      (null when no plan)
 *   Cost Burn     deliveryCost / budgetCost       (null when no cost budget)
 *   Revenue Burn  applicableRevenue / revenueBudget (null when no ceiling)
 *
 * §74 example: hours 316/400 = 79%, cost ₹245k/₹300k = 81.7%,
 * revenue ₹300k/₹500k = 60%.
 *
 * §68's single `budgetBurnPercent` field is the HEADLINE burn = max(hours,
 * cost) — the worst budget dimension, which is exactly what health consumes.
 * Revenue burn is informational and NEVER a health input (low revenue burn
 * is not a problem state).
 *
 * §76 — the scope-creep FOUNDATION: plannedHours / actualHours /
 * remainingHours / hourBurnPercent plus deterministic warnings at 80%
 * (approaching), 100% (exhausted), >100% (over budget). No semantic scope
 * detection in Phase 1 — later scope intelligence consumes these signals.
 *
 * Ratios are 0–1 (not percent) — the health engine's convention. Burn
 * percent for display multiplies by 100. Pure and deterministic.
 */
import type { ProjectBudgetBurn, HoursBudgetSignal } from '../types/profitability';

/** §74 — the three-burn computation for one project. */
export interface ProjectBudgetResult {
  burn: ProjectBudgetBurn;
  /** §68 headline — max(hours, cost) burn; null when neither baseline exists. */
  budgetBurnPercent: number | null;
  /** §76 — planned − actual; null when no plan exists. */
  remainingHours: number | null;
}

/** Divide with the no-baseline rule: null when the denominator is 0/absent. */
function ratio(numerator: number, denominator: number | null | undefined): number | null {
  if (denominator === null || denominator === undefined || denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * §74/§76 — compute the three burns. Inputs are already-framed domain values
 * (actual hours from approved minutes; costs/revenue from the engine).
 */
export function computeProjectBudgetBurn(input: {
  plannedHours: number | null | undefined;
  actualHours: number;
  deliveryCost: number;
  budgetCost: number | null | undefined;
  applicableRevenue: number;
  revenueBudget: number | null | undefined;
}): ProjectBudgetResult {
  const hours = ratio(input.actualHours, input.plannedHours);
  const cost = ratio(input.deliveryCost, input.budgetCost);
  const revenue = ratio(input.applicableRevenue, input.revenueBudget);
  const candidates = [hours, cost].filter((r): r is number => r !== null);
  const headline = candidates.length === 0 ? null : Math.max(...candidates);
  return {
    burn: { hours, cost, revenue },
    budgetBurnPercent: headline,
    remainingHours: input.plannedHours === null || input.plannedHours === undefined
      ? null
      : input.plannedHours - input.actualHours,
  };
}

/** §76 thresholds — deterministic constants (Phase 1). */
export const HOURS_BURN_APPROACHING = 0.80;
export const HOURS_BURN_EXHAUSTED = 1.00;

/**
 * §76 — the hours-budget warning. 80% → APPROACHING, 100% → EXHAUSTED,
 * >100% → OVER; null while under 80% or when no plan exists.
 */
export function hoursBudgetWarning(hourBurn: number | null): HoursBudgetSignal | null {
  if (hourBurn === null) return null;
  const percent = hourBurn * 100;
  if (hourBurn > HOURS_BURN_EXHAUSTED) {
    return {
      level: 'OVER',
      hourBurnPercent: percent,
      message: `Hours are over budget (${percent.toFixed(1)}% of planned) — scope or budget needs a decision`,
    };
  }
  if (hourBurn >= HOURS_BURN_EXHAUSTED) {
    return {
      level: 'EXHAUSTED',
      hourBurnPercent: percent,
      message: 'Planned hours are exhausted — every further hour is over budget',
    };
  }
  if (hourBurn >= HOURS_BURN_APPROACHING) {
    return {
      level: 'APPROACHING',
      hourBurnPercent: percent,
      message: `Hours are approaching the planned budget (${percent.toFixed(1)}%)`,
    };
  }
  return null;
}
