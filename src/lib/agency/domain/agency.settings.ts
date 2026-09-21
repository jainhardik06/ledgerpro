/**
 * Agency Vertical — Domain: Agency Settings (Module 17, §43–§52)
 *
 * Server-only. The single read/write path for the tenant's agencySettings
 * (one nullable field on the Tenant document — the Module 11 billingProfile
 * architecture, §43: extend the existing settings system, never a second
 * store).
 *
 * Read discipline: a tenant without stored settings gets defaultAgencySettings
 * () — every value equals the deterministic constant the engines used before
 * Module 17, so an unconfigured tenant sees zero behavior change (§17.2).
 *
 * Write discipline: merge-patch per section (§52); the validators run against
 * the MERGED section so a partial PATCH can never produce an invalid whole.
 * Every mutation audits SETTINGS_UPDATED (§74) with before/after detail —
 * the payment section additionally logs PAYMENT_CREDENTIALS_UPDATED with
 * masked values only (§73: secrets never enter any audit field).
 */
import { getTenantById, updateTenant, getTaxProfiles, getAlertRules } from '@/lib/db';
import type { Tenant } from '@/lib/db';
import type { AgencySettings, PublicAgencySettings } from '../types/agency-settings';
import { defaultAgencySettings, toPublicAgencySettings } from '../types/agency-settings';
import {
  validateGeneralSettingsUpdate, validateBillingSettingsUpdate,
  validateProfitabilitySettingsUpdate, validateTaxSettingsUpdate,
  validatePaymentSettingsUpdate,
  type GeneralSettingsPayload, type BillingSettingsPayload,
  type ProfitabilitySettingsPayload, type TaxSettingsPayload,
  type PaymentSettingsPayload,
} from '../validators/agency-settings';
import { updateAgencyAlertRule } from '../alerts/service';
import type { AlertRuleType } from '../alerts/types';
import { encryptSecret, decryptSecret, MASKED_SECRET } from '../security/credentials';
import type { GatewayCredentials } from './payment-gateway';
import { razorpayGateway } from './razorpay-gateway';
import { todayInTimezone } from '../types/dates';
import type { AuditContext, DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

// ---------- read ----------

/**
 * The tenant's effective settings: stored ⊕ defaults. This is the ONE read
 * every consumer (routes, engines, reports) goes through — nobody reads
 * tenant.agencySettings directly.
 */
export async function getAgencySettings(tenantId: string): Promise<AgencySettings> {
  const tenant = await getTenantById(tenantId);
  return agencySettingsOf(tenant);
}

/**
 * Pure projection of a (possibly settings-less) tenant onto its effective
 * settings. Callers that already hold the tenant object (routes with
 * gate.context.tenant) use this instead of a second fetch.
 */
export function agencySettingsOf(
  tenant: (Pick<Tenant, 'agencySettings'> & { name?: string }) | null | undefined
): AgencySettings {
  const defaults = defaultAgencySettings();
  const defaultAgencyName = tenant?.name?.trim() || defaults.general.agencyName || 'Money OS';
  if (!tenant?.agencySettings) {
    return {
      ...defaults,
      general: {
        ...defaults.general,
        agencyName: defaultAgencyName,
      },
    };
  }
  const storedName = tenant.agencySettings.general?.agencyName?.trim();
  // Defensive merge: a stored partial (older write) still resolves complete.
  return {
    general: {
      ...defaults.general,
      ...tenant.agencySettings.general,
      agencyName: storedName || defaultAgencyName,
    },
    billing: { ...defaults.billing, ...tenant.agencySettings.billing },
    profitability: { ...defaults.profitability, ...tenant.agencySettings.profitability },
    tax: { ...defaults.tax, ...tenant.agencySettings.tax },
    payment: { ...defaults.payment, ...tenant.agencySettings.payment },
    updatedAt: tenant.agencySettings.updatedAt,
    updatedBy: tenant.agencySettings.updatedBy,
  };
}

/** §48 — the client-safe projection of the effective settings. */
export async function getPublicAgencySettings(tenantId: string): Promise<PublicAgencySettings> {
  return toPublicAgencySettings(await getAgencySettings(tenantId));
}

/** The tenant's configured business timezone (§44), with the §17.2 default. */
export function agencyTimezone(tenant: Pick<Tenant, 'agencySettings'> | null | undefined): string {
  return tenant?.agencySettings?.general?.timezone ?? defaultAgencySettings().general.timezone;
}

/**
 * §44 — "today" in the AGENCY's timezone, for any engine's business-date
 * math (the Module 17 contract: today anchors to general.timezone, not the
 * server clock's locale). One tenant fetch per entry point; callers inside
 * a loop compute this ONCE and pass the date down instead.
 */
export async function agencyToday(tenantId: string): Promise<string> {
  return todayInTimezone(agencyTimezone(await getTenantById(tenantId)));
}

/** The tenant's fiscal-year start month 1–12 (§44), with the §17.2 default. */
export function agencyFiscalYearStartMonth(
  tenant: Pick<Tenant, 'agencySettings'> | null | undefined
): number {
  return tenant?.agencySettings?.general?.fiscalYearStartMonth
    ?? defaultAgencySettings().general.fiscalYearStartMonth;
}

// ---------- write (§52 — one PATCH per section) ----------

/** The sections a writeSection call may touch (§52). */
type SectionKey = 'general' | 'billing' | 'profitability' | 'tax' | 'payment';

/** Shared tail: persist the merged settings document and audit the change. */
async function writeSection(
  tenantId: string,
  before: AgencySettings,
  after: AgencySettings,
  section: SectionKey,
  audit: AuditContext,
  updatedBy: string
): Promise<DomainResult<AgencySettings>> {
  const stamped: AgencySettings = {
    ...after,
    updatedAt: new Date(),
    updatedBy,
  };
  const written = await updateTenant(tenantId, { agencySettings: stamped });
  if (!written) return notFound('Tenant');

  // §74/§73 — SETTINGS_UPDATED with before/after of the touched section.
  // The payment section is EXCLUDED: its stored shape carries ciphertexts,
  // and §73 keeps even those out of audit fields — the payment path logs
  // PAYMENT_CREDENTIALS_UPDATED with masked values instead. A
  // general/billing/profitability/tax payload can never carry a secret, so
  // the section diff here is safe by construction.
  if (section !== 'payment') {
    audit.log(
      'SETTINGS_UPDATED',
      `${section} settings updated (${JSON.stringify(before[section])} → ${JSON.stringify(stamped[section])})`
    );
  }
  return { ok: true, status: 200, data: stamped };
}

// ---------- §44 — general ----------

export async function updateAgencyGeneralSettings(
  tenantId: string,
  payload: GeneralSettingsPayload,
  audit: AuditContext
): Promise<DomainResult<AgencySettings>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const current = agencySettingsOf(tenant);
  const validated = validateGeneralSettingsUpdate(payload, current.general);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid general settings');
  }

  return writeSection(
    tenantId, current, { ...current, general: validated.value },
    'general', audit, audit.username
  );
}

