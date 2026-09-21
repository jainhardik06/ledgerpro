/**
 * Agency Vertical — Alerts: evaluation engine (Module 15, §20/§21/§22)
 *
 * SERVER-ONLY (db access). The one place a tenant's alerts are recomputed:
 *
 *   ensureDefaultAlertRules   lazy seeding — every catalog rule exists as a
 *                             row before the first evaluation (§4; race-safe
 *                             via the unique {tenantId, type} index)
 *   evaluateTenantAlerts      the snapshot pass — consume the M13/M14
 *                             engines, generate candidates, and reconcile
 *                             them against the stored records through the
 *                             PURE dedupe planner (dedupe.ts)
 *   getAlertsSummary          read-only counts + top rows (§22) — never
 *                             evaluates (§21: the dashboard stays read-only)
 *
 * §21 evaluation strategy: snapshot evaluation on demand — the summary
 * endpoint evaluates then reports; the explicit admin endpoint evaluates;
 * nothing is cron-dependent and the dashboard route never doubles the
 * portfolio query.
 *
 * Failure discipline: a source query that throws fails the WHOLE pass
 * (fail closed — never a partially-evaluated alert store); an individual
 * WRITE that fails is telemetry'd and skipped so one bad row cannot abort
 * the pass. A duplicate-key (11000) on create is not a failure at all —
 * a concurrent evaluation won the fingerprint (§6).
 */
import {
  getAlertRules, createAlertRule, listAgencyAlerts,
  createAgencyAlert, updateAgencyAlert, getProjects, getTenantById,
  type AgencyAlertRecordChanges,
} from '@/lib/db';
import { getPortfolioProfitability } from '../profitability';
import {
  getProjectTimeAggregates, getProjectExpenseAggregates,
} from '../queries/profitability-metrics';
import { getReceivablesMetrics } from '../queries/receivables-summary';
import { trackNamedOperation, trackNamedFailure } from '../analytics/observability';
import { todayInTimezone } from '../types/dates';
import { agencyTimezone } from '../domain/agency.settings';
import { ALERT_RULE_TYPES, type AlertRuleType } from './types';
import type {
  AlertSeverity, AlertSummary, AgencyAlertRecord, AgencyAlertRecordCreateInput,
} from './types';
import { ALERT_RULE_CATALOG, buildFingerprint, isCostBearingRuleType } from './rules';
import { countBySeverity, SEVERITY_ORDER } from './severity';
import { generateAlertCandidates } from './generators';
import { planAlertWrite, type AlertCandidate, type AlertWritePlan } from './dedupe';

/** §6 — the fingerprint for a candidate (single definition of the join key). */
function fingerprintOf(tenantId: string, candidate: AlertCandidate): string {
  return buildFingerprint(tenantId, candidate.ruleType, candidate.entityType, candidate.entityId);
}

/**
 * §4 — lazy default seeding: one row per catalog rule, enabled, with the
 * catalog's default configuration. Idempotent and race-safe: the unique
 * {tenantId, type} index rejects the loser of a concurrent seed, and a
 * 11000 here simply means the rule already exists — skipped, never fatal.
 */
export async function ensureDefaultAlertRules(tenantId: string): Promise<void> {
  const existing = await getAlertRules(tenantId);
  const existingTypes = new Set(existing.map(r => r.type));
  const missing = ALERT_RULE_TYPES.filter(t => !existingTypes.has(t as AlertRuleType));
  if (missing.length === 0) return;
  await Promise.all(missing.map(async type => {
    try {
      await createAlertRule(tenantId, {
        type,
        enabled: true,
        configuration: { ...ALERT_RULE_CATALOG[type].defaults },
      });
    } catch {
      // 11000 (or the local unique mirror): a concurrent request seeded it.
    }
  }));
}

/** The §20 pass result — telemetry context and the API response body. */
export interface AlertEvaluationResult {
  created: number;
  updated: number;
  reopened: number;
  autoResolved: number;
  /** Open + acknowledged records after the pass. */
  totalActive: number;
}

/**
 * The §6/§19/§20 changes of a REOPEN: the full new-cycle payload with the
 * ack/resolve lifecycle explicitly CLEARED (undefined → $unset in the
 * repo) — a returned condition is a fresh detection, not a revival.
 */
function cycleChanges(record: AgencyAlertRecordCreateInput): AgencyAlertRecordChanges {
  return {
    severity: record.severity,
    title: record.title,
    message: record.message,
    entityLabel: record.entityLabel,   // undefined = clear (repo $unset)
    clientId: record.clientId,         // undefined = clear (repo $unset)
    projectId: record.projectId,
    invoiceId: record.invoiceId,
    value: record.value,
    threshold: record.threshold,
    metadata: record.metadata,
    status: 'OPEN',
    triggeredAt: record.triggeredAt,
    acknowledgedAt: undefined,
    acknowledgedBy: undefined,
    resolvedAt: undefined,
    resolvedBy: undefined,
  };
}

/**
 * §20/§21 — the evaluation pass. Deterministic given the stores and
 * `today`: generate candidates from the engines, plan every write through
 * the pure dedupe planner, execute the plans, and report what happened.
 * Wrapped in agency_alerts_evaluation_duration telemetry; a source failure
 * is telemetry'd as agency_alert_evaluation_failure and RETHROWN (fail
 * closed — the route surfaces a 500, the alert store is never partially
 * recomputed).
 */
