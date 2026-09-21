/**
 * Agency Vertical — Domain: tax & compliance service (Module 11, §6–§9/§29)
 *
 * The ONLY writer path for the agency's billing identity and tax profiles.
 * React components never touch MongoDB — they go API route → this service →
 * db.ts. The tax RULES themselves (GST structure, withholding) live in their
 * own pure engine modules (later sprints) — never in React, never in routes
 * (spec §28).
 *
 * Responsibilities:
 *   - BillingProfile (§7): the agency's own billing identity, one per tenant
 *     (nullable expansion on Tenant). Partial merge-patch: legalName is
 *     required once and never clearable; taxIdentifiers[] is full-replace.
 *   - TaxProfile (§6): tenant-level, NAMED tax configurations carrying the
 *     taxTreatment vocabulary (REGISTERED/UNREGISTERED/EXEMPT/EXPORT/OTHER).
 *     Semantics are configuration — never UI labels.
 *   - §30 GSTIN/PAN SHAPE validation happens in the validators; this service
 *     never second-guesses it and never performs registry lookups.
 *   - Audit (§115): BILLING_PROFILE_UPDATED, TAX_PROFILE_CREATED/UPDATED.
 */
import {
  getTenantById, updateTenant,
  getTaxProfiles, getTaxProfileById,
  createTaxProfile as createTaxProfileRepo, updateTaxProfile as updateTaxProfileRepo,
  getWithholdingRules, getWithholdingRuleById,
  createWithholdingRule as createWithholdingRuleRepo, updateWithholdingRule as updateWithholdingRuleRepo,
  type TaxProfileListFilters, type WithholdingRuleListFilters,
} from '@/lib/db';
import type { AgencyBillingProfile, TaxProfile } from '../types/tax';
import type { WithholdingRule } from '../types/withholding';
import { suggestWithholding, type WithholdingSuggestion } from './tax-rules';
import {
  validateBillingProfileUpdate, validateTaxProfileCreate, validateTaxProfileUpdate,
  validateWithholdingRuleCreate, validateWithholdingRuleUpdate,
  type BillingProfilePayload, type TaxProfilePayload, type WithholdingRulePayload,
} from '../validators/tax';
import { type AuditContext, type DomainResult } from './agency.clients';

const notFound = (what: string): DomainResult<never> =>
  ({ ok: false, status: 404, error: `${what} not found` });

const badRequest = (error: string): DomainResult<never> =>
  ({ ok: false, status: 400, error });

// ---------- §7 — the agency's billing identity ----------

/**
 * The stored billing profile, or null when the agency has not configured one
 * — an honest null, never a fabricated default identity.
 */
export async function getAgencyBillingProfile(tenantId: string): Promise<AgencyBillingProfile | null> {
  const tenant = await getTenantById(tenantId);
  return tenant?.billingProfile ?? null;
}

export async function updateAgencyBillingProfile(
  tenantId: string,
  payload: BillingProfilePayload,
  audit: AuditContext
): Promise<DomainResult<AgencyBillingProfile>> {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return notFound('Tenant');

  const existing = tenant.billingProfile ?? null;
  const validated = validateBillingProfileUpdate(payload, existing);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid billing profile');
  }

  // Merge-patch: absent fields keep their stored value. The merged profile is
  // written as ONE field on the tenant — a single source of truth for the
  // invoice issuer.
  const merged: AgencyBillingProfile = {
    ...(existing ?? { legalName: '' }),
    ...validated.value,
    updatedAt: new Date(),
  };

  const written = await updateTenant(tenantId, { billingProfile: merged });
  if (!written) return notFound('Tenant');

  audit.log('BILLING_PROFILE_UPDATED', `Agency billing profile updated (${merged.legalName})`);
  return { ok: true, status: 200, data: merged };
}

// ---------- §6 — tenant tax profiles ----------

export async function listTaxProfiles(
  tenantId: string,
  filters: TaxProfileListFilters = {}
): Promise<DomainResult<TaxProfile[]>> {
  const profiles = await getTaxProfiles(tenantId, filters);
  return { ok: true, status: 200, data: profiles };
}

export async function createAgencyTaxProfile(
  tenantId: string,
  payload: TaxProfilePayload,
  audit: AuditContext
): Promise<DomainResult<TaxProfile>> {
  const validated = validateTaxProfileCreate(payload);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid tax profile');
  }
  const profile = await createTaxProfileRepo(tenantId, validated.value);
  audit.log('TAX_PROFILE_CREATED', `Tax profile "${profile.name}" (${profile.taxTreatment}) created`);
  return { ok: true, status: 201, data: profile };
}

