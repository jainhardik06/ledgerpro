/**
 * Agency Vertical — Types: Agency Settings (Module 17, §43–§48)
 *
 * CLIENT-SAFE: types, defaults and pure helpers only. No server imports.
 *
 * §43 — Agency Settings EXTEND the existing tenant settings system. There is
 * no separate collection: like Module 11's billingProfile, the settings live
 * as ONE nullable field on the Tenant document — a tenant without agency
 * settings is valid and every consumer falls back to the deterministic
 * defaults below (§17.2 — the defaults ARE the pre-Module-17 behavior:
 * Asia/Kolkata, April fiscal year, the Module 15 catalog thresholds).
 *
 * Split-of-truth discipline (binding):
 *   general       — identity + locale. defaultCurrency/timezone/
 *                   fiscalYearStartMonth feed the date/money rulebook.
 *   billing       — invoice-facing DEFAULTS. invoicePrefix is NOT here: it
 *                   lives in the Module 11 billingProfile (single source of
 *                   truth); this section writes through to it. Numbering
 *                   stays server-controlled (§45) — numberingMode is the
 *                   display name of the only mode allocateInvoiceNumber has.
 *   profitability — alert CONFIGURATION ONLY (§46): thresholds the Module 15
 *                   engine consumes; the engine owns every formula.
 *   tax           — defaults that feed the Module 11 engine (§47); the
 *                   GSTIN/state registration facts themselves live in the
 *                   billingProfile — this section writes through.
 *   payment       — per-tenant Razorpay credentials. The SECRET fields are
 *                   server-only (§48/§49): encrypted at rest, never present
 *                   in any client projection (toPublicAgencySettings is the
 *                   deliberate boundary).
 */
import { DEFAULT_CURRENCY, type CurrencyCode } from './money';
import { DEFAULT_TENANT_TIMEZONE, FISCAL_YEAR_START_MONTH } from './dates';

// ---------- §43 — the shape ----------

export interface AgencyGeneralSettings {
  /** §44 — bounded display name (separate from the core workspace name/app mode). */
  agencyName?: string;
  /** §44 — bounded logo URL. */
  logoUrl?: string;
  /** §44 — ISO-4217 code; the default for new money surfaces. */
  defaultCurrency: CurrencyCode;
  /** §44 — IANA timezone; the "today" anchor for all business-date math. */
  timezone: string;
  /** §44 — 1–12 (January = 1). India: 4 (April). */
  fiscalYearStartMonth: number;
  /**
   * Module 3 — the workspace's project-type vocabulary, consumed by the New
   * Project wizard's picker. Seeded from DEFAULT_PROJECT_TYPES and edited by
   * admins in Agency Settings → General.
   *
   * These are PICKER OPTIONS ONLY. A project stores `projectType` as a free
   * bounded string (validators/project.ts), so deleting an option here never
   * touches an existing project — it just stops offering it for new ones.
   */
  projectTypes: string[];
}

export interface AgencyBillingSettings {
  /** §45 — default days for invoice due dates when neither the invoice nor
   * the client carries terms. Kept as DAYS, not a PaymentTerms enum token:
   * the enum cannot express 15; days compose with dueDateFromTerms's
   * customDays parameter. */
  paymentTermsDays?: number;
  /** §45 — display-only: the one numbering mode the server implements
   * (§74 allocateInvoiceNumber). Never accepted from clients as input. */
  numberingMode: 'FISCAL_YEAR_SEQUENCE';
  /** §47 — default tax profile for new invoices (a tenant tax-profile id). */
  defaultTaxProfileId?: string;
  /** §45 — default payment methods offered on new invoices. */
  defaultPaymentMethods: string[];
}

export interface AgencyProfitabilitySettings {
  /** §46 — default target margin (%) for NEW projects when the payload omits
   * targetMargin. Creation-time default only — never rewritten. */
  targetProjectMargin?: number;
  /** §46 — the hours-band thresholds (% of plannedHours) that configure the
   * Module 15 PROJECT_HOURS_* rules (first/warning/critical). */
  hourWarningThresholds: {
    first: number;
    warning: number;
    critical: number;
  };
  /** §46 — days-before-due that configures the INVOICE_DUE_SOON rule. */
  overdueWarningDays?: number;
}

