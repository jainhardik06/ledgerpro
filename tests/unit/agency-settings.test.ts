/**
 * Module 17 (Sprint 17A / §43–§45, §48, §17.2) — Unit: agency settings
 * types, defaults, validators and the client projection.
 *
 * Pure tests, no db mocks. Pins:
 *   - §17.2 defaults: every value equals the pre-Module-17 deterministic
 *     constant (Asia/Kolkata, April FY, INR, 75/80/100 hours bands, 7-day
 *     overdue window, Razorpay disabled) — an unconfigured tenant sees ZERO
 *     behavior change.
 *   - §44 general: bounded agencyName, https logoUrl, ISO currency
 *     (case-tolerant), IANA timezone, month 1–12; merge-patch keeps absent
 *     fields.
 *   - §45 billing: paymentTermsDays 0–120 integer, payment-methods array
 *     bounds; numberingMode/invoiceNumber NEVER accepted as input.
 *   - §46 profitability: thresholds 0–100, strictly ordered
 *     first < warning < critical — the merged whole, not just the patch.
 *   - §47 tax: bounded SAC code, defaults only.
 *   - §48 projection: the payment section NEVER carries a secret —
 *     hasKeySecret/hasWebhookSecret booleans only; razorpayKeyId passes
 *     through as the one public payment field.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultAgencySettings, toPublicAgencySettings, DEFAULT_HOUR_WARNING_THRESHOLDS,
  DEFAULT_OVERDUE_WARNING_DAYS, type AgencySettings,
} from '@/lib/agency/types/agency-settings';
import {
  validateGeneralSettingsUpdate, validateBillingSettingsUpdate,
  validateProfitabilitySettingsUpdate, validateTaxSettingsUpdate,
  validatePaymentSettingsUpdate, isSettingsSection, sectionDefaults,
} from '@/lib/agency/validators/agency-settings';
import { DEFAULT_TENANT_TIMEZONE, FISCAL_YEAR_START_MONTH } from '@/lib/agency/types/dates';
import { DEFAULT_PROJECT_TYPES, MAX_PROJECT_TYPES, MAX_PROJECT_TYPE_LENGTH } from '@/lib/agency/types/agency-settings';

// ---------- §17.2 — defaults = the pre-Module-17 behavior ----------

describe('Module 17 §17.2 — defaults equal the pre-Module-17 constants', () => {
  it('general defaults: INR, Asia/Kolkata, April fiscal year', () => {
    const d = defaultAgencySettings();
    expect(d.general.defaultCurrency).toBe('INR');
    expect(d.general.timezone).toBe(DEFAULT_TENANT_TIMEZONE);
    expect(d.general.fiscalYearStartMonth).toBe(FISCAL_YEAR_START_MONTH);
    expect(d.general.fiscalYearStartMonth).toBe(4);
  });

  it('profitability defaults mirror the Module 15 catalog thresholds', () => {
    const d = defaultAgencySettings();
    expect(d.profitability.hourWarningThresholds).toEqual({ first: 75, warning: 80, critical: 100 });
    expect(d.profitability.hourWarningThresholds).toEqual({ ...DEFAULT_HOUR_WARNING_THRESHOLDS });
    expect(d.profitability.overdueWarningDays).toBeUndefined(); // rule default 7, §46 optional
    expect(DEFAULT_OVERDUE_WARNING_DAYS).toBe(7);
  });

  it('billing defaults: the one numbering mode, empty payment methods', () => {
    const d = defaultAgencySettings();
    expect(d.billing.numberingMode).toBe('FISCAL_YEAR_SEQUENCE');
    expect(d.billing.defaultPaymentMethods).toEqual([]);
    expect(d.billing.paymentTermsDays).toBeUndefined(); // fall through to client terms (§45)
  });

  it('payment defaults: integration disabled, no credentials', () => {
    const d = defaultAgencySettings();
    expect(d.payment.razorpayEnabled).toBe(false);
    expect(d.payment.razorpayKeyId).toBeUndefined();
    expect(d.payment.razorpayKeySecretEncrypted).toBeUndefined();
    expect(d.payment.webhookSecretEncrypted).toBeUndefined();
  });

  it('section defaults come from the same source (isSettingsSection guard)', () => {
    for (const s of ['general', 'billing', 'profitability', 'tax', 'payment'] as const) {
      expect(isSettingsSection(s)).toBe(true);
      expect(sectionDefaults(s)).toEqual(defaultAgencySettings()[s]);
    }
    expect(isSettingsSection('secrets')).toBe(false);
    expect(isSettingsSection('')).toBe(false);
  });
});

// ---------- §44 — general ----------

const stored = defaultAgencySettings();

describe('Module 17 §44 — general section validation', () => {
  it('merge-patches fields and keeps the rest', () => {
    const v = validateGeneralSettingsUpdate({ agencyName: 'Repsoft Digital' }, stored.general);
    expect(v.ok).toBe(true);
    expect(v.value?.agencyName).toBe('Repsoft Digital');
    expect(v.value?.timezone).toBe('Asia/Kolkata'); // untouched
  });

  it('accepts every valid field at once', () => {
    const v = validateGeneralSettingsUpdate({
      agencyName: 'Repsoft Digital',
      logoUrl: 'https://cdn.example.com/logo.png',
      defaultCurrency: 'usd', // case-tolerant, normalized upper
      timezone: 'Europe/Berlin',
      fiscalYearStartMonth: 1,
    }, stored.general);
    expect(v.ok).toBe(true);
    expect(v.value?.defaultCurrency).toBe('USD');
    expect(v.value?.timezone).toBe('Europe/Berlin');
    expect(v.value?.fiscalYearStartMonth).toBe(1);
  });

  it('rejects an invalid currency code', () => {
    const v = validateGeneralSettingsUpdate({ defaultCurrency: 'rupees' }, stored.general);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('defaultCurrency');
  });

  it('rejects a non-IANA timezone', () => {
    const v = validateGeneralSettingsUpdate({ timezone: 'IST+5:30' }, stored.general);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('timezone');
  });

  it('rejects a fiscal year month outside 1–12', () => {
    expect(validateGeneralSettingsUpdate({ fiscalYearStartMonth: 0 }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({ fiscalYearStartMonth: 13 }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({ fiscalYearStartMonth: 4.5 }, stored.general).ok).toBe(false);
  });

  it('rejects a non-https logo URL and an over-long name', () => {
    expect(validateGeneralSettingsUpdate({ logoUrl: 'http://insecure.example.com/x.png' }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({ agencyName: 'x'.repeat(201) }, stored.general).ok).toBe(false);
  });

  // ---------- Module 3 — the project-type vocabulary ----------

  it('defaults to the seeded project types', () => {
    expect(stored.general.projectTypes).toEqual([...DEFAULT_PROJECT_TYPES]);
    expect(stored.general.projectTypes.length).toBeGreaterThan(0);
  });

  it('accepts a replacement project-type list and leaves the rest untouched', () => {
    const v = validateGeneralSettingsUpdate({ projectTypes: ['Video Production', 'Podcast'] }, stored.general);
    expect(v.ok).toBe(true);
    expect(v.value?.projectTypes).toEqual(['Video Production', 'Podcast']);
    expect(v.value?.defaultCurrency).toBe('INR'); // untouched
  });

  it('trims each project type', () => {
    const v = validateGeneralSettingsUpdate({ projectTypes: ['  Branding  '] }, stored.general);
    expect(v.ok).toBe(true);
    expect(v.value?.projectTypes).toEqual(['Branding']);
  });

  it('rejects an EMPTY project-type list — the wizard picker would have nothing to offer', () => {
    const v = validateGeneralSettingsUpdate({ projectTypes: [] }, stored.general);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('projectTypes');
  });

  it('rejects duplicates case-insensitively, the way the picker reads them', () => {
    const v = validateGeneralSettingsUpdate({ projectTypes: ['Branding', 'branding'] }, stored.general);
    expect(v.ok).toBe(false);
    expect(v.errors?.some(e => e.field === 'projectTypes[1]')).toBe(true);
  });

  it('rejects a non-array, blank entries, over-long entries and too many', () => {
    expect(validateGeneralSettingsUpdate({ projectTypes: 'Branding' }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({ projectTypes: [''] }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({ projectTypes: ['x'.repeat(MAX_PROJECT_TYPE_LENGTH + 1)] }, stored.general).ok).toBe(false);
    expect(validateGeneralSettingsUpdate({
      projectTypes: Array.from({ length: MAX_PROJECT_TYPES + 1 }, (_, i) => `Type ${i}`),
    }, stored.general).ok).toBe(false);
  });

  it('an omitted projectTypes keeps the stored list (merge-patch, not replace)', () => {
    const v = validateGeneralSettingsUpdate({ agencyName: 'Acme' }, stored.general);
    expect(v.ok).toBe(true);
    expect(v.value?.projectTypes).toEqual([...DEFAULT_PROJECT_TYPES]);
  });

  it('a non-object payload is a 400-shape error', () => {
    const v = validateGeneralSettingsUpdate('nope' as never, stored.general);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('payload');
  });
});

// ---------- §45 — billing ----------

describe('Module 17 §45 — billing section validation', () => {
  it('merge-patches terms, tax profile and payment methods', () => {
    const v = validateBillingSettingsUpdate({
      paymentTermsDays: 15,
      defaultTaxProfileId: '507f1f77bcf86cd799439011',
      defaultPaymentMethods: ['UPI', 'Bank Transfer', 'Razorpay'],
    }, stored.billing);
    expect(v.ok).toBe(true);
    expect(v.value?.paymentTermsDays).toBe(15);
    expect(v.value?.defaultPaymentMethods).toEqual(['UPI', 'Bank Transfer', 'Razorpay']);
    expect(v.value?.numberingMode).toBe('FISCAL_YEAR_SEQUENCE'); // carried, not input
  });

  it('rejects terms outside 0–120 and non-integers', () => {
    expect(validateBillingSettingsUpdate({ paymentTermsDays: 121 }, stored.billing).ok).toBe(false);
    expect(validateBillingSettingsUpdate({ paymentTermsDays: -1 }, stored.billing).ok).toBe(false);
    expect(validateBillingSettingsUpdate({ paymentTermsDays: 7.5 }, stored.billing).ok).toBe(false);
  });

  it('rejects a non-array / over-long / empty-entry payment-methods list', () => {
    expect(validateBillingSettingsUpdate({ defaultPaymentMethods: 'UPI' }, stored.billing).ok).toBe(false);
    expect(validateBillingSettingsUpdate({ defaultPaymentMethods: ['UPI', '   '] }, stored.billing).ok).toBe(false);
    expect(
      validateBillingSettingsUpdate({ defaultPaymentMethods: Array.from({ length: 11 }, () => 'X') }, stored.billing).ok
    ).toBe(false);
  });

  it('§45 — numbering inputs are not part of the payload contract', () => {
    // numberingMode/invoiceNumber are not fields of BillingSettingsPayload —
    // numbering stays server-controlled (allocateInvoiceNumber, §74). Cast
    // through the unknown malicious-input shape a hostile client would send.
    const hostile = {
      paymentTermsDays: 15,
      numberingMode: 'SEQ',
      invoiceNumber: 'INV-2026-999',
    } as unknown as Parameters<typeof validateBillingSettingsUpdate>[0];
    const v = validateBillingSettingsUpdate(hostile, stored.billing);
    expect(v.ok).toBe(true);
    expect(v.value?.numberingMode).toBe('FISCAL_YEAR_SEQUENCE'); // unchanged
    expect(v.value?.paymentTermsDays).toBe(15); // the legitimate field lands
    expect(JSON.stringify(v.value)).not.toContain('INV-2026-999');
  });
});

// ---------- §46 — profitability (config only) ----------

describe('Module 17 §46 — profitability section validation', () => {
  it('merge-patches thresholds with the ordering invariant', () => {
    const v = validateProfitabilitySettingsUpdate({
      hourWarningThresholds: { first: 70, warning: 85, critical: 100 },
      overdueWarningDays: 14,
      targetProjectMargin: 35,
    }, stored.profitability);
    expect(v.ok).toBe(true);
    expect(v.value?.hourWarningThresholds).toEqual({ first: 70, warning: 85, critical: 100 });
    expect(v.value?.overdueWarningDays).toBe(14);
    expect(v.value?.targetProjectMargin).toBe(35);
  });

  it('rejects unordered thresholds — first must be < warning < critical', () => {
    expect(validateProfitabilitySettingsUpdate(
      { hourWarningThresholds: { first: 85, warning: 80, critical: 100 } }, stored.profitability
    ).ok).toBe(false);
    expect(validateProfitabilitySettingsUpdate(
      { hourWarningThresholds: { first: 75, warning: 100, critical: 100 } }, stored.profitability
    ).ok).toBe(false);
  });

  it('rejects thresholds outside 0–100 and margins outside 0–100', () => {
    expect(validateProfitabilitySettingsUpdate(
      { hourWarningThresholds: { first: 101, warning: 105, critical: 110 } }, stored.profitability
    ).ok).toBe(false);
    expect(validateProfitabilitySettingsUpdate({ targetProjectMargin: 150 }, stored.profitability).ok).toBe(false);
    expect(validateProfitabilitySettingsUpdate({ overdueWarningDays: -3 }, stored.profitability).ok).toBe(false);
  });

  it('rejects a non-object thresholds payload', () => {
    expect(validateProfitabilitySettingsUpdate(
      { hourWarningThresholds: [75, 80, 100] }, stored.profitability
    ).ok).toBe(false);
  });

  it('overdueWarningDays must be ≥ 1 (a 0-day window is meaningless — disable the rule instead)', () => {
    const v = validateProfitabilitySettingsUpdate({ overdueWarningDays: 0 }, stored.profitability);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('overdueWarningDays');
  });
});

// ---------- §47 — tax ----------

describe('Module 17 §47 — tax section validation (defaults + registration write-through)', () => {
  it('merge-patches the SAC default', () => {
    const v = validateTaxSettingsUpdate({ defaultSacCode: '998313' }, stored.tax);
    expect(v.ok).toBe(true);
    expect(v.value?.defaultSacCode).toBe('998313');
    expect(v.registration).toBeUndefined(); // no registration fields → no projection
  });

  it('bounds the SAC code', () => {
    expect(validateTaxSettingsUpdate({ defaultSacCode: 'x'.repeat(21) }, stored.tax).ok).toBe(false);
  });

  it('validates the registration projection — GSTIN shape, case-normalized', () => {
    const v = validateTaxSettingsUpdate(
      { registrationType: 'GSTIN', gstin: '27aapfu0939f1zv', stateCode: 'Maharashtra' },
      stored.tax
    );
    expect(v.ok).toBe(true);
    expect(v.registration).toEqual({
      registrationType: 'GSTIN',
      gstin: '27AAPFU0939F1ZV', // trimmed + upper-cased (§30 tolerance)
      stateCode: 'Maharashtra',
    });
    // §47 — the registration facts ride in the projection, NOT the stored section.
    expect(v.value).toEqual({});
  });

  it('rejects a malformed GSTIN', () => {
    const v = validateTaxSettingsUpdate({ gstin: '27AAPFU0939F1Z' }, stored.tax);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('gstin');
  });

  it('bounds the registration fields', () => {
    expect(validateTaxSettingsUpdate({ registrationType: 'x'.repeat(51) }, stored.tax).ok).toBe(false);
    expect(validateTaxSettingsUpdate({ gstin: 'x'.repeat(16) }, stored.tax).ok).toBe(false);
    expect(validateTaxSettingsUpdate({ stateCode: 'x'.repeat(101) }, stored.tax).ok).toBe(false);
  });
});

// ---------- §48 — payment + the projection ----------

describe('Module 17 §48 — payment validation & the client projection', () => {
  it('validates the public fields and the secret SHAPES only', () => {
    const v = validatePaymentSettingsUpdate(
      { razorpayEnabled: true, razorpayKeyId: 'rzp_live_xxx', razorpayKeySecret: 'secret-value', webhookSecret: 'whsec_value' },
      stored.payment
    );
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ razorpayEnabled: true, razorpayKeyId: 'rzp_live_xxx' });
    // §48/§49 — the plaintext secrets never appear in the validator output.
    expect(JSON.stringify(v.value)).not.toContain('secret-value');
    expect(JSON.stringify(v.value)).not.toContain('whsec_value');
  });

  it('rejects a non-boolean enable flag and non-string secrets', () => {
    expect(validatePaymentSettingsUpdate({ razorpayEnabled: 'yes' }, stored.payment).ok).toBe(false);
    expect(validatePaymentSettingsUpdate({ razorpayKeySecret: 42 as never }, stored.payment).ok).toBe(false);
    expect(validatePaymentSettingsUpdate({ webhookSecret: '' }, stored.payment).ok).toBe(false);
  });

  it('the projection NEVER carries a secret — booleans only', () => {
    const settings: AgencySettings = {
      ...defaultAgencySettings(),
      payment: {
        razorpayEnabled: true,
        razorpayKeyId: 'rzp_live_xxx',
        razorpayKeySecretEncrypted: 'v1:aaaa:bbbb:cccc',
        webhookSecretEncrypted: 'v1:dddd:eeee:ffff',
      },
    };
    const pub = toPublicAgencySettings(settings);
    expect(pub.payment).toEqual({
      razorpayEnabled: true,
      razorpayKeyId: 'rzp_live_xxx',
      hasKeySecret: true,
      hasWebhookSecret: true,
    });
    const serialized = JSON.stringify(pub);
    expect(serialized).not.toContain('v1:aaaa');
    expect(serialized).not.toContain('v1:dddd');
    expect(serialized).not.toContain('Encrypted');
  });

  it('the projection reports false for absent/empty secrets', () => {
    const pub = toPublicAgencySettings(defaultAgencySettings());
    expect(pub.payment.hasKeySecret).toBe(false);
    expect(pub.payment.hasWebhookSecret).toBe(false);
    expect(pub.payment.razorpayEnabled).toBe(false);
    expect('razorpayKeyId' in pub.payment).toBe(false);

    const emptied = toPublicAgencySettings({
      ...defaultAgencySettings(),
      payment: { razorpayEnabled: false, razorpayKeySecretEncrypted: '' },
    });
    expect(emptied.payment.hasKeySecret).toBe(false);
  });
});
