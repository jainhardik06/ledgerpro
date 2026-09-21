/**
 * Agency Vertical — Alerts: dedupe / upsert planner (Module 15, §6/§19/§20)
 *
 * CLIENT-SAFE: a PURE decision function. It takes the current stored
 * record (if any) and this evaluation's candidate detection (if any) and
 * decides the single database write to perform — nothing else. The
 * evaluator (server) executes the plan; this file never touches storage.
 *
 * Decision matrix (§6):
 *   existing | condition | plan
 *   ---------+-----------+---------------------------------------------
 *   none     | present   | CREATE       — first detection → OPEN
 *   none     | absent    | NONE
 *   OPEN/ACK | present   | UPDATE       — refresh fields, KEEP status/
 *                                         triggeredAt/ack (no re-notify)
 *   OPEN/ACK | absent    | AUTO_RESOLVE — condition disappeared; resolved
 *                                         with NO actor (system write)
 *   RESOLVED | present   | REOPEN       — condition returned → a NEW OPEN
 *                                         cycle (triggeredAt reset, ack/
 *                                         resolve cleared)
 *   RESOLVED | absent    | NONE         — stays resolved, untouched
 *
 * Fingerprint (§6) ties the candidate to the stored record:
 * tenantId:ruleType:entityType:entityId — indexed unique, so two concurrent
 * evaluations collide at the database and the loser's create is rejected
 * (11000) and skipped: re-evaluation never stacks duplicates.
 */
import type {
  AlertEntityType, AlertRuleType, AlertSeverity, AlertStatus,
  AgencyAlertRecord, AgencyAlertRecordCreateInput, AgencyAlertRecordUpdate,
} from './types';
import { buildFingerprint } from './rules';

/**
 * One detection from this evaluation pass: the generators' output. All
 * fields are refreshable on UPDATE/REOPEN; status lifecycle fields are NOT
 * here (the planner owns those transitions).
 */
export interface AlertCandidate {
  ruleType: AlertRuleType;
  entityType: AlertEntityType;
  entityId: string;
  entityLabel?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  clientId?: string;
  projectId?: string;
  invoiceId?: string;
  value?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
}

/** The single write the evaluator must perform for one fingerprint. */
export type AlertWritePlan =
  | { action: 'NONE' }
  | { action: 'CREATE'; fingerprint: string; record: AgencyAlertRecordCreateInput }
  | { action: 'UPDATE'; fingerprint: string; id: string; changes: AgencyAlertRecordUpdate }
  | {
      action: 'REOPEN';
      fingerprint: string;
      id: string;
      /** Full field set of the new OPEN cycle (status/ack/resolve cleared). */
      record: AgencyAlertRecordCreateInput;
    }
  | { action: 'AUTO_RESOLVE'; fingerprint: string; id: string };

/** The refreshable fields shared by UPDATE and REOPEN writes. */
function refreshable(candidate: AlertCandidate): AgencyAlertRecordUpdate {
  return {
    severity: candidate.severity,
    title: candidate.title,
    message: candidate.message,
    ...(candidate.entityLabel !== undefined && { entityLabel: candidate.entityLabel }),
    ...(candidate.clientId !== undefined && { clientId: candidate.clientId }),
    ...(candidate.projectId !== undefined && { projectId: candidate.projectId }),
    ...(candidate.invoiceId !== undefined && { invoiceId: candidate.invoiceId }),
    ...(candidate.value !== undefined && { value: candidate.value }),
    ...(candidate.threshold !== undefined && { threshold: candidate.threshold }),
    ...(candidate.metadata !== undefined && { metadata: candidate.metadata }),
  };
}

/** The full body of a first detection (CREATE) or a new cycle (REOPEN). */
function cycleRecord(
  tenantId: string,
  candidate: AlertCandidate,
  fingerprint: string,
  now: Date
): AgencyAlertRecordCreateInput {
  return {
    tenantId,
    ruleType: candidate.ruleType,
    severity: candidate.severity,
    title: candidate.title,
    message: candidate.message,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    ...(candidate.entityLabel !== undefined && { entityLabel: candidate.entityLabel }),
    ...(candidate.clientId !== undefined && { clientId: candidate.clientId }),
    ...(candidate.projectId !== undefined && { projectId: candidate.projectId }),
    ...(candidate.invoiceId !== undefined && { invoiceId: candidate.invoiceId }),
    status: 'OPEN' as AlertStatus,
    ...(candidate.value !== undefined && { value: candidate.value }),
    ...(candidate.threshold !== undefined && { threshold: candidate.threshold }),
    ...(candidate.metadata !== undefined && { metadata: candidate.metadata }),
    fingerprint,
    triggeredAt: now,
  };
}

/**
 * Pure planner. `existing` is the stored record for this fingerprint (the
 * evaluator's repo lookup); `candidate` is this pass's detection (undefined
 * = the condition no longer holds). `now` is the evaluation timestamp.
 */
export function planAlertWrite(
  tenantId: string,
  candidate: AlertCandidate | undefined,
  existing: Pick<
    AgencyAlertRecord,
    'id' | 'status' | 'fingerprint' | 'ruleType' | 'entityType' | 'entityId'
  > | undefined,
  now: Date
): AlertWritePlan {
  // Condition absent: only an unresolved record needs auto-resolution.
  if (!candidate) {
    if (!existing) return { action: 'NONE' };
    if (existing.status === 'RESOLVED') return { action: 'NONE' };
    return { action: 'AUTO_RESOLVE', fingerprint: existing.fingerprint, id: existing.id };
  }

  const fingerprint = buildFingerprint(tenantId, candidate.ruleType, candidate.entityType, candidate.entityId);

  // No stored record: first detection.
  if (!existing) {
    return { action: 'CREATE', fingerprint, record: cycleRecord(tenantId, candidate, fingerprint, now) };
  }

  // Condition present on a resolved record: a NEW open cycle (§6). The
  // fingerprint is reused (same logical alert), ack/resolve are cleared,
  // triggeredAt resets — this is a fresh detection, not a revival.
  if (existing.status === 'RESOLVED') {
    return {
      action: 'REOPEN',
      fingerprint,
      id: existing.id,
      record: cycleRecord(tenantId, candidate, fingerprint, now),
    };
  }

  // Condition still present on an unresolved record: refresh the payload,
  // keep status/triggeredAt/ack — a continuing condition is not a new
  // notification (§20 noise discipline).
  return { action: 'UPDATE', fingerprint, id: existing.id, changes: refreshable(candidate) };
}

/** Summary counts for telemetry/evaluator response. */
export interface AlertWritePlanTally {
  created: number;
  updated: number;
  reopened: number;
  autoResolved: number;
}

export function tallyPlans(plans: readonly AlertWritePlan[]): AlertWritePlanTally {
  const tally: AlertWritePlanTally = { created: 0, updated: 0, reopened: 0, autoResolved: 0 };
  for (const plan of plans) {
    if (plan.action === 'CREATE') tally.created += 1;
    else if (plan.action === 'UPDATE') tally.updated += 1;
    else if (plan.action === 'REOPEN') tally.reopened += 1;
    else if (plan.action === 'AUTO_RESOLVE') tally.autoResolved += 1;
  }
  return tally;
}