// ---------- §45 — billing ----------

export async function updateAgencyBillingSettings(
  tenantId: string,
  payload: BillingSettingsPayload,
  audit: AuditContext
): Promise<DomainResult<AgencySettings>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const current = agencySettingsOf(tenant);
  const validated = validateBillingSettingsUpdate(payload, current.billing);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid billing settings');
  }

  // §67 — the default tax profile must be a REAL, ACTIVE profile of THIS
  // tenant (validated before any write; a foreign/inactive id is a 400).
  if (validated.value.defaultTaxProfileId !== undefined
    && validated.value.defaultTaxProfileId !== current.billing.defaultTaxProfileId) {
    const profiles = await getTaxProfiles(tenantId, { active: true });
    if (!profiles.some(p => p.id === validated.value!.defaultTaxProfileId)) {
      return badRequest('defaultTaxProfileId does not reference an active tax profile of this workspace');
    }
  }

  return writeSection(
    tenantId, current, { ...current, billing: validated.value },
    'billing', audit, audit.username
  );
}

// ---------- §46 — profitability (alert configuration write-through) ----------

/**
 * The §13 (17.13) mapping: settings thresholds → Module 15 rule
 * configurations. The rules are updated THROUGH the existing rule service so
 * every change carries its own ALERT_RULE_UPDATED audit and the evaluator
 * (effectiveRuleConfiguration) picks it up with zero engine changes.
 */
