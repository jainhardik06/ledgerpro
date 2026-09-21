/**
 * Agency Vertical — Validators: rate economics input (Module 6, spec §91–§93)
 *
 * Reusable, framework-free validation for rate card, rate entry and user cost
 * assignment payloads. Pure functions: (input) → { ok, value } |
 * { ok: false, errors } — no NextResponse coupling.
 *
 * The rules (spec §91–§93):
 *   name         required (card + entry)
 *   type         COST | BILLING, required
 *   scope        ORGANIZATION | CLIENT, required; clientId required iff CLIENT
 *   currency     3-letter ISO-style code, required
 *   amount/rate  non-negative number — negatives REJECT
 *   unit         HOUR | DAY | FIXED
 *   billingType  HOURLY | FIXED | NON_BILLABLE
 *   cost cards   unit = HOUR only in Phase 1 (§73) — enforced at the DOMAIN
 *                layer (it needs the card's type), not here
 *   effectiveFrom valid YYYY-MM-DD, required for assignments and versions
 *   effectiveTo  optional, >= effectiveFrom (inclusive, §79)
 *
 * Module 4/5 audit lessons applied here:
 *   - PATCH is PARTIAL: required fields are validated against the ROW's
 *     current value by the domain (which merges identity before calling), so
 *     these validators may demand them for create without breaking PATCH.
 *   - An explicit empty string MEANS "clear" for optional fields (role,
 *     serviceType). The domain converts '' to the cleared state; these
 *     validators pass '' through untouched for those fields only.
 */
import {
  RATE_CARD_TYPES, RATE_CARD_SCOPES, RATE_UNITS, RATE_BILLING_TYPES,
  type RateCardType, type RateCardScope, type RateUnit, type RateBillingType,
} from '../types/rate';
import { isBusinessDate } from '../types/dates';

export interface RateFieldError {
  field: string;
  message: string;
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_NAME = 120;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function num(v: unknown, field: string, errors: RateFieldError[]): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push({ field, message: `${field} must be a number` });
    return undefined;
  }
  return v;
}

function bounded(v: unknown, label: string, field: string, max: number, errors: RateFieldError[]): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (s.length > max) errors.push({ field, message: `${label} is too long (max ${max} characters)` });
  return s;
}

/**
 * The '' passthrough (Module 4 lesson): for CLEARABLE optional fields the
 * caller needs to distinguish "absent" (undefined) from "explicitly cleared"
 * (''). Returns undefined for non-strings, '' for empty/whitespace, else the
 * trimmed value.
 */
function clearableStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t;
}

function dateStr(v: unknown, label: string, field: string, errors: RateFieldError[]): string | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!isBusinessDate(s)) {
    errors.push({ field, message: `${label} must be a valid date (YYYY-MM-DD)` });
    return undefined;
  }
  return s;
}

function enumIn<T extends string>(v: unknown, allowed: readonly T[], label: string, field: string, errors: RateFieldError[]): T | undefined {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!allowed.includes(s as T)) errors.push({ field, message: `${label} must be one of: ${allowed.join(', ')}` });
  return s as T | undefined;
}

// ---------- rate card (§91) ----------

export interface RateCardPayload {
  name?: unknown;
  type?: unknown;
  scope?: unknown;
  clientId?: unknown;
  currency?: unknown;
}

export interface RateCardValidated {
  name?: string;
  type?: RateCardType;
  scope?: RateCardScope;
  clientId?: string;
  currency?: string;
}

export type RateCardValidationResult =
  | { ok: true; value: RateCardValidated }
  | { ok: false; errors: RateFieldError[] };

/** Create guarantees the §91 required core: name, type, scope, currency (+ clientId iff CLIENT). */
export type RateCardCreateValidationResult =
  | { ok: true; value: RateCardValidated & { name: string; type: RateCardType; scope: RateCardScope; currency: string } }
  | { ok: false; errors: RateFieldError[] };

