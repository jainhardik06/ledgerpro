/**
 * Agency Vertical — Alerts: types (Module 15, §4/§5/§7/§19)
 *
 * CLIENT-SAFE: types and pure functions only. No server imports.
 *
 * Module 15 converts the financial/operational intelligence of Modules 7–14
 * into deterministic warnings (§2). Two entities:
 *
 *   AlertRule           WHAT should be detected (tenant configuration)
 *   AgencyAlertRecord   WHAT was actually detected (§5 — the spec's
 *                       "AgencyAlert"; renamed Record to stay distinct from
 *                       the Module 1 dashboard VIEW type of the same name in
 *                       types/agency.dashboard.ts)
 *
 * Rules describe detection; records describe detections. Severity is owned
 * by the domain engine (§7) — no frontend screen invents it. Alerts are
 * never deleted (§19): OPEN → ACKNOWLEDGED → RESOLVED, with deterministic
 * auto-resolution when the condition disappears.
 */

// ---------- rule types (§4) ----------

/**
 * §4 — the deterministic rule catalog. Hours bands are MUTUALLY EXCLUSIVE
 * (a project at 82% fires ONLY PROJECT_HOURS_80, never 75): each band is a
 * separate rule type with a separate fingerprint, so band transitions
 * auto-resolve the old alert and open the new one (§19).
 */
export type AlertRuleType =
  | 'PROJECT_HOURS_75'
  | 'PROJECT_HOURS_80'
  | 'PROJECT_HOURS_100'
  | 'PROJECT_OVER_BUDGET'
  | 'PROJECT_MARGIN_BELOW_TARGET'
  | 'UNBILLED_APPROVED_TIME'
  | 'UNBILLED_EXPENSE'
  | 'INVOICE_DUE_SOON'
  | 'INVOICE_OVERDUE'
  | 'LARGE_INVOICE_OVERDUE'
  | 'COMPLETED_PROJECT_UNBILLED_WORK';

export const ALERT_RULE_TYPES: readonly AlertRuleType[] = [
  'PROJECT_HOURS_75',
  'PROJECT_HOURS_80',
  'PROJECT_HOURS_100',
  'PROJECT_OVER_BUDGET',
  'PROJECT_MARGIN_BELOW_TARGET',
  'UNBILLED_APPROVED_TIME',
  'UNBILLED_EXPENSE',
  'INVOICE_DUE_SOON',
  'INVOICE_OVERDUE',
  'LARGE_INVOICE_OVERDUE',
  'COMPLETED_PROJECT_UNBILLED_WORK',
] as const;

// ---------- severity / entity / status (§5/§7) ----------

/** §7 — deterministic severity, server-defined only. */
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL'] as const;

/** §5 — the entity a record points at (drives the alert's click-through). */
export type AlertEntityType = 'PROJECT' | 'TIME' | 'EXPENSE' | 'INVOICE';

/** §19 — the record lifecycle. No DELETED: alerts are never removed. */
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export const ALERT_STATUSES: readonly AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;

/**
 * §19 manual transitions. RESOLVED is terminal for MANUAL moves — when a
 * resolved condition RETURNS, the evaluator starts a NEW OPEN cycle (§6:
 * the same condition is the same logical alert, a returned condition is a
 * new detection). That reopen is an evaluator write, never an API transition.
 */
export const ALERT_STATUS_TRANSITIONS: Readonly<Record<AlertStatus, readonly AlertStatus[]>> = {
  OPEN: ['ACKNOWLEDGED', 'RESOLVED'],
  ACKNOWLEDGED: ['RESOLVED'],
  RESOLVED: [],
};

export function canTransitionAlertStatus(from: AlertStatus, to: AlertStatus): boolean {
  return ALERT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * §23 — the Alert Center's first filter axis. Derived from the rule type
 * (never stored on the record; the catalog is the single definition).
 */
export type AlertCategory = 'PROJECTS' | 'BILLING' | 'CASH';

export const ALERT_CATEGORIES: readonly AlertCategory[] = ['PROJECTS', 'BILLING', 'CASH'] as const;

// ---------- AlertRule (§4.1) ----------

/**
 * Per-rule tenant configuration. Units are the human/business units the
 * §17 spec uses: `percentage` in percent (75/80/100/…), `days` in calendar
 * days, `amount` in MAJOR units of the tenant's invoice currency — the
 * same scale Money.amount carries throughout the agency store (₹1,00,000
 * is 100000) — so the generators compare config.amount against Money
 * amounts directly, with no conversion.
 */
export interface AlertRuleConfiguration {
  /** INVOICE_DUE_SOON — the due-soon window in days (default 7, §15). */
  days?: number;
  /** LARGE_INVOICE_OVERDUE — the large-invoice threshold, MAJOR units (§17). */
  amount?: number;
  /** Hours-band thresholds in percent, when a tenant tunes 75/80/100. */
  percentage?: number;
  /** Tenant severity override (still server-resolved, §7). */
  severity?: AlertSeverity;
}

/** §4.1 — WHAT should be detected. One row per (tenant, ruleType). */
export interface AlertRule {
  id: string;
  tenantId: string;
  type: AlertRuleType;
  enabled: boolean;
  configuration: AlertRuleConfiguration;
  createdAt: Date;
  updatedAt: Date;
}

/** The repo input for a lazily seeded default rule (15.2). */
export interface AlertRuleCreateInput {
  type: AlertRuleType;
  enabled: boolean;
  configuration: AlertRuleConfiguration;
}

// ---------- AgencyAlertRecord (§5) ----------

/**
 * §5 — WHAT was actually detected. `value`/`threshold` semantics are
 * rule-defined: hours bands carry PERCENT (0–100+), margin carries percent,
 * money rules carry Money MAJOR units with the currency in metadata.
 */
export interface AgencyAlertRecord {
  id: string;
  tenantId: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  title: string;
  message: string;
  entityType: AlertEntityType;
  entityId: string;
  /** Display name of the referenced entity (project name, invoice number) —
   *  set by the generators, consumed by every alert surface. */
  entityLabel?: string;
  clientId?: string;
  projectId?: string;
  invoiceId?: string;
  status: AlertStatus;
  value?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
  /** §6 — tenantId:ruleType:entityType:entityId (see rules.ts). */
  fingerprint: string;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/** The repo input for a first detection (15.3): everything but id. */
export type AgencyAlertRecordCreateInput = Omit<AgencyAlertRecord, 'id'>;

/** Partial field refresh for an existing record (the dedupe UPDATE path). */
export type AgencyAlertRecordUpdate = Partial<
  Pick<AgencyAlertRecord,
    | 'severity' | 'title' | 'message' | 'entityLabel' | 'clientId' | 'projectId' | 'invoiceId'
    | 'value' | 'threshold' | 'metadata'
  >
>;

// ---------- summary (§22 — the Command Center + Alert Center headline) ----------

/** Counts over the STORED alerts (no evaluation). */
export interface AlertSummaryCounts {
  open: number;
  acknowledged: number;
  resolved: number;
  /** Open alerts per severity. §114: counts INCLUDE cost-bearing alerts —
   *  a count is safe to show a cost-blind session; the rows are not. */
  openBySeverity: Record<AlertSeverity, number>;
}

/**
 * The alert headline: counts + the top unresolved alerts, severity-ranked.
 * `top` excludes cost-bearing rule types when the session lacks
 * agency.profitability.read (§114); the counts never do.
 */
export interface AlertSummary {
  counts: AlertSummaryCounts;
  top: AgencyAlertRecord[];
}
