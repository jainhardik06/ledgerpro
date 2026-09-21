/**
 * Agency Vertical — Alerts: severity resolution (Module 15, §7)
 *
 * CLIENT-SAFE: pure functions only.
 *
 * Severity is a SERVER-OWNED property (§7). Three inputs, in priority
 * order:
 *   1. Tenant rule override (configuration.severity) — still resolved
 *      here, server-side; the frontend only ever READS severity.
 *   2. The engine's own escalation when it has one (PROJECT_MARGIN_BELOW_
 *      TARGET may be raised to CRITICAL by projectHealth's marginAlert
 *      when the project is AT_RISK/OVER_BUDGET).
 *   3. The catalog default (rules.ts).
 */
import type { AlertRule, AlertSeverity } from './types';
import { ALERT_RULE_CATALOG } from './rules';

/** Sort/display order — INFO < WARNING < CRITICAL. Used for UI ranking and tests. */
export const SEVERITY_ORDER: Readonly<Record<AlertSeverity, number>> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
};

/** The higher of two severities (never down-scales an engine escalation). */
export function maxSeverity(a: AlertSeverity, b: AlertSeverity): AlertSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

/**
 * Resolve the severity for a detection.
 *
 * @param rule            the tenant's stored rule (override may live in rule.configuration.severity)
 * @param engineSeverity  the engine's own severity for this detection, when
 *                        it has one (margin escalation); otherwise undefined.
 *                        An override can only RAISE above the catalog
 *                        default — it never silences an engine CRITICAL.
 */
export function resolveSeverity(
  rule: Pick<AlertRule, 'type' | 'configuration'>,
  engineSeverity?: AlertSeverity
): AlertSeverity {
  const catalog = ALERT_RULE_CATALOG[rule.type];
  const override = rule.configuration.severity;
  if (override) {
    // Override wins, but an engine CRITICAL is never down-scaled (§7 — the
    // engine knows the project's actual risk posture).
    if (engineSeverity === 'CRITICAL') return 'CRITICAL';
    return maxSeverity(override, catalog.defaultSeverity);
  }
  if (engineSeverity) return engineSeverity;
  return catalog.defaultSeverity;
}

/**
 * Count records per severity. Used by the summary endpoint and the Command
 * Center — §114 note: counts of cost-bearing alerts are SAFE to show to
 * sessions without agency.profitability.read; only the rows are filtered.
 */
export function countBySeverity(
  records: readonly { severity: AlertSeverity }[]
): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = { INFO: 0, WARNING: 0, CRITICAL: 0 };
  for (const record of records) counts[record.severity] += 1;
  return counts;
}