export async function evaluateTenantAlerts(
  tenantId: string,
  now: Date = new Date()
): Promise<AlertEvaluationResult> {
  // Business "today" (tenant timezone, dates.ts rulebook) drives due-date
  // math; `now` is only the write timestamp (triggeredAt/resolvedAt).
  // Module 17 §44 — the tenant's CONFIGURED timezone (stored ⊕ defaults).
  const tenant = await getTenantById(tenantId);
  const businessToday = todayInTimezone(agencyTimezone(tenant));
  return trackNamedOperation(
    'agency_alerts_evaluation_duration', tenantId, { query: 'evaluateTenantAlerts' },
    async () => {
      try {
        // ---- sources (§90: consume the engines, never recompute) ----
        await ensureDefaultAlertRules(tenantId);
        const [rules, projects, portfolio] = await Promise.all([
          getAlertRules(tenantId),
          getProjects(tenantId, { page: 1, limit: 1000 }),
          getPortfolioProfitability(tenantId),
        ]);
        const scope = projects.map(p => p.id);
        const [timeMap, expenseMap] = scope.length === 0
          ? [new Map(), new Map()]
          : await Promise.all([
              getProjectTimeAggregates(tenantId, scope),
              getProjectExpenseAggregates(tenantId, scope),
            ]);
        const receivables = await getReceivablesMetrics(tenantId, businessToday);

        const candidates = generateAlertCandidates({
          today: businessToday,
          rules,
          projects,
          portfolio: portfolio.projects,
          timeAggregates: timeMap,
          expenseAggregates: expenseMap,
          receivableInvoices: receivables.invoices,
        });

        // ---- plan (pure): candidates against the stored records ----
        const stored = await listAgencyAlerts(tenantId, { limit: 5000 });
        const storedByFingerprint = new Map(stored.map(a => [a.fingerprint, a]));
        const plans: AlertWritePlan[] = candidates.map(candidate =>
          planAlertWrite(tenantId, candidate, storedByFingerprint.get(fingerprintOf(tenantId, candidate)), now)
        );
        // Stored records with NO candidate this pass: the condition is gone
        // (or the rule is disabled — a disabled rule generates nothing, so
        // its open alerts auto-resolve; §19: disable = silence).
        const candidateFingerprints = new Set(candidates.map(c => fingerprintOf(tenantId, c)));
        for (const record of stored) {
          if (!candidateFingerprints.has(record.fingerprint)) {
            plans.push(planAlertWrite(tenantId, undefined, record, now));
          }
        }

        // ---- execute ----
        const result: AlertEvaluationResult = {
          created: 0, updated: 0, reopened: 0, autoResolved: 0, totalActive: 0,
        };
        for (const plan of plans) {
          try {
            if (plan.action === 'CREATE') {
              await createAgencyAlert(tenantId, plan.record);
              result.created += 1;
            } else if (plan.action === 'UPDATE') {
              await updateAgencyAlert(plan.id, tenantId, plan.changes);
              result.updated += 1;
            } else if (plan.action === 'REOPEN') {
              await updateAgencyAlert(plan.id, tenantId, cycleChanges(plan.record));
              result.reopened += 1;
            } else if (plan.action === 'AUTO_RESOLVE') {
              // §19 — no actor: the condition disappeared, the system closes.
              await updateAgencyAlert(plan.id, tenantId, {
                status: 'RESOLVED',
                resolvedAt: now,
                resolvedBy: undefined, // cleared — auto-resolution has no actor
              });
              result.autoResolved += 1;
            }
          } catch (e) {
            // §6 — a concurrent evaluation won this fingerprint's create:
            // not a failure, just skip.
            if ((e as { code?: number }).code === 11000) continue;
            // One failed write must not abort the pass — telemetry, skip.
            trackNamedFailure(
              'agency_alert_evaluation_failure', tenantId, 'write_failed',
              { query: plan.action }
            );
          }
        }

        const activeBefore = stored.filter(a => a.status !== 'RESOLVED').length;
        result.totalActive = activeBefore + result.created + result.reopened - result.autoResolved;
        return result;
      } catch (e) {
        // Fail closed: a source query failed — the whole pass is invalid.
        trackNamedFailure(
          'agency_alert_evaluation_failure', tenantId, 'source_failed',
          { query: 'evaluateTenantAlerts' }
        );
        throw e;
      }
    }
  );
}

/**
 * §22 — read-only summary over the STORED alerts: counts + top unresolved
 * rows, severity-ranked. NEVER evaluates (§21 — evaluation lives in the
 * summary API route and the admin evaluate endpoint, so the dashboard
 * route can call this without doubling the portfolio query).
 *
 * §114 privacy: counts always include cost-bearing alerts (a count leaks
 * no cost); `top` rows are filtered for sessions without
 * agency.profitability.read.
 */
export async function getAlertsSummary(
  tenantId: string,
  options: { maySeeCost?: boolean; topLimit?: number } = {}
): Promise<AlertSummary> {
  const { maySeeCost = false, topLimit = 5 } = options;
  const stored = await listAgencyAlerts(tenantId, { limit: 5000 });

  const open = stored.filter(a => a.status === 'OPEN');
  const acknowledged = stored.filter(a => a.status === 'ACKNOWLEDGED');
  const resolved = stored.filter(a => a.status === 'RESOLVED');

  const top = [...open, ...acknowledged]
    .filter(a => maySeeCost || !isCostBearingRuleType(a.ruleType))
    .sort((a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
      || new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    )
    .slice(0, topLimit);

  return {
    counts: {
      open: open.length,
      acknowledged: acknowledged.length,
      resolved: resolved.length,
      openBySeverity: countBySeverity(open as Array<{ severity: AlertSeverity }>),
    },
    top,
  };
}

/** Convenience re-export for routes that need the record shape. */
export type { AgencyAlertRecord };
