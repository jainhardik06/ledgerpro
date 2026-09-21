/**
 * Agency Vertical — Types: metric value types (Step 0.9)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * The value primitives of the metric contract. They encode the semantics from
 * docs/agency/phase-1/01-financial-definitions.md §0:
 *   - Money/Hours are non-negative magnitudes, rounded only at presentation.
 *   - Percentages are null when undefined by division (never 0, never NaN).
 *   - All metrics are computed over the session tenant's scope.
 *
 * `sourceReady: false` marks metrics whose source entities do not exist yet
 * (Module 1 zero-value contract, §13) so the UI can distinguish "genuinely 0"
 * from "not yet wired".
 */

/** A monetary magnitude (tenant currency). Non-negative — except gross
 * profit, which uses signedMoney (a loss is a real number, §5). */
export interface MoneyMetric {
  readonly kind: 'money';
  readonly value: number;
  /** False while the source entity for this metric is not yet implemented. */
  readonly sourceReady: boolean;
}

/** An integer count (projects, invoices, …). */
export interface CountMetric {
  readonly kind: 'count';
  readonly value: number;
  readonly sourceReady: boolean;
}

/** A duration in decimal hours. Non-negative. */
export interface HoursMetric {
  readonly kind: 'hours';
  readonly value: number;
  readonly sourceReady: boolean;
}

/**
 * A percentage. `value` is null when undefined by division (e.g. margin with
 * Revenue = 0) — the UI renders "—" and MUST NOT coerce null to 0.
 */
export interface PercentageMetric {
  readonly kind: 'percentage';
  readonly value: number | null;
  readonly sourceReady: boolean;
}

/** Constructors — canonical way to build metrics (keeps `kind` consistent). */

export function money(value: number, sourceReady = true): MoneyMetric {
  return { kind: 'money', value: Math.max(0, value), sourceReady };
}

/**
 * A money metric that may legitimately be NEGATIVE — gross profit (§5): a
 * loss (revenue < delivery cost) is a real number and is never clamped to a
 * fake 0 (Module 13 §84 — deterministic, explainable, honest). Every other
 * money metric stays a non-negative magnitude via money().
 */
export function signedMoney(value: number, sourceReady = true): MoneyMetric {
  return { kind: 'money', value, sourceReady };
}

export function count(value: number, sourceReady = true): CountMetric {
  return { kind: 'count', value: Math.max(0, Math.round(value)), sourceReady };
}

export function hours(value: number, sourceReady = true): HoursMetric {
  return { kind: 'hours', value: Math.max(0, value), sourceReady };
}

export function percentage(value: number | null, sourceReady = true): PercentageMetric {
  return { kind: 'percentage', value: value === null ? null : value, sourceReady };
}

/** Not-yet-implemented shortcuts for the Module 1 zero-value contract. */
export const zeroMoney = (): MoneyMetric => ({ kind: 'money', value: 0, sourceReady: false });
export const zeroCount = (): CountMetric => ({ kind: 'count', value: 0, sourceReady: false });
export const zeroHours = (): HoursMetric => ({ kind: 'hours', value: 0, sourceReady: false });
export const zeroPercentage = (): PercentageMetric => ({ kind: 'percentage', value: null, sourceReady: false });
