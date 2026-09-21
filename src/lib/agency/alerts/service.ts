/**
 * Agency Vertical — Alerts: lifecycle + rule-admin service (Module 15, §19/§24)
 *
 * The ONLY manual-write path for alerts. The evaluator owns detection
 * (evaluator.ts); this service owns the human moves:
 *
 *   acknowledgeAlert   OPEN → ACKNOWLEDGED (§19)
 *   resolveAlert       OPEN/ACKNOWLEDGED → RESOLVED (§19 — terminal; a
 *                      returning condition reopens via the evaluator, never
 *                      via this API)
 *   updateAlertRule    enable/disable + configuration (§24 — admins only,
 *                      gated by agency.alerts.manage at the route)
 *
 * Tenant isolation: a missing alert and another tenant's alert are
 * IDENTICAL (404) — never a leak. Audit: every mutation emits a createLog
 * entry through the caller-supplied audit hook (routes own the session
 * context, the service stays pure over its inputs).
 */
import {
  getAgencyAlertById, updateAgencyAlert,
  getAlertRuleById, updateAlertRule,
} from '@/lib/db';
import type { DomainResult, AuditContext } from '../domain/agency.clients';
import { validateAlertRuleUpdate } from '../validators/alert';
import { canTransitionAlertStatus } from './types';
import type { AgencyAlertRecord, AlertRule } from './types';

const notFound = (): DomainResult<never> =>
  ({ ok: false, status: 404, error: 'Alert not found' });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

const conflict = (error: string): DomainResult<never> =>
  ({ ok: false, status: 409, error });

// ---------- §19 acknowledge ----------

export async function acknowledgeAlert(
  tenantId: string,
  audit: AuditContext,
  alertId: string
): Promise<DomainResult<AgencyAlertRecord>> {
  const alert = await getAgencyAlertById(alertId, tenantId);
  if (!alert) return notFound();
  if (!canTransitionAlertStatus(alert.status, 'ACKNOWLEDGED')) {
    return conflict(`An alert in state ${alert.status} cannot be acknowledged`);
  }
  const now = new Date();
  const applied = await updateAgencyAlert(alertId, tenantId, {
    status: 'ACKNOWLEDGED',
    acknowledgedAt: now,
    acknowledgedBy: audit.username,
  });
  if (!applied) return notFound(); // matchedCount = existence (Module 5 lesson)
  audit.log(
    'ALERT_ACKNOWLEDGED',
    `agency alert ${alertId} (${alert.ruleType} on ${alert.entityType} ${alert.entityId}) acknowledged`
  );
  return {
    ok: true, status: 200,
    data: { ...alert, status: 'ACKNOWLEDGED', acknowledgedAt: now, acknowledgedBy: audit.username },
  };
}

// ---------- §19 resolve ----------

export async function resolveAlert(
  tenantId: string,
  audit: AuditContext,
  alertId: string
): Promise<DomainResult<AgencyAlertRecord>> {
  const alert = await getAgencyAlertById(alertId, tenantId);
  if (!alert) return notFound();
  if (!canTransitionAlertStatus(alert.status, 'RESOLVED')) {
    return conflict(`An alert in state ${alert.status} cannot be resolved`);
  }
  const now = new Date();
  const applied = await updateAgencyAlert(alertId, tenantId, {
    status: 'RESOLVED',
    resolvedAt: now,
    resolvedBy: audit.username,
  });
  if (!applied) return notFound();
  audit.log(
    'ALERT_RESOLVED',
    `agency alert ${alertId} (${alert.ruleType} on ${alert.entityType} ${alert.entityId}) resolved`
  );
  return {
    ok: true, status: 200,
    data: { ...alert, status: 'RESOLVED', resolvedAt: now, resolvedBy: audit.username },
  };
}

// ---------- §24 rule administration ----------

export async function updateAgencyAlertRule(
  tenantId: string,
  audit: AuditContext,
  ruleId: string,
  payload: Record<string, unknown>
): Promise<DomainResult<AlertRule>> {
  const validated = validateAlertRuleUpdate(payload);
  if (!validated.ok) {
    return badRequest(validated.errors.map(e => `${e.field}: ${e.message}`).join('; '));
  }
  const rule = await getAlertRuleById(ruleId, tenantId);
  if (!rule) return notFound();

  const applied = await updateAlertRule(ruleId, tenantId, validated.value);
  if (!applied) return notFound();

  // §24 audit — the BEFORE and AFTER configuration, so a rule change is
  // always reconstructable from the log.
  audit.log(
    'ALERT_RULE_UPDATED',
    `agency alert rule ${ruleId} (${rule.type}): enabled ${rule.enabled} → `
      + `${validated.value.enabled ?? rule.enabled}, configuration `
      + `${JSON.stringify(rule.configuration)} → ${JSON.stringify(validated.value.configuration ?? rule.configuration)}`
  );

  const updated = await getAlertRuleById(ruleId, tenantId);
  return { ok: true, status: 200, data: updated ?? rule };
}
