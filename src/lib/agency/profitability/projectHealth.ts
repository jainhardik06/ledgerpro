/**
 * Agency Vertical — Profitability engine: health (Module 13, §75/§77)
 *
 * §75's rules — deliberately RICHER than the Module 1 dashboard row engine
 * (domain/project-health.ts), which stays the owner of that table:
 *
 *   OVER_BUDGET   hours burn > 100% OR cost burn > 100%
 *   AT_RISK       burn > 90%  OR  margin meaningfully below TARGET
 *                 (past the approaching band)
 *   WATCH         burn 75–90% OR  margin approaching target (within the
 *                 band below it)
 *   HEALTHY       hours burn < 75% AND cost burn < 75% AND margin ≥ target
 *
 * Differences from the Module 1 engine, both spec-driven (§75):
 *   - TWO burns (hours AND cost) evaluated independently, not one generic.
 *   - margin compares against the PROJECT's targetMargin (falling back to a
 *     configurable default), not absolute portfolio floors.
 *   - the union is the §68 four-state FINANCIAL verdict — no COMPLETED
 *     member (lifecycle state lives on the Project).
 *
 * §75: "These are configurable rules" — the threshold object is the
 * configuration surface (per-tenant seeding can arrive without touching the
 * engine).
 *
 * Null handling (§82 discipline): a null burn (no baseline) or null margin
 * (no revenue) can never SATISFY a risk condition — missing data is not
 * risk. It also cannot fail the HEALTHY margin condition; the residual
 * HEALTHY verdict is the honest answer for a project with nothing to burn.
 *
 * §77 — AT_RISK margin verdicts must explain themselves; marginAlertFor
 * builds the deterministic reason. Pure engine. No DB access.
 */
import type { ProjectFinancialHealth, ProjectMarginAlert } from '../types/profitability';

/** §75 — configurable thresholds (ratios 0–1; margins in PERCENT 0–100). */
export interface ProfitabilityHealthThresholds {
  /** Burn at/below which the project is comfortably on track (default 0.75). */
  readonly healthyBurnMax: number;
  /** Burn above which the project is AT_RISK (default 0.90). */
  readonly riskBurnOver: number;
  /** Burn above 100% → OVER_BUDGET (default 1.00). */
  readonly budgetBurnLimit: number;
  /** Default target margin in PERCENT when the project carries none (§37 default 40). */
  readonly defaultTargetMargin: number;
  /** Margin within this band below target is "approaching" → WATCH (default 10 pp). */
  readonly marginApproachingBand: number;
}

export const DEFAULT_PROFITABILITY_HEALTH_THRESHOLDS: ProfitabilityHealthThresholds = {
  healthyBurnMax: 0.75,
  riskBurnOver: 0.90,
  budgetBurnLimit: 1.00,
  defaultTargetMargin: 40,
  marginApproachingBand: 10,
};

/** §75 — the health engine input (already-framed domain values). */
export interface ProjectHealthEngineInput {
  /** §74 hours burn ratio (0–1); null when no planned-hours baseline. */
  readonly hoursBurn: number | null;
  /** §74 cost burn ratio (0–1); null when no cost-budget baseline. */
  readonly costBurn: number | null;
  /** §65 margin in PERCENT (0–100); null when revenue = 0 (§82). */
  readonly marginPercent: number | null;
  /** The project's targetMargin in PERCENT; null falls back to the default. */
  readonly targetMargin: number | null;
}

/**
 * §75 — exactly one financial health verdict, in priority order
 * OVER_BUDGET > AT_RISK > WATCH > HEALTHY (problems outrank successes).
 */
export function computeProjectFinancialHealth(
  input: ProjectHealthEngineInput,
  thresholds: ProfitabilityHealthThresholds = DEFAULT_PROFITABILITY_HEALTH_THRESHOLDS
): ProjectFinancialHealth {
  const target = input.targetMargin ?? thresholds.defaultTargetMargin;

  // 1. OVER_BUDGET — either budget dimension exhausted.
  const hoursOver = input.hoursBurn !== null && input.hoursBurn > thresholds.budgetBurnLimit;
  const costOver = input.costBurn !== null && input.costBurn > thresholds.budgetBurnLimit;
  if (hoursOver || costOver) return 'OVER_BUDGET';

  // 2. AT_RISK — burn > 90% OR margin below the target the economics demand.
  //    "Below" means MEANINGFULLY below (past the approaching band) — a
  //    margin inside the band is §75's "margin approaching target", which is
  //    exactly the WATCH line one step down (otherwise the band could never
  //    fire and the two spec lines would collapse into one).
  const hoursAtRisk = input.hoursBurn !== null && input.hoursBurn > thresholds.riskBurnOver;
  const costAtRisk = input.costBurn !== null && input.costBurn > thresholds.riskBurnOver;
  const marginAtRisk = input.marginPercent !== null
    && input.marginPercent < target - thresholds.marginApproachingBand;
  if (hoursAtRisk || costAtRisk || marginAtRisk) return 'AT_RISK';

  // 3. WATCH — burn 75–90% OR margin approaching the target (within the
  //    band below it). A null margin cannot approach anything.
  const hoursWatch = input.hoursBurn !== null && input.hoursBurn >= thresholds.healthyBurnMax;
  const costWatch = input.costBurn !== null && input.costBurn >= thresholds.healthyBurnMax;
  const marginWatch = input.marginPercent !== null
    && input.marginPercent < target
    && input.marginPercent >= target - thresholds.marginApproachingBand;
  if (hoursWatch || costWatch || marginWatch) return 'WATCH';

  // 4. HEALTHY — residual. Null baselines land here: missing data is never
  //    forced into a risk state (§82 discipline).
  return 'HEALTHY';
}

/**
 * §77 — the margin alert. Present exactly when the margin is below target:
 * "Current delivery cost is higher than the project economics support.",
 * with the numbers that make it actionable. Severity follows the verdict the
 * engine just produced (AT_RISK/OVER_BUDGET → CRITICAL; WATCH → WARNING).
 */
export function marginAlertFor(
  input: ProjectHealthEngineInput,
  health: ProjectFinancialHealth,
  thresholds: ProfitabilityHealthThresholds = DEFAULT_PROFITABILITY_HEALTH_THRESHOLDS
): ProjectMarginAlert | null {
  const target = input.targetMargin ?? thresholds.defaultTargetMargin;
  if (input.marginPercent === null || input.marginPercent >= target) return null;
  const severity: ProjectMarginAlert['severity'] =
    health === 'AT_RISK' || health === 'OVER_BUDGET' ? 'CRITICAL' : 'WARNING';
  return {
    severity,
    currentMarginPercent: input.marginPercent,
    targetMarginPercent: target,
    reason: `Current delivery cost is higher than the project economics support: margin is ${input.marginPercent.toFixed(1)}% against a ${target.toFixed(1)}% target`,
  };
}