const HOURS_RULE_BY_BAND: Record<
  keyof AgencySettings['profitability']['hourWarningThresholds'], AlertRuleType
> = {
  first: 'PROJECT_HOURS_75',
  warning: 'PROJECT_HOURS_80',
  critical: 'PROJECT_HOURS_100',
};

export async function updateAgencyProfitabilitySettings(
  tenantId: string,
  payload: ProfitabilitySettingsPayload,
  audit: AuditContext
): Promise<DomainResult<AgencySettings>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const current = agencySettingsOf(tenant);
  const validated = validateProfitabilitySettingsUpdate(payload, current.profitability);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid profitability settings');
  }

  // §13 (17.13) — write the hour bands through to the Module 15 rules BEFORE
  // persisting the settings: a rule failure fails the whole PATCH (no
  // settings that claim thresholds the rules never received).
  if (validated.value.hourWarningThresholds !== undefined) {
    const bands = validated.value.hourWarningThresholds;
    const rules = await getAlertRules(tenantId);
    for (const [band, ruleType] of Object.entries(HOURS_RULE_BY_BAND) as [
      keyof typeof bands, AlertRuleType
    ][]) {
      const rule = rules.find(r => r.type === ruleType);
      if (!rule) continue; // lazy-seeded on first evaluation (§4); defaults hold
      const applied = await updateAgencyAlertRule(tenantId, audit, rule.id, {
        configuration: { percentage: bands[band] },
      });
      if (!applied.ok) {
        return badRequest(applied.error ?? `Failed to configure the ${ruleType} rule`);
      }
    }
  }
  if (validated.value.overdueWarningDays !== undefined) {
    const rules = await getAlertRules(tenantId);
    const rule = rules.find(r => r.type === 'INVOICE_DUE_SOON');
    if (rule) {
      const applied = await updateAgencyAlertRule(tenantId, audit, rule.id, {
        configuration: { days: validated.value.overdueWarningDays },
      });
      if (!applied.ok) {
        return badRequest(applied.error ?? 'Failed to configure the INVOICE_DUE_SOON rule');
      }
    }
  }

  return writeSection(
    tenantId, current, { ...current, profitability: validated.value },
    'profitability', audit, audit.username
  );
}

// ---------- §47 — tax (defaults + registration write-through) ----------

export async function updateAgencyTaxSettings(
  tenantId: string,
  payload: TaxSettingsPayload,
  audit: AuditContext
): Promise<DomainResult<AgencySettings>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const current = agencySettingsOf(tenant);
  const validated = validateTaxSettingsUpdate(payload, current.tax);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid tax settings');
  }

  // §47 — the registration facts write THROUGH to the Module 11
  // billingProfile (the single source of truth the invoice issuer reads).
  // The profile requires legalName on first write: registration fields
  // without an existing profile are an explicit 400, never a silent drop.
  if (validated.registration && Object.keys(validated.registration).length > 0) {
    if (!tenant.billingProfile) {
      return badRequest('Configure the agency billing profile (legal name) before tax registration details — /api/agency/billing-profile');
    }
    const profile = tenant.billingProfile;
    const reg = validated.registration;
    const mergedProfile = {
      ...profile,
      ...(reg.registrationType !== undefined && { taxRegistrationType: reg.registrationType }),
      ...(reg.gstin !== undefined && {
        // §9 — the CANONICAL identifier store; a GSTIN lives as a typed
        // entry (merge by type: replace the existing GSTIN, keep the rest).
        taxIdentifiers: [
          ...(profile.taxIdentifiers ?? []).filter(i => i.type.toUpperCase() !== 'GSTIN'),
          { type: 'GSTIN', value: reg.gstin },
        ],
      }),
      ...(reg.stateCode !== undefined && { state: reg.stateCode }),
      updatedAt: new Date(),
    };
    const written = await updateTenant(tenantId, { billingProfile: mergedProfile });
    if (!written) return notFound('Tenant');
    audit.log('BILLING_PROFILE_UPDATED', `Tax registration details updated via settings (${mergedProfile.legalName})`);
  }

  return writeSection(
    tenantId, current, { ...current, tax: validated.value },
    'tax', audit, audit.username
  );
}

