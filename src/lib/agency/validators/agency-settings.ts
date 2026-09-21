/**
 * Agency Vertical — Validators: Agency Settings (Module 17, §44–§48)
 *
 * Pure functions; no DB access, no React imports. Each PATCH section gets
 * its own validator. Merge-patch semantics everywhere (the Module 11
 * billing-profile discipline): an absent field is "keep the stored value";
 * validation runs against the MERGED result so a partial PATCH can never
 * produce an invalid whole (e.g. hours thresholds that stop being ordered).
 */
import type {
  AgencyGeneralSettings, AgencyBillingSettings, AgencyProfitabilitySettings,
  AgencyTaxSettings, AgencyPaymentSettings, AgencySettings,
} from '../types/agency-settings';
import { defaultAgencySettings, MAX_PROJECT_TYPES, MAX_PROJECT_TYPE_LENGTH } from '../types/agency-settings';
import { isValidGstinShape } from '../types/tax';

export interface SettingsFieldError {
  field: string;
  message: string;
}

export interface SettingsValidated<T> {
  ok: boolean;
  value?: T;
  errors?: SettingsFieldError[];
  /**
   * §47 — the tax section's registration projection (write-through payload
   * for the Module 11 billingProfile; not stored in the settings document).
   */
  registration?: {
    registrationType?: string;
    gstin?: string;
    stateCode?: string;
  };
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const URL_RE = /^https:\/\/\S+$/i;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function bounded(
  v: unknown, label: string, max: number
): SettingsValidated<string | undefined> {
  const s = str(v);
  if (s === undefined) return { ok: true, value: undefined };
  if (s.length > max) {
    return { ok: false, errors: [{ field: label, message: `${label} is too long (max ${max} characters)` }] };
  }
  return { ok: true, value: s };
}

function num(
  v: unknown, label: string, errors: SettingsFieldError[],
  opts: { min?: number; max?: number; int?: boolean } = {}
): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)
    || (opts.int && !Number.isInteger(v))) {
    errors.push({ field: label, message: `${label} must be a${opts.int ? 'n integer' : ' number'}` });
    return undefined;
  }
  if (opts.min !== undefined && v < opts.min) {
    errors.push({ field: label, message: `${label} must be ≥ ${opts.min}` });
    return undefined;
  }
  if (opts.max !== undefined && v > opts.max) {
    errors.push({ field: label, message: `${label} must be ≤ ${opts.max}` });
    return undefined;
  }
  return v;
}

/** §44 — a real IANA zone. Intl.supportedValuesOf is the platform source;
 * the common-zone fallback keeps older runtimes honest without opening the
 * door to arbitrary strings. */
function isValidTimezone(v: string): boolean {
  try {
    const supported = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf?.('timeZone');
    if (supported) return supported.includes(v);
  } catch { /* fall through to the fallback list */ }
  return COMMON_TIMEZONES.includes(v);
}

const COMMON_TIMEZONES: readonly string[] = [
  'Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tehran',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Rome', 'Europe/Zurich',
  'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Istanbul', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Lima',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Brisbane',
  'Pacific/Auckland', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Nairobi',
  'Africa/Johannesburg', 'UTC',
];

function requireObject(payload: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; errors: SettingsFieldError[] } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: [{ field: 'payload', message: 'Request body must be an object' }] };
  }
  return { ok: true, body: payload as Record<string, unknown> };
}

// ---------- §44 — general ----------

export interface GeneralSettingsPayload {
  agencyName?: unknown;
  logoUrl?: unknown;
  defaultCurrency?: unknown;
  timezone?: unknown;
  fiscalYearStartMonth?: unknown;
  projectTypes?: unknown;
}

/**
 * Validate a general-section PATCH against the stored section. The merged
 * section must stay complete: defaultCurrency/timezone/fiscalYearStartMonth
 * are required fields (§43), so a first PATCH that omits them keeps the
 * §17.2 defaults — the merge can never be empty.
 */