export interface AgencyTaxSettings {
  /** §47 — default SAC classification for service lines on new invoices. */
  defaultSacCode?: string;
}

export interface AgencyPaymentSettings {
  /** §48 — the integration switch. */
  razorpayEnabled: boolean;
  /** §48 — PUBLIC: the one payment field safe for the browser. */
  razorpayKeyId?: string;
  /** §49 — server-only: AES-256-GCM ciphertext. NEVER leaves the server. */
  razorpayKeySecretEncrypted?: string;
  /** §49 — server-only: AES-256-GCM ciphertext. NEVER leaves the server. */
  webhookSecretEncrypted?: string;
}

export interface AgencySettings {
  general: AgencyGeneralSettings;
  billing: AgencyBillingSettings;
  profitability: AgencyProfitabilitySettings;
  tax: AgencyTaxSettings;
  payment: AgencyPaymentSettings;
  updatedAt?: Date | string;
  updatedBy?: string;
}

// ---------- §48 — the client projection ----------

/**
 * §48 — the ONLY payment shape any API response may carry. The secrets exist
 * as booleans (so the UI can render "configured" state and ••••••) and never
 * as values. Every route that returns settings goes through this projection.
 */
export interface PublicAgencyPaymentSettings {
  razorpayEnabled: boolean;
  razorpayKeyId?: string;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
}

export interface PublicAgencySettings extends Omit<AgencySettings, 'payment'> {
  payment: PublicAgencyPaymentSettings;
}

/** §48 — project the stored settings to the client-safe shape. */
export function toPublicAgencySettings(settings: AgencySettings): PublicAgencySettings {
  return {
    general: settings.general,
    billing: settings.billing,
    profitability: settings.profitability,
    tax: settings.tax,
    payment: {
      razorpayEnabled: settings.payment.razorpayEnabled,
      ...(settings.payment.razorpayKeyId !== undefined && { razorpayKeyId: settings.payment.razorpayKeyId }),
      hasKeySecret: settings.payment.razorpayKeySecretEncrypted !== undefined
        && settings.payment.razorpayKeySecretEncrypted !== '',
      hasWebhookSecret: settings.payment.webhookSecretEncrypted !== undefined
        && settings.payment.webhookSecretEncrypted !== '',
    },
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

// ---------- §17.2 — defaults (= the pre-Module-17 behavior) ----------

/** The 75/80/100 hours bands mirror the Module 15 catalog defaults exactly. */
export const DEFAULT_HOUR_WARNING_THRESHOLDS = {
  first: 75,
  warning: 80,
  critical: 100,
} as const;

export const DEFAULT_OVERDUE_WARNING_DAYS = 7;

/**
 * Module 3 — the seed project-type vocabulary. A fresh agency gets these
 * without configuring anything; an admin edits the list in Agency Settings →
 * General. Deliberately generic agency work, not industry-specific.
 */
export const DEFAULT_PROJECT_TYPES: readonly string[] = [
  'Web Development',
  'Mobile App',
  'Branding & Design',
  'Content & SEO',
  'Consulting',
  'Retainer',
  'Maintenance & Support',
  'Other',
] as const;

/** §43 — the bounds the projectTypes validator enforces, shared with the UI. */
export const MAX_PROJECT_TYPES = 20;
export const MAX_PROJECT_TYPE_LENGTH = 60;

/**
 * §17.2 — a fresh agency's settings. Every value equals the deterministic
 * constant the engines used before settings existed, so a tenant that never
 * touches settings sees zero behavior change.
 */
export function defaultAgencySettings(): AgencySettings {
  return {
    general: {
      defaultCurrency: DEFAULT_CURRENCY,
      timezone: DEFAULT_TENANT_TIMEZONE,
      fiscalYearStartMonth: FISCAL_YEAR_START_MONTH,
      projectTypes: [...DEFAULT_PROJECT_TYPES],
    },
    billing: {
      numberingMode: 'FISCAL_YEAR_SEQUENCE',
      defaultPaymentMethods: [],
    },
    profitability: {
      hourWarningThresholds: { ...DEFAULT_HOUR_WARNING_THRESHOLDS },
    },
    tax: {},
    payment: {
      razorpayEnabled: false,
    },
  };
}