// ---------- §48–§50 — payment (secrets, lifecycle, test) ----------

/**
 * §50 — the payment-settings lifecycle, all through one PATCH:
 *   add/update      razorpayEnabled / razorpayKeyId + optional secrets
 *   rotate          a NEW secret simply overwrites the stored ciphertext
 *   disable         razorpayEnabled: false (stored secrets are kept so a
 *                   later re-enable works without re-entering them)
 *
 * §49 fail-closed: a submitted secret with no AGENCY_MASTER_KEY configured
 * is a 503 — never a plaintext write, never a silent drop.
 */
export async function updateAgencyPaymentSettings(
  tenantId: string,
  payload: PaymentSettingsPayload & {
    razorpayKeySecret?: unknown;
    webhookSecret?: unknown;
  },
  audit: AuditContext
): Promise<DomainResult<AgencySettings>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const current = agencySettingsOf(tenant);
  const validated = validatePaymentSettingsUpdate(payload, current.payment);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid payment settings');
  }

  // §49 — secrets only ever move through the encryption layer. A submission
  // without a master key is a hard 503 (fail closed).
  const submittedKeySecret = typeof payload.razorpayKeySecret === 'string'
    && payload.razorpayKeySecret.trim() !== '' ? payload.razorpayKeySecret : undefined;
  const submittedWebhookSecret = typeof payload.webhookSecret === 'string'
    && payload.webhookSecret.trim() !== '' ? payload.webhookSecret : undefined;
  if ((submittedKeySecret !== undefined || submittedWebhookSecret !== undefined)) {
    const keySecretEncrypted = submittedKeySecret !== undefined
      ? encryptSecret(submittedKeySecret) : undefined;
    const webhookSecretEncrypted = submittedWebhookSecret !== undefined
      ? encryptSecret(submittedWebhookSecret) : undefined;
    if ((submittedKeySecret !== undefined && keySecretEncrypted === null)
      || (submittedWebhookSecret !== undefined && webhookSecretEncrypted === null)) {
      return {
        ok: false, status: 503,
        error: 'Credential encryption is not configured on this deployment (AGENCY_MASTER_KEY) — secrets cannot be stored',
      };
    }
    const merged: AgencySettings = {
      ...current,
      payment: {
        ...validated.value,
        // §50 rotate — a new secret overwrites; absent keeps the stored one.
        ...(keySecretEncrypted && { razorpayKeySecretEncrypted: keySecretEncrypted }),
        ...(webhookSecretEncrypted && { webhookSecretEncrypted }),
      },
    };
    const result = await writeSection(tenantId, current, merged, 'payment', audit, audit.username);
    if (result.ok && result.data) {
      auditPaymentCredentials(result.data, audit, submittedKeySecret !== undefined, submittedWebhookSecret !== undefined);
    }
    return result;
  }

  const result = await writeSection(
    tenantId, current, { ...current, payment: validated.value },
    'payment', audit, audit.username
  );
  if (result.ok && result.data) {
    auditPaymentCredentials(result.data, audit, false, false);
  }
  return result;
}

