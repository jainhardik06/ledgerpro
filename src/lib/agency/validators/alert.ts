/**
 * Agency Vertical — Validators: alert input (Module 15, §22/§24)
 *
 * Pure functions: (input) → { ok, value } | { ok: false, errors }.
 *
 * The only writable alert input is the RULE PATCH (§24): `enabled` and the
 * per-rule `configuration`. Everything else about a rule is catalog-owned,
 * and alert RECORDS are never client-writable — the evaluator creates and
 * refreshes them, and lifecycle moves go through acknowledge/resolve with
 * no payload at all.
 *
 * Configuration units follow types.ts: days in calendar days, percentage
 * in percent, amount in MAJOR units (the Money scale), severity from the
 * §7 union. Keys are whitelisted — an unknown key is a rejection, not a
 * silent ignore (a typo'd "day" must never look like a successful save).
 */
import type { AlertRuleConfiguration, AlertSeverity } from '../alerts/types';
import { ALERT_SEVERITIES } from '../alerts/types';

export interface AlertFieldError {
  field: string;
  message: string;
}

const MAX_AMOUNT = 1_000_000_000_000; // 1e12 — sanity bound, not a business rule.
const MAX_DAYS = 365;
const MAX_PERCENTAGE = 1000; // tuning headroom above 100 (a tenant may want 110).

/** The §24 configuration surface — anything else is rejected. */
const CONFIG_KEYS: readonly string[] = ['days', 'amount', 'percentage', 'severity'];

export interface ValidatedAlertRuleUpdate {
  enabled?: boolean;
  configuration?: AlertRuleConfiguration;
}

export function validateAlertRuleUpdate(
  payload: Record<string, unknown>
): { ok: true; value: ValidatedAlertRuleUpdate } | { ok: false; errors: AlertFieldError[] } {
  const errors: AlertFieldError[] = [];

  // ---- enabled ----
  let enabled: boolean | undefined;
  if (payload.enabled !== undefined && payload.enabled !== null) {
    if (typeof payload.enabled !== 'boolean') {
      errors.push({ field: 'enabled', message: 'Must be a boolean' });
    } else {
      enabled = payload.enabled;
    }
  }

  // ---- configuration (partial; merged over the catalog defaults by the
  //      generator, so an omitted key keeps its current/default value) ----
  let configuration: AlertRuleConfiguration | undefined;
  if (payload.configuration !== undefined && payload.configuration !== null) {
    if (typeof payload.configuration !== 'object' || Array.isArray(payload.configuration)) {
      errors.push({ field: 'configuration', message: 'Must be an object' });
    } else {
      const raw = payload.configuration as Record<string, unknown>;
      const parsed: AlertRuleConfiguration = {};

      for (const key of Object.keys(raw)) {
        if (!CONFIG_KEYS.includes(key)) {
          errors.push({ field: `configuration.${key}`, message: 'Unknown configuration key' });
        }
      }

      if (raw.days !== undefined && raw.days !== null) {
        const n = typeof raw.days === 'number' ? raw.days : Number(raw.days);
        if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
          errors.push({ field: 'configuration.days', message: `Must be a whole number between 1 and ${MAX_DAYS}` });
        } else {
          parsed.days = n;
        }
      }
      if (raw.amount !== undefined && raw.amount !== null) {
        const n = typeof raw.amount === 'number' ? raw.amount : Number(raw.amount);
        if (!Number.isFinite(n) || n <= 0) {
          errors.push({ field: 'configuration.amount', message: 'Must be a positive number' });
        } else if (n > MAX_AMOUNT) {
          errors.push({ field: 'configuration.amount', message: 'Exceeds the sanity bound' });
        } else {
          parsed.amount = n;
        }
      }
      if (raw.percentage !== undefined && raw.percentage !== null) {
        const n = typeof raw.percentage === 'number' ? raw.percentage : Number(raw.percentage);
        if (!Number.isFinite(n) || n <= 0 || n > MAX_PERCENTAGE) {
          errors.push({
            field: 'configuration.percentage',
            message: `Must be a positive number up to ${MAX_PERCENTAGE}`,
          });
        } else {
          parsed.percentage = n;
        }
      }
      if (raw.severity !== undefined && raw.severity !== null) {
        if (typeof raw.severity !== 'string' || !(ALERT_SEVERITIES as readonly string[]).includes(raw.severity)) {
          errors.push({ field: 'configuration.severity', message: 'Must be INFO, WARNING or CRITICAL' });
        } else {
          parsed.severity = raw.severity as AlertSeverity;
        }
      }

      if (Object.keys(parsed).length > 0) configuration = parsed;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(enabled !== undefined && { enabled }),
      ...(configuration !== undefined && { configuration }),
    },
  };
}
