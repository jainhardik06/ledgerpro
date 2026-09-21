/**
 * Agency Vertical — Observability contract (Step 0.15)
 *
 * Diagnostic instrumentation for agency analytics. EXTENDS the existing
 * platform telemetry — src/lib/logger.ts (logError), src/lib/posthog-server.ts
 * (PostHog), and /api/status — with nothing replaced.
 *
 * Tracked operations (names fixed by the Step 0.15 contract):
 *   agency_dashboard_query_duration   — timing of dashboard query service calls
 *   agency_dashboard_query_error      — failures in the query/aggregation layer
 *   agency_metric_calculation_error   — formula failures (NaN, bad shape) in analytics
 *
 * Modules 11–14 (§116) — the money-path observability additions:
 *   agency_tax_calculation_duration       — Module 11: invoice tax computation
 *   agency_invoice_finalize_duration      — Module 11: validate → number → issue
 *   agency_razorpay_api_duration          — Module 12: every Razorpay network edge
 *   agency_razorpay_webhook_failure       — Module 12: webhook processing failures
 *   agency_payment_reconciliation_failure — Module 12: §49/§50 reconciliation rejections
 *   agency_profitability_query_duration   — Module 13: portfolio/project reports
 *   agency_receivables_query_duration     — Module 14: the A/R engine's reads
 *
 * Rules:
 *   - Durations log on success AND failure; errors always carry the operation
 *     and (safe) context — never raw entity payloads, never secrets.
 *   - All logging is fire-and-forget: telemetry must never break the request.
 *   - Context includes tenantId (tenant-scoped diagnostics) but no amounts,
 *     usernames, or personal data beyond the acting session id.
 */
import { logError } from '@/lib/logger';

export type AgencyTelemetryOperation =
  | 'agency_dashboard_query_duration'
  | 'agency_dashboard_query_error'
  | 'agency_metric_calculation_error'
  // Modules 11–14 (§116) — the money-path operations.
  | 'agency_tax_calculation_duration'
  | 'agency_invoice_finalize_duration'
  | 'agency_razorpay_api_duration'
  | 'agency_razorpay_webhook_failure'
  | 'agency_payment_reconciliation_failure'
  | 'agency_profitability_query_duration'
  | 'agency_receivables_query_duration'
  // Module 15 (§116 pattern) — the alert engine's evaluation pass.
  | 'agency_alerts_evaluation_duration'
  | 'agency_alert_evaluation_failure'
  // Module 16 (§116 pattern) — the report query layer's generation pass.
  | 'agency_reports_query_duration';

export interface AgencyTelemetryContext {
  tenantId: string;
  [key: string]: unknown;
}

/** The contract's safe context keys — anything else must be whitelisted here. */
const SAFE_KEYS = new Set([
  'tenantId', 'operation', 'query', 'metric', 'durationMs', 'durationBucket',
  'section', 'errorCode',
  // Module 1.25 performance phases (all in ms)
  'authMs', 'queryMs', 'totalMs', 'targetMet',
  // Modules 11–14 (§116) — money-path context keys (ids/labels, never amounts)
  'edge', 'provider', 'eventType', 'outcome', 'reason',
]);

/**
 * Module 1.25 — Dashboard performance target: the initial dashboard response
 * must complete in < 1 second under normal production conditions for a
 * small-to-medium tenant. MEASURED, not assumed: every response carries its
 * phase timings (auth / query / total) via the Server-Timing header and the
 * telemetry stream; a breach logs a dedicated line so the target is
 * verifiable in production data.
 */
export const DASHBOARD_PERFORMANCE_TARGET_MS = 1000;

/** Classify a measured duration for telemetry (bucketed, no per-request noise). */
export function durationBucket(ms: number): string {
  if (ms < 100) return '0-100ms';
  if (ms < 250) return '100-250ms';
  if (ms < 500) return '250-500ms';
  if (ms < 1000) return '500ms-1s';
  if (ms < 2500) return '1-2.5s';
  return '2.5s+';
}

function sanitize(context: AgencyTelemetryContext): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (SAFE_KEYS.has(k)) safe[k] = typeof v === 'object' ? '[object]' : v;
  }
  return safe;
}

/**
 * Wrap an agency operation with duration + error telemetry.
 *
 *   const data = await trackAgencyOperation(
 *     'getAgencyDashboard', ctx.tenantId, { query: 'dashboard' },
 *     () => getAgencyDashboard()
 *   );
 *
 * Durations go to console (structured, like logger.ts) — visible in the
 * existing log stream that /api/status observability reads. PostHog capture
 * is left to the API route layer (it owns the PostHog client and distinct
 * ids), keeping this module client-safe-compatible.
 */
export async function trackAgencyOperation<T>(
  operation: string,
  tenantId: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    report(operation, 'agency_dashboard_query_duration', { ...context, durationMs: Date.now() - start }, undefined, tenantId);
    return result;
  } catch (error) {
    report(operation, 'agency_dashboard_query_error', { ...context, durationMs: Date.now() - start }, error, tenantId);
    throw error;
  }
}

/**
 * Metric-calculation failure telemetry (analytics layer). Called wherever a
 * formula can produce NaN/Infinity/bad shapes — with the metric name.
 */
export function trackMetricCalculationError(metric: string, tenantId: string, error: unknown, context: Record<string, unknown> = {}): void {
  report(metric, 'agency_metric_calculation_error', context, error, tenantId);
}

/**
 * Modules 11–14 (§116) — wrap a money-path operation whose duration is
 * reported under its OWN named operation (unlike trackAgencyOperation, which
 * always reports under the dashboard query names):
 *
 *   const taxed = await trackNamedOperation(
 *     'agency_tax_calculation_duration', tenantId, { query: 'taxation' },
 *     () => setInvoiceTaxation(...)
 *   );
 *
 * Same rules: durations on success AND failure; the error path rethrows after
 * reporting; telemetry never breaks the request.
 */
export async function trackNamedOperation<T>(
  operation: AgencyTelemetryOperation,
  tenantId: string,
  context: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    report(operation, operation, { ...context, durationMs: Date.now() - start }, undefined, tenantId);
    return result;
  } catch (error) {
    report(operation, operation, { ...context, durationMs: Date.now() - start }, error, tenantId);
    throw error;
  }
}

/**
 * Modules 11–14 (§116) — a named FAILURE event (a counter, not a duration):
 * razorpay_webhook_failure / payment_reconciliation_failure. Fire-and-forget;
 * never throws.
 */
export function trackNamedFailure(
  operation: AgencyTelemetryOperation,
  tenantId: string,
  reason: string,
  context: Record<string, unknown> = {}
): void {
  try {
    report(reason, operation, { ...context, reason, outcome: operation }, undefined, tenantId);
  } catch {
    // Telemetry must never break the caller.
  }
}

// ---------- internal: structured console events (logger.ts style) ----------

function report(
  subject: string,
  op: AgencyTelemetryOperation,
  context: Record<string, unknown>,
  error: unknown | undefined,
  tenantId: string
): void {
  const safe = sanitize({ ...context, tenantId, operation: op, [op.includes('duration') ? 'query' : 'metric']: subject });
  if (error !== undefined) {
    logError(`agency:${op}`, error, safe);
  } else {
    // Structured info line matching the platform's JSON log format.
    console.log(JSON.stringify({
      level: 'info',
      message: `agency:${op}`,
      ...safe,
      timestamp: new Date().toISOString(),
    }));
  }
}