export function validateGeneralSettingsUpdate(
  payload: GeneralSettingsPayload,
  existing: AgencyGeneralSettings
): SettingsValidated<AgencyGeneralSettings> {
  const checked = requireObject(payload);
  if (!checked.ok) return checked;
  const errors: SettingsFieldError[] = [];

  const agencyName = bounded(payload.agencyName, 'agencyName', 200);
  if (!agencyName.ok && agencyName.errors) errors.push(...agencyName.errors);

  const logoUrl = bounded(payload.logoUrl, 'logoUrl', 500);
  if (!logoUrl.ok) {
    if (logoUrl.errors) errors.push(...logoUrl.errors);
  } else if (logoUrl.value !== undefined && !URL_RE.test(logoUrl.value)) {
    errors.push({ field: 'logoUrl', message: 'logoUrl must be a valid https URL' });
  }

  const defaultCurrencyRaw = str(payload.defaultCurrency)?.toUpperCase();
  if (defaultCurrencyRaw !== undefined && !CURRENCY_RE.test(defaultCurrencyRaw)) {
    errors.push({ field: 'defaultCurrency', message: 'defaultCurrency must be a 3-letter ISO currency code (e.g. INR, USD)' });
  }

  const timezone = bounded(payload.timezone, 'timezone', 100);
  if (!timezone.ok) {
    if (timezone.errors) errors.push(...timezone.errors);
  } else if (timezone.value !== undefined && !isValidTimezone(timezone.value)) {
    errors.push({ field: 'timezone', message: 'timezone must be a valid IANA timezone (e.g. Asia/Kolkata)' });
  }

  const fiscalYearStartMonth = num(
    payload.fiscalYearStartMonth, 'fiscalYearStartMonth', errors, { min: 1, max: 12, int: true }
  );

  /**
   * Module 3 — the project-type vocabulary. An EMPTY list is rejected rather
   * than accepted: the New Project picker reads this list, so an empty one
   * would leave the wizard with nothing to offer. Duplicates are rejected
   * (case-insensitively, matching how the picker would read them) instead of
   * being silently merged, so the admin sees the mistake.
   */
  let projectTypes: string[] | undefined;
  if (payload.projectTypes !== undefined) {
    const raw = payload.projectTypes;
    if (!Array.isArray(raw)) {
      errors.push({ field: 'projectTypes', message: 'projectTypes must be an array' });
    } else if (raw.length === 0) {
      errors.push({ field: 'projectTypes', message: 'At least one project type is required' });
    } else if (raw.length > MAX_PROJECT_TYPES) {
      errors.push({ field: 'projectTypes', message: `Too many project types (max ${MAX_PROJECT_TYPES})` });
    } else {
      const types: string[] = [];
      const seen = new Set<string>();
      raw.forEach((entry, i) => {
        const boundedType = bounded(entry, `projectTypes[${i}]`, MAX_PROJECT_TYPE_LENGTH);
        if (!boundedType.ok) {
          if (boundedType.errors) errors.push(...boundedType.errors);
          return;
        }
        if (boundedType.value === undefined) {
          errors.push({ field: `projectTypes[${i}]`, message: 'project type names cannot be empty' });
          return;
        }
        const key = boundedType.value.toLowerCase();
        if (seen.has(key)) {
          errors.push({ field: `projectTypes[${i}]`, message: `Duplicate project type "${boundedType.value}"` });
          return;
        }
        seen.add(key);
        types.push(boundedType.value);
      });
      if (errors.length === 0) projectTypes = types;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const merged: AgencyGeneralSettings = {
    ...existing,
    ...(agencyName.value !== undefined && { agencyName: agencyName.value }),
    ...(logoUrl.value !== undefined && { logoUrl: logoUrl.value }),
    ...(defaultCurrencyRaw !== undefined && { defaultCurrency: defaultCurrencyRaw as AgencyGeneralSettings['defaultCurrency'] }),
    ...(timezone.value !== undefined && { timezone: timezone.value }),
    ...(fiscalYearStartMonth !== undefined && { fiscalYearStartMonth }),
    ...(projectTypes !== undefined && { projectTypes }),
  };
  return { ok: true, value: merged };
}

// ---------- §45 — billing ----------

export interface BillingSettingsPayload {
  paymentTermsDays?: unknown;
  defaultTaxProfileId?: unknown;
  defaultPaymentMethods?: unknown;
}

/**
 * Validate a billing-section PATCH. §45 — invoiceNumber/numberingMode are
 * NOT accepted here at all: numbering is server-controlled
 * (allocateInvoiceNumber, §74); a client can never force a number.
 */
export function validateBillingSettingsUpdate(
  payload: BillingSettingsPayload,
  existing: AgencyBillingSettings
): SettingsValidated<AgencyBillingSettings> {
  const checked = requireObject(payload);
  if (!checked.ok) return checked;
  const errors: SettingsFieldError[] = [];

  const paymentTermsDays = num(payload.paymentTermsDays, 'paymentTermsDays', errors, { min: 0, max: 120, int: true });

  const defaultTaxProfileId = bounded(payload.defaultTaxProfileId, 'defaultTaxProfileId', 100);
  if (!defaultTaxProfileId.ok && defaultTaxProfileId.errors) errors.push(...defaultTaxProfileId.errors);

  let defaultPaymentMethods: string[] | undefined;
  if (payload.defaultPaymentMethods !== undefined) {
    if (!Array.isArray(payload.defaultPaymentMethods)) {
      errors.push({ field: 'defaultPaymentMethods', message: 'defaultPaymentMethods must be an array' });
    } else if (payload.defaultPaymentMethods.length > 10) {
      errors.push({ field: 'defaultPaymentMethods', message: 'Too many payment methods (max 10)' });
    } else {
      const methods: string[] = [];
      payload.defaultPaymentMethods.forEach((raw, i) => {
        const m = bounded(raw, `defaultPaymentMethods[${i}]`, 50);
        if (!m.ok) {
          if (m.errors) errors.push(...m.errors);
          return;
        }
        if (m.value === undefined) {
          errors.push({ field: `defaultPaymentMethods[${i}]`, message: 'payment method names cannot be empty' });
          return;
        }
        methods.push(m.value);
      });
      if (errors.length === 0) defaultPaymentMethods = methods;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const merged: AgencyBillingSettings = {
    ...existing,
    ...(paymentTermsDays !== undefined && { paymentTermsDays }),
    ...(defaultTaxProfileId.value !== undefined && { defaultTaxProfileId: defaultTaxProfileId.value }),
    ...(defaultPaymentMethods !== undefined && { defaultPaymentMethods }),
  };
  return { ok: true, value: merged };
}

// ---------- §46 — profitability (alert thresholds, CONFIG only) ----------

export interface ProfitabilitySettingsPayload {
  targetProjectMargin?: unknown;
  hourWarningThresholds?: unknown;
  overdueWarningDays?: unknown;
}

/**
 * Validate a profitability-section PATCH. §46 — these values only configure
 * the Module 15 rules; no formula lives here. The merged hourWarningThresholds
 * must stay strictly ordered first < warning < critical so the alert bands
 * remain disjoint.
 */
export function validateProfitabilitySettingsUpdate(
  payload: ProfitabilitySettingsPayload,
  existing: AgencyProfitabilitySettings
): SettingsValidated<AgencyProfitabilitySettings> {
  const checked = requireObject(payload);
  if (!checked.ok) return checked;
  const errors: SettingsFieldError[] = [];

  const targetProjectMargin = num(payload.targetProjectMargin, 'targetProjectMargin', errors, { min: 0, max: 100 });
  // min 1 — a 0-day "due soon" window is meaningless (disable the rule
  // instead); the Module 15 rule validator enforces 1–365 on write-through.
  const overdueWarningDays = num(payload.overdueWarningDays, 'overdueWarningDays', errors, { min: 1, max: 365, int: true });

  let hourWarningThresholds: AgencyProfitabilitySettings['hourWarningThresholds'] | undefined;
  if (payload.hourWarningThresholds !== undefined) {
    if (!payload.hourWarningThresholds || typeof payload.hourWarningThresholds !== 'object'
      || Array.isArray(payload.hourWarningThresholds)) {
      errors.push({ field: 'hourWarningThresholds', message: 'hourWarningThresholds must be an object { first, warning, critical }' });
    } else {
      const t = payload.hourWarningThresholds as Record<string, unknown>;
      const first = num(t.first, 'hourWarningThresholds.first', errors, { min: 0, max: 100 });
      const warning = num(t.warning, 'hourWarningThresholds.warning', errors, { min: 0, max: 100 });
      const critical = num(t.critical, 'hourWarningThresholds.critical', errors, { min: 0, max: 100 });
      if (first !== undefined && warning !== undefined && critical !== undefined) {
        if (!(first < warning && warning < critical)) {
          errors.push({
            field: 'hourWarningThresholds',
            message: 'hour thresholds must be strictly ordered: first < warning < critical',
          });
        } else {
          hourWarningThresholds = { first, warning, critical };
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const merged: AgencyProfitabilitySettings = {
    ...existing,
    ...(targetProjectMargin !== undefined && { targetProjectMargin }),
    ...(hourWarningThresholds !== undefined && { hourWarningThresholds }),
    ...(overdueWarningDays !== undefined && { overdueWarningDays }),
  };
  return { ok: true, value: merged };
}

// ---------- §47 — tax (defaults + registration write-through) ----------

export interface TaxSettingsPayload {
  defaultSacCode?: unknown;
  /** §47 — the registration facts write THROUGH to the Module 11
   * billingProfile (single source of truth for the invoice issuer). */
  registrationType?: unknown;
  gstin?: unknown;
  stateCode?: unknown;
}

/**
 * §47 — settings establish defaults; the Module 11 engine decides actuals.
 * The registration fields (registrationType/gstin/stateCode) are validated
 * here but stored in the BILLING PROFILE by the domain — never duplicated
 * into the settings document.
 */
export function validateTaxSettingsUpdate(
  payload: TaxSettingsPayload,
  existing: AgencyTaxSettings
): SettingsValidated<AgencyTaxSettings> {
  const checked = requireObject(payload);
  if (!checked.ok) return checked;
  const errors: SettingsFieldError[] = [];

  const defaultSacCode = bounded(payload.defaultSacCode, 'defaultSacCode', 20);
  if (!defaultSacCode.ok && defaultSacCode.errors) errors.push(...defaultSacCode.errors);

  const registrationType = bounded(payload.registrationType, 'registrationType', 50);
  if (!registrationType.ok && registrationType.errors) errors.push(...registrationType.errors);

  const gstinRaw = bounded(payload.gstin, 'gstin', 15);
  if (!gstinRaw.ok) {
    if (gstinRaw.errors) errors.push(...gstinRaw.errors);
  } else if (gstinRaw.value !== undefined) {
    // §30 — GSTIN SHAPE check (format only, never a registry claim).
    if (!isValidGstinShape(gstinRaw.value)) {
      errors.push({ field: 'gstin', message: 'gstin is not a well-formed GSTIN (15 characters: state code + PAN + entity code + Z + checksum position)' });
    }
  }

  const stateCode = bounded(payload.stateCode, 'stateCode', 100);
  if (!stateCode.ok && stateCode.errors) errors.push(...stateCode.errors);

  if (errors.length > 0) return { ok: false, errors };

  const merged: AgencyTaxSettings = {
    ...existing,
    ...(defaultSacCode.value !== undefined && { defaultSacCode: defaultSacCode.value }),
  };
  // The registration projection rides along for the domain's billing-profile
  // write-through — it is NOT part of the stored settings section. Omitted
  // entirely when no registration field was sent.
  const registration = {
    ...(registrationType.value !== undefined && { registrationType: registrationType.value }),
    ...(gstinRaw.value !== undefined && {
      gstin: gstinRaw.value!.trim().toUpperCase(),
    }),
    ...(stateCode.value !== undefined && { stateCode: stateCode.value }),
  };
  return {
    ok: true,
    value: merged,
    ...(Object.keys(registration).length > 0 && { registration }),
  };
}

// ---------- §48 — payment (public fields only; secrets handled by §17.9) ----------

export interface PaymentSettingsPayload {
  razorpayEnabled?: unknown;
  razorpayKeyId?: unknown;
}

/**
 * Validate the PUBLIC payment fields of a PATCH. The secret plaintexts
 * (razorpayKeySecret / webhookSecret) arrive here too but are handled by the
 * encryption layer in the domain (§17.9) — this validator never echoes them
 * into its output; it only confirms their SHAPE when present.
 */
export function validatePaymentSettingsUpdate(
  payload: PaymentSettingsPayload & {
    razorpayKeySecret?: unknown;
    webhookSecret?: unknown;
  },
  existing: AgencyPaymentSettings
): SettingsValidated<
  Pick<AgencyPaymentSettings, 'razorpayEnabled' | 'razorpayKeyId'>
> {
  const checked = requireObject(payload);
  if (!checked.ok) return checked;
  const errors: SettingsFieldError[] = [];

  let razorpayEnabled: boolean | undefined;
  if (payload.razorpayEnabled !== undefined) {
    if (typeof payload.razorpayEnabled !== 'boolean') {
      errors.push({ field: 'razorpayEnabled', message: 'razorpayEnabled must be a boolean' });
    } else {
      razorpayEnabled = payload.razorpayEnabled;
    }
  }

  const razorpayKeyId = bounded(payload.razorpayKeyId, 'razorpayKeyId', 100);
  if (!razorpayKeyId.ok && razorpayKeyId.errors) errors.push(...razorpayKeyId.errors);

  // Secret shape check only — the plaintext never leaves this function.
  for (const [field, value] of [
    ['razorpayKeySecret', payload.razorpayKeySecret],
    ['webhookSecret', payload.webhookSecret],
  ] as const) {
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push({ field, message: `${field} must be a non-empty string` });
      } else if (value.length > 500) {
        errors.push({ field, message: `${field} is too long (max 500 characters)` });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const merged = {
    ...existing,
    ...(razorpayEnabled !== undefined && { razorpayEnabled }),
    ...(razorpayKeyId.value !== undefined && { razorpayKeyId: razorpayKeyId.value }),
  };
  return { ok: true, value: merged };
}

// ---------- whole-document helpers ----------

/** The section keys a PATCH may target (§52). */
export const SETTINGS_SECTIONS = ['general', 'billing', 'profitability', 'tax', 'payment'] as const;
export type SettingsSection = typeof SETTINGS_SECTIONS[number];

export function isSettingsSection(v: string): v is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(v);
}

/** §17.2 — defaults for a section (the pre-Module-17 deterministic values). */
export function sectionDefaults(section: SettingsSection): AgencySettings[SettingsSection] {
  return defaultAgencySettings()[section];
}
