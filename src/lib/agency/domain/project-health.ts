/**
 * Agency Vertical — Domain: project health calculation (Module 1.8)
 *
 * Deterministic rules engine — NO AI (PRD §51). Given a project's
 * budget burn and margin vs target, it assigns exactly one health status.
 *
 * Rule table (Module 1.8 initial thresholds; configurable later — see
 * `ProjectHealthThresholds` and DEFAULT_HEALTH_THRESHOLDS below):
 *
 *   COMPLETED   project explicitly completed — takes precedence, no math
 *   OVER_BUDGET burn > 100% of budget
 *   AT_RISK     burn > 90%  OR  margin below target floor
 *   WATCH       burn in [75%, 90%]  OR  margin approaching target floor
 *   HEALTHY     burn < 75%  AND  margin >= target
 *
 * Evaluation is EXCLUSIVE: exactly one status wins, in the priority order
 * above (problems outrank successes). Every rule is deterministic on
 * numeric inputs — the same inputs always yield the same status.
 *
 * Null handling (definitions §6, §8): a project with no baseline
 * (margin null because Revenue = 0, or burn null because PlannedHours = 0)
 * cannot satisfy the numeric branch — it falls to the default HEALTHY
 * path only when nothing worse applies. It is NEVER forced into a
 * risk state by missing data (zero ≠ unavailable ≠ risk).
 */

import type { ProjectHealthStatus } from '../types/agency.dashboard';

/**
 * Configurable thresholds (Module 1.8: "exact thresholds must be
 * configurable later"). The shape is the configuration surface — values
 * start as module defaults and can later be seeded per-tenant without
 * touching the engine.
 */
export interface ProjectHealthThresholds {
  /** Budget-burn ratio at/below which a project is comfortably on track. */
  readonly healthyBurnMax: number;      // default 0.75
  /** Budget-burn ratio above which the project is AT_RISK. */
  readonly riskBurnOver: number;        // default 0.90
  /** Budget-burn ratio at/above 100% → OVER_BUDGET. */
  readonly budgetBurnLimit: number;     // default 1.00
  /** Target margin (0–1); at/above → healthy margin condition. */
  readonly marginTarget: number;        // default 0.40
  /** Margin at/below this floor → AT_RISK (margin below threshold). */
  readonly marginRiskFloor: number;     // default 0.15
  /** Margin approaching the target floor (below target) → WATCH. */
  readonly marginWatchFloor: number;    // default 0.25
}

/** Module 1.8 initial values — exact thresholds, deterministic. */
export const DEFAULT_HEALTH_THRESHOLDS: ProjectHealthThresholds = {
  healthyBurnMax: 0.75,
  riskBurnOver: 0.90,
  budgetBurnLimit: 1.00,
  marginTarget: 0.40,
  marginRiskFloor: 0.15,
  marginWatchFloor: 0.25,
};

/**
 * Inputs for one project's health calculation. All numeric inputs are
 * already-resolved domain values (definitions §1–§8) — this engine does
 * not fetch or recompute them.
 */
export interface ProjectHealthInput {
  /** Budget burn ratio (hours or cost consumed vs budget) — null when no budget baseline. */
  readonly budgetBurn: number | null;
  /** Margin (0–1) — null when Revenue = 0 (definitions §6). */
  readonly margin: number | null;
  /** Explicit completion flag — COMPLETED outranks all numeric rules. */
  readonly completed: boolean;
}

/**
 * Deterministic project health status (Module 1.8).
 * Exactly one status; priority: COMPLETED > OVER_BUDGET > AT_RISK > WATCH > HEALTHY.
 */
export function computeProjectHealth(
  input: ProjectHealthInput,
  thresholds: ProjectHealthThresholds = DEFAULT_HEALTH_THRESHOLDS
): ProjectHealthStatus {
  // 1. Completion is a lifecycle fact, not a performance verdict — it takes
  //    precedence over every numeric rule.
  if (input.completed) return 'COMPLETED';

  // 2. OVER_BUDGET — burn > 100% of budget.
  if (input.budgetBurn !== null && input.budgetBurn > thresholds.budgetBurnLimit) {
    return 'OVER_BUDGET';
  }

  // 3. AT_RISK — burn > 90% OR margin below risk floor.
  const burnAtRisk = input.budgetBurn !== null && input.budgetBurn > thresholds.riskBurnOver;
  const marginAtRisk = input.margin !== null && input.margin <= thresholds.marginRiskFloor;
  if (burnAtRisk || marginAtRisk) return 'AT_RISK';

  // 4. WATCH — burn in [75%, 90%] OR margin approaching the target floor.
  const burnWatch =
    input.budgetBurn !== null && input.budgetBurn >= thresholds.healthyBurnMax;
  const marginWatch = input.margin !== null && input.margin < thresholds.marginWatchFloor;
  if (burnWatch || marginWatch) return 'WATCH';

  // 5. HEALTHY — burn < 75% AND margin >= target. Null baselines cannot
  //    satisfy either branch, so they land here as the residual default.
  return 'HEALTHY';
}

/**
 * Display-order rank for the portfolio table (Module 1.7: "problems
 * before successes" — At Risk → Watch → Healthy). OVER_BUDGET sorts with
 * the problems (ahead of At Risk — the most severe first); COMPLETED
 * sorts last.
 */
export const HEALTH_DISPLAY_ORDER: Readonly<Record<ProjectHealthStatus, number>> = {
  OVER_BUDGET: 0,
  AT_RISK: 1,
  WATCH: 2,
  HEALTHY: 3,
  COMPLETED: 4,
};

/** Sort rows problems-first (Module 1.7 default sort). */
export function sortProjectsByHealth<T extends { status: ProjectHealthStatus }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort(
    (a, b) => HEALTH_DISPLAY_ORDER[a.status] - HEALTH_DISPLAY_ORDER[b.status]
  );
}