/** §73/§74 — the masked-only audit for the payment section. */
function auditPaymentCredentials(
  settings: AgencySettings,
  audit: AuditContext,
  keySecretSubmitted: boolean,
  webhookSecretSubmitted: boolean
): void {
  const p = settings.payment;
  audit.log(
    'PAYMENT_CREDENTIALS_UPDATED',
    `payment settings updated — Razorpay ${p.razorpayEnabled ? 'enabled' : 'disabled'}, `
    + `keyId ${p.razorpayKeyId ?? '(none)'}, `
    + `key secret ${p.razorpayKeySecretEncrypted ? MASKED_SECRET : '(none)'}${keySecretSubmitted ? ' (new value stored)' : ''}, `
    + `webhook secret ${p.webhookSecretEncrypted ? MASKED_SECRET : '(none)'}${webhookSecretSubmitted ? ' (new value stored)' : ''}`
  );
}

/**
 * §15 (17.15) — this tenant's decrypted Razorpay API pair, or undefined when
 * the tenant has none stored (the adapter then falls back to the deployment
 * env pair). The plaintext exists only in server memory for the duration of
 * one gateway call; it is never persisted or returned.
 */
export function tenantGatewayCredentials(
  tenant: Pick<Tenant, 'agencySettings'> | null | undefined
): GatewayCredentials | undefined {
  const p = tenant?.agencySettings?.payment;
  if (!p?.razorpayKeyId || !p.razorpayKeySecretEncrypted) return undefined;
  const keySecret = decryptSecret(p.razorpayKeySecretEncrypted);
  if (keySecret === null) return undefined; // tampered/undecryptable — env fallback
  return { keyId: p.razorpayKeyId, keySecret };
}

/**
 * §51 — this tenant's decrypted webhook secret, or undefined when none is
 * stored (the webhook domain then tries the env secret / other tenants).
 */
export function tenantWebhookSecretOf(
  tenant: Pick<Tenant, 'agencySettings'> | null | undefined
): string | undefined {
  const p = tenant?.agencySettings?.payment;
  if (!p?.webhookSecretEncrypted) return undefined;
  const secret = decryptSecret(p.webhookSecretEncrypted);
  return secret === null ? undefined : secret;
}

/**
 * §52 — POST /settings/payment/test. Submitted credentials (plaintext, this
 * request only) take precedence over the stored pair; with neither, the
 * adapter falls back to the env pair. The answer is a tri-state — never the
 * secret, never the ciphertext.
 */
export async function testAgencyPaymentCredentials(
  tenantId: string,
  submitted?: { razorpayKeyId?: unknown; razorpayKeySecret?: unknown }
): Promise<DomainResult<{ result: 'ok' | 'invalid' | 'unreachable' | 'unconfigured'; detail: string }>> {
  let credentials: GatewayCredentials | undefined;
  if (submitted && typeof submitted.razorpayKeyId === 'string' && submitted.razorpayKeyId.trim() !== ''
    && typeof submitted.razorpayKeySecret === 'string' && submitted.razorpayKeySecret.trim() !== '') {
    // A submitted pair is tested AS SUBMITTED — never stored by this call.
    credentials = { keyId: submitted.razorpayKeyId.trim(), keySecret: submitted.razorpayKeySecret };
  } else {
    const tenant = await getTenantById(tenantId);
    credentials = tenantGatewayCredentials(tenant);
  }

  const tested = await razorpayGateway.testCredentials(
    credentials ?? { keyId: '', keySecret: '' }
  );
  if (tested.ok) {
    return {
      ok: true, status: 200,
      data: { result: 'ok', detail: credentials ? 'The credential pair authenticates against Razorpay' : 'The deployment-level Razorpay credentials authenticate' },
    };
  }
  if (tested.status === 401) {
    return {
      ok: true, status: 200,
      data: { result: 'invalid', detail: tested.error ?? 'Razorpay rejected the credential pair' },
    };
  }
  if (tested.status === 503) {
    return {
      ok: true, status: 200,
      data: { result: 'unconfigured', detail: tested.error ?? 'No Razorpay credentials are configured' },
    };
  }
  return {
    ok: true, status: 200,
    data: { result: 'unreachable', detail: tested.error ?? 'Razorpay could not be reached' },
  };
}