export function validateRateCardCreate(payload: RateCardPayload): RateCardCreateValidationResult {
  const errors: RateFieldError[] = [];
  const value = validateRateCardFields(payload, errors, true);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: value as RateCardValidated & { name: string; type: RateCardType; scope: RateCardScope; currency: string },
  };
}

/** PATCH is partial: any subset may arrive. Domain enforces immutability of type/scope/currency separately. */
export function validateRateCardUpdate(payload: RateCardPayload): RateCardValidationResult {
  const errors: RateFieldError[] = [];
  const value = validateRateCardFields(payload, errors, false);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

function validateRateCardFields(payload: RateCardPayload, errors: RateFieldError[], isCreate: boolean): RateCardValidated {
  const name = bounded(payload.name, 'Name', 'name', MAX_NAME, errors);
  if (payload.name !== undefined && !name) {
    // A sent-but-empty name is a real error, not a silent drop (M4/M5 lesson).
    errors.push({ field: 'name', message: 'Name is required' });
  }
  const type = enumIn(payload.type, RATE_CARD_TYPES, 'Type', 'type', errors);
  const scope = enumIn(payload.scope, RATE_CARD_SCOPES, 'Scope', 'scope', errors);
  const clientId = bounded(payload.clientId, 'Client', 'clientId', 100, errors);
  const currency = str(payload.currency)?.toUpperCase();
  if (payload.currency !== undefined) {
    if (!currency) errors.push({ field: 'currency', message: 'Currency is required' });
    else if (!CURRENCY_RE.test(currency)) errors.push({ field: 'currency', message: 'Currency must be a 3-letter ISO code (e.g. INR, USD)' });
  }

  // Create-mode required core (§91) — a PATCH may omit every field.
  if (isCreate) {
    if (payload.name === undefined) errors.push({ field: 'name', message: 'Name is required' });
    if (payload.type === undefined) errors.push({ field: 'type', message: 'Type is required (COST or BILLING)' });
    if (payload.scope === undefined) errors.push({ field: 'scope', message: 'Scope is required (ORGANIZATION or CLIENT)' });
    if (payload.currency === undefined) errors.push({ field: 'currency', message: 'Currency is required' });
  }

  // §91 — clientId is required iff scope = CLIENT, and meaningless otherwise.
  if (scope === 'CLIENT' && !clientId) {
    errors.push({ field: 'clientId', message: 'A client-specific rate card requires a client' });
  }
  if (scope === 'ORGANIZATION' && clientId) {
    errors.push({ field: 'clientId', message: 'An organization rate card cannot be tied to a client' });
  }

  return { name, type, scope, clientId, currency };
}

// ---------- rate card entry (§92) ----------

export interface RateEntryPayload {
  name?: unknown;
  role?: unknown;
  serviceType?: unknown;
  unit?: unknown;
  amount?: unknown;
  billable?: unknown;
  billingType?: unknown;
  effectiveFrom?: unknown;
}

export interface RateEntryValidated {
  name?: string;
  /** '' = explicitly cleared (PATCH only). */
  role?: string;
  /** '' = explicitly cleared (PATCH only). */
  serviceType?: string;
  unit?: RateUnit;
  amount?: number;
  billable?: boolean;
  billingType?: RateBillingType;
  /** Date for the initial/next version — required on create (§87). */
  effectiveFrom?: string;
}

export type RateEntryValidationResult =
  | { ok: true; value: RateEntryValidated }
  | { ok: false; errors: RateFieldError[] };

export function validateRateEntry(payload: RateEntryPayload): RateEntryValidationResult {
  const errors: RateFieldError[] = [];

  const name = bounded(payload.name, 'Name', 'name', MAX_NAME, errors);
  if (!name && payload.name !== undefined) {
    errors.push({ field: 'name', message: 'Name is required' });
  }
  if (payload.name === undefined) errors.push({ field: 'name', message: 'Name is required' });

  // Clearable optional identity — '' passes through so the domain can clear.
  const role = clearableStr(payload.role);
  if (role !== undefined && role.length > MAX_NAME) {
    errors.push({ field: 'role', message: `Role is too long (max ${MAX_NAME} characters)` });
  }
  const serviceType = clearableStr(payload.serviceType);
  if (serviceType !== undefined && serviceType.length > MAX_NAME) {
    errors.push({ field: 'serviceType', message: `Service type is too long (max ${MAX_NAME} characters)` });
  }

  const unit = enumIn(payload.unit, RATE_UNITS, 'Unit', 'unit', errors);
  const billingType = enumIn(payload.billingType, RATE_BILLING_TYPES, 'Billing type', 'billingType', errors);

  // §91/§92 — rate >= 0. Zero is technically valid at this layer (a
  // genuinely free service); negatives are not.
  const amount = num(payload.amount, 'amount', errors);
  if (amount !== undefined && amount < 0) {
    errors.push({ field: 'amount', message: 'Rate cannot be negative' });
  }

  let billable: boolean | undefined;
  if (payload.billable !== undefined) {
    if (typeof payload.billable !== 'boolean') {
      errors.push({ field: 'billable', message: 'Billable must be true or false' });
    } else {
      billable = payload.billable;
    }
  }

  // §72 consistency: a NON_BILLABLE billing type and billable=true contradict.
  if (billingType === 'NON_BILLABLE' && billable === true) {
    errors.push({ field: 'billable', message: 'A NON_BILLABLE entry cannot be marked billable' });
  }

  // Default billing-type/billable coherence is applied by the domain (it
  // knows the card type); here we only validate what was sent.
  const effectiveFrom = dateStr(payload.effectiveFrom, 'Effective from', 'effectiveFrom', errors);
  if (payload.effectiveFrom === undefined) {
    errors.push({ field: 'effectiveFrom', message: 'Effective from date is required' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name: name!, role, serviceType, unit, amount, billable, billingType, effectiveFrom },
  };
}

// ---------- user cost assignment (§93) ----------

export interface UserCostAssignmentPayload {
  rateCardId?: unknown;
  /** §131 — the specific cost entry within the card. */
  rateCardEntryId?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
}

export interface UserCostAssignmentValidated {
  rateCardId?: string;
  rateCardEntryId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export type UserCostAssignmentValidationResult =
  | { ok: true; value: UserCostAssignmentValidated & { rateCardId: string; rateCardEntryId: string; effectiveFrom: string } }
  | { ok: false; errors: RateFieldError[] };

export function validateUserCostAssignment(payload: UserCostAssignmentPayload): UserCostAssignmentValidationResult {
  const errors: RateFieldError[] = [];
  const rateCardId = bounded(payload.rateCardId, 'Rate card', 'rateCardId', 100, errors);
  if (!rateCardId) errors.push({ field: 'rateCardId', message: 'Rate card is required' });
  const rateCardEntryId = bounded(payload.rateCardEntryId, 'Rate', 'rateCardEntryId', 100, errors);
  if (!rateCardEntryId) errors.push({ field: 'rateCardEntryId', message: 'Rate is required' });
  const effectiveFrom = dateStr(payload.effectiveFrom, 'Effective from', 'effectiveFrom', errors);
  if (!effectiveFrom) errors.push({ field: 'effectiveFrom', message: 'Effective from date is required' });
  // §78 — explicit effectiveTo beats updatedAt for historical logic. Inclusive
  // (§79): effectiveTo >= effectiveFrom.
  const effectiveTo = dateStr(payload.effectiveTo, 'Effective to', 'effectiveTo', errors);
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    errors.push({ field: 'effectiveTo', message: 'Effective to cannot be before the effective from date' });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { rateCardId: rateCardId!, rateCardEntryId: rateCardEntryId!, effectiveFrom: effectiveFrom!, effectiveTo } };
}