export async function updateAgencyTaxProfile(
  tenantId: string,
  profileId: string,
  payload: TaxProfilePayload,
  audit: AuditContext
): Promise<DomainResult<TaxProfile>> {
  const existing = await getTaxProfileById(profileId, tenantId);
  if (!existing) return notFound('Tax profile');

  const validated = validateTaxProfileUpdate(payload);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => e.message).join('; ') ?? 'Invalid tax profile');
  }
  if (Object.keys(validated.value).length === 0) {
    return badRequest('No valid tax profile fields to update');
  }

  const written = await updateTaxProfileRepo(profileId, tenantId, validated.value);
  if (!written) return notFound('Tax profile');

  const updated = await getTaxProfileById(profileId, tenantId);
  audit.log('TAX_PROFILE_UPDATED', `Tax profile "${existing.name}" updated`);
  return { ok: true, status: 200, data: updated ?? existing };
}

// ---------- §18–§21 — withholding rules (CONFIGURATION, never hard-coded) ----------

/**
 * §19 — the tenant's effective-dated withholding rule CONFIGURATIONS. These
 * are data: the Income Tax Act 2025 framework arrives from 2026-04-01 as
 * tenant-entered rules, and no legacy section (194C/194J/194H/…) is ever
 * hard-coded in the product (§19). Reads ride on the list filters only.
 */
export async function listWithholdingRules(
  tenantId: string,
  filters: WithholdingRuleListFilters = {}
): Promise<DomainResult<WithholdingRule[]>> {
  const rules = await getWithholdingRules(tenantId, filters);
  return { ok: true, status: 200, data: rules };
}

export async function createWithholdingRule(
  tenantId: string,
  payload: WithholdingRulePayload,
  audit: AuditContext
): Promise<DomainResult<WithholdingRule>> {
  const validated = validateWithholdingRuleCreate(payload);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => `${e.field}: ${e.message}`).join('; ') ?? 'Invalid withholding rule');
  }
  const rule = await createWithholdingRuleRepo(tenantId, validated.value);
  audit.log(
    'WITHHOLDING_RULE_CREATED',
    `Withholding rule ${rule.ruleCode} (${rule.jurisdiction}) created — ${rule.rate}% from ${rule.effectiveFrom}${rule.effectiveTo ? ` to ${rule.effectiveTo}` : ', open-ended'}`
  );
  return { ok: true, status: 201, data: rule };
}

export async function updateWithholdingRule(
  tenantId: string,
  ruleId: string,
  payload: WithholdingRulePayload,
  audit: AuditContext
): Promise<DomainResult<WithholdingRule>> {
  const existing = await getWithholdingRuleById(ruleId, tenantId);
  if (!existing) return notFound('Withholding rule');

  const validated = validateWithholdingRuleUpdate(payload);
  if (!validated.ok || !validated.value) {
    return badRequest(validated.errors?.map(e => `${e.field}: ${e.message}`).join('; ') ?? 'Invalid withholding rule');
  }

  const written = await updateWithholdingRuleRepo(ruleId, tenantId, validated.value);
  if (!written) return notFound('Withholding rule');

  const updated = await getWithholdingRuleById(ruleId, tenantId);
  audit.log(
    'WITHHOLDING_RULE_UPDATED',
    `Withholding rule ${existing.ruleCode} (${existing.jurisdiction}) updated`
  );
  return { ok: true, status: 200, data: updated ?? existing };
}

/**
 * §28 — the agency module's CONSUMPTION of the withholding rules engine: the
 * tenant's active rule rows evaluated by the pure rules layer
 * (suggestWithholding) against a stored context (date, jurisdiction, base
 * value). ADVISORY ONLY (§19/§20): the caller — the payment/settlement flow —
 * records WHAT IT DECIDED as a WithholdingAdjustment; nothing here writes.
 *
 * The jurisdiction is the recipient's stored country (client tax profile →
 * invoice place of supply), never an assumed default — no jurisdiction, no
 * suggestion. The base value is the §22 taxable value the threshold is
 * tested against.
 */
export async function getWithholdingSuggestions(input: {
  tenantId: string;
  /** YYYY-MM-DD — the date the withholding applies on. */
  onDate: string;
  /** The recipient's jurisdiction ('IN', 'US', …). */
  jurisdiction: string;
  /** The value the threshold is tested against (major units). */
  baseValue: number;
  currency: string;
}): Promise<WithholdingSuggestion[]> {
  const rules = await getWithholdingRules(input.tenantId, { active: true });
  return suggestWithholding({
    rules,
    onDate: input.onDate,
    jurisdiction: input.jurisdiction,
    baseValue: input.baseValue,
    currency: input.currency,
  });
}
