/**
 * Agency Vertical — Validators: client input (Module 2, spec §31 / Step 2.3)
 *
 * Reusable, framework-free validation for client create/update payloads.
 * Pure functions: (input) → { ok, value } | { ok: false, error } — no
 * NextResponse coupling, so both API routes and the domain service can call
 * them. Route handlers translate errors to 400s.
 *
 * Rules (spec §31):
 *   name        required, trimmed, bounded (client-safe max)
 *   email       valid format when present (contact AND billing — they may
 *               legitimately differ, §9)
 *   phone       bounded length
 *   currency    3-letter ISO-style code when present
 *   status      valid enum when present
 *   tax fields  validated against the CHOSEN country/profile — never
 *               assuming everything is Indian (§11)
 */
import {
  BILLING_MODELS, CLIENT_STATUSES, canTransitionClientStatus, normalizeClientName,
  type AgencyClient, type BillingModel, type ClientStatus,
} from '../types/client';
import type { PaymentTerms } from '../types/dates';
import { isTaxTreatment, type TaxIdentifier, type TaxTreatment } from '../types/tax';
import { validateTaxIdentifiers } from './tax';

export interface Validated<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function email(v: unknown, label: string): Validated<string | undefined> {
  const s = str(v);
  if (s === undefined) return { ok: true, value: undefined };
  if (s.length > 254) return { ok: false, error: `${label} is too long (max 254 characters)` };
  if (!EMAIL_RE.test(s)) return { ok: false, error: `${label} must be a valid email address` };
  return { ok: true, value: s };
}

function bounded(v: unknown, label: string, max: number): Validated<string | undefined> {
  const s = str(v);
  if (s === undefined) return { ok: true, value: undefined };
  if (s.length > max) return { ok: false, error: `${label} is too long (max ${max} characters)` };
  return { ok: true, value: s };
}

function currency(v: unknown, label: string): Validated<string | undefined> {
  const s = str(v)?.toUpperCase();
  if (s === undefined) return { ok: true, value: undefined };
  if (!CURRENCY_RE.test(s)) return { ok: false, error: `${label} must be a 3-letter ISO currency code (e.g. INR, USD)` };
  return { ok: true, value: s };
}

function enumIn<T extends string>(v: unknown, allowed: readonly T[], label: string): Validated<T | undefined> {
  const s = str(v);
  if (s === undefined) return { ok: true, value: undefined };
  if (!allowed.includes(s as T)) return { ok: false, error: `${label} must be one of: ${allowed.join(', ')}` };
  return { ok: true, value: s as T };
}

/** A field-level error with the offending path — routes flatten these into 400 bodies. */
export interface ClientFieldError {
  field: string;
  message: string;
}

// ---------- create (spec §23–§24) ----------

export interface ClientCreatePayload {
  name?: unknown;
  email?: unknown;
  legalName?: unknown;
  website?: unknown;
  phone?: unknown;
  industry?: unknown;
  notes?: unknown;
  primaryContact?: {
    name?: unknown; email?: unknown; phone?: unknown; role?: unknown;
  };
  billingProfile?: {
    email?: unknown; address?: unknown; city?: unknown; state?: unknown;
    postalCode?: unknown; country?: unknown; currency?: unknown;
  };
  taxProfile?: {
    country?: unknown; registrationType?: unknown;
    registrationNumber?: unknown; placeOfSupply?: unknown;
    taxTreatment?: unknown; taxIdentifiers?: unknown; state?: unknown;
  };
  commercialDefaults?: {
    billingModel?: unknown; paymentTerms?: unknown; currency?: unknown;
  };
  status?: unknown;
}

/**
 * Validate a standalone tax profile (Step 2.3, §11) — country-agnostic:
 * every field is a bounded optional string, nothing assumes a specific
 * country's registration scheme. An empty/absent profile is valid.
 */
export function validateClientTaxProfile(tp: ClientCreatePayload['taxProfile']): {
  ok: true;
  value?: { country?: string; registrationType?: string; registrationNumber?: string; placeOfSupply?: string; taxTreatment?: TaxTreatment; taxIdentifiers?: TaxIdentifier[]; state?: string };
} | { ok: false; errors: ClientFieldError[] } {
  if (!tp || typeof tp !== 'object') return { ok: true };
  const errors: ClientFieldError[] = [];

  const tpCountry = bounded(tp.country, 'Tax country', 100);
  if (!tpCountry.ok) errors.push({ field: 'taxProfile.country', message: tpCountry.error! });
  const tpType = bounded(tp.registrationType, 'Tax registration type', 50);
  if (!tpType.ok) errors.push({ field: 'taxProfile.registrationType', message: tpType.error! });
  const tpNumber = bounded(tp.registrationNumber, 'Tax registration number', 50);
  if (!tpNumber.ok) errors.push({ field: 'taxProfile.registrationNumber', message: tpNumber.error! });
  const tpSupply = bounded(tp.placeOfSupply, 'Place of supply', 100);
  if (!tpSupply.ok) errors.push({ field: 'taxProfile.placeOfSupply', message: tpSupply.error! });
  // Module 11 (§8) — the client's state, a place-of-supply INPUT (the
  // determination itself stays a separate versioned rules layer, §15).
  const tpState = bounded(tp.state, 'Tax state', 100);
  if (!tpState.ok) errors.push({ field: 'taxProfile.state', message: tpState.error! });

  // Module 11 (§6) — taxTreatment: the configurable vocabulary, never a UI label.
  let tpTreatment: TaxTreatment | undefined;
  if (tp.taxTreatment !== undefined && str(tp.taxTreatment) !== undefined) {
    if (!isTaxTreatment(tp.taxTreatment)) {
      errors.push({ field: 'taxProfile.taxTreatment', message: 'Tax treatment must be one of: REGISTERED, UNREGISTERED, EXEMPT, EXPORT, OTHER' });
    } else {
      tpTreatment = tp.taxTreatment;
    }
  }

  // Module 11 (§9) — the generic identifier store; a GSTIN-typed identifier
  // must pass the SHAPE check (§30). Full-replace semantics.
  let tpIdentifiers: TaxIdentifier[] | undefined;
  if (tp.taxIdentifiers !== undefined) {
    const ids = validateTaxIdentifiers(tp.taxIdentifiers);
    if (!ids.ok && ids.errors) {
      for (const e of ids.errors) errors.push({ field: `taxProfile.${e.field}`, message: e.message });
    } else {
      tpIdentifiers = ids.value;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value = {
    ...(tpCountry.value !== undefined && { country: tpCountry.value }),
    ...(tpType.value !== undefined && { registrationType: tpType.value }),
    ...(tpNumber.value !== undefined && { registrationNumber: tpNumber.value }),
    ...(tpSupply.value !== undefined && { placeOfSupply: tpSupply.value }),
    ...(tpTreatment !== undefined && { taxTreatment: tpTreatment }),
    ...(tpIdentifiers !== undefined && { taxIdentifiers: tpIdentifiers }),
    ...(tpState.value !== undefined && { state: tpState.value }),
  };
  return { ok: true, ...(Object.keys(value).length > 0 && { value }) };
}

/**
 * Validate standalone commercial defaults (Step 2.3, §12) — the defaults
 * applied to NEW projects only, never retroactively. An absent block is valid.
 */
export function validateClientCommercialDefaults(cd: ClientCreatePayload['commercialDefaults']): {
  ok: true;
  value?: { billingModel?: BillingModel; paymentTerms?: PaymentTerms; currency?: string };
} | { ok: false; errors: ClientFieldError[] } {
  if (!cd || typeof cd !== 'object') return { ok: true };
  const errors: ClientFieldError[] = [];

  const cdModel = enumIn(cd.billingModel, BILLING_MODELS, 'Billing model');
  if (!cdModel.ok) errors.push({ field: 'commercialDefaults.billingModel', message: cdModel.error! });
  const cdTerms = enumIn(cd.paymentTerms, PAYMENT_TERMS_ENUM, 'Payment terms');
  if (!cdTerms.ok) errors.push({ field: 'commercialDefaults.paymentTerms', message: cdTerms.error! });
  const cdCurrency = currency(cd.currency, 'Default currency');
  if (!cdCurrency.ok) errors.push({ field: 'commercialDefaults.currency', message: cdCurrency.error! });

  if (errors.length > 0) return { ok: false, errors };

  const value = {
    ...(cdModel.value !== undefined && { billingModel: cdModel.value }),
    ...(cdTerms.value !== undefined && { paymentTerms: cdTerms.value }),
    ...(cdCurrency.value !== undefined && { currency: cdCurrency.value }),
  };
  return { ok: true, ...(Object.keys(value).length > 0 && { value }) };
}

/**
 * Validate a client creation payload (Step 2.3). Returns either the typed,
 * trimmed creation input or a list of field errors. Nothing is coerced
 * silently: a bad field fails with its name.
 */
export function validateClientCreate(payload: ClientCreatePayload): {
  ok: true;
  value: {
    name: string;
    email?: string;
    legalName?: string;
    website?: string;
    phone?: string;
    industry?: string;
    notes?: string;
    primaryContact?: { name?: string; email?: string; phone?: string; role?: string };
    billingProfile?: { email?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string; currency?: string };
    taxProfile?: { country?: string; registrationType?: string; registrationNumber?: string; placeOfSupply?: string };
    commercialDefaults?: { billingModel?: BillingModel; paymentTerms?: PaymentTerms; currency?: string };
    status?: ClientStatus;
  };
} | { ok: false; errors: ClientFieldError[] } {
  const errors: ClientFieldError[] = [];

  const name = str(payload.name);
  if (!name) errors.push({ field: 'name', message: 'Client name is required' });
  else if (name.length > 120) errors.push({ field: 'name', message: 'Client name is too long (max 120 characters)' });

  const contactEmail = email(payload.email, 'Email');
  if (!contactEmail.ok) errors.push({ field: 'email', message: contactEmail.error! });
  const legalName = bounded(payload.legalName, 'Legal name', 200);
  if (!legalName.ok) errors.push({ field: 'legalName', message: legalName.error! });
  const website = bounded(payload.website, 'Website', 200);
  if (!website.ok) errors.push({ field: 'website', message: website.error! });
  const phone = bounded(payload.phone, 'Phone', 30);
  if (!phone.ok) errors.push({ field: 'phone', message: phone.error! });
  const industry = bounded(payload.industry, 'Industry', 100);
  if (!industry.ok) errors.push({ field: 'industry', message: industry.error! });
  const notes = bounded(payload.notes, 'Notes', 2000);
  if (!notes.ok) errors.push({ field: 'notes', message: notes.error! });
  const status = enumIn(payload.status, CLIENT_STATUSES, 'Status');
  if (!status.ok) errors.push({ field: 'status', message: status.error! });

  // Primary contact (§8) — one primary + flexible structure for future contacts
  let primaryContact: { name?: string; email?: string; phone?: string; role?: string } | undefined;
  if (payload.primaryContact && typeof payload.primaryContact === 'object') {
    const pc = payload.primaryContact;
    const pcName = bounded(pc.name, 'Contact name', 120);
    if (!pcName.ok) errors.push({ field: 'primaryContact.name', message: pcName.error! });
    const pcEmail = email(pc.email, 'Contact email');
    if (!pcEmail.ok) errors.push({ field: 'primaryContact.email', message: pcEmail.error! });
    const pcPhone = bounded(pc.phone, 'Contact phone', 30);
    if (!pcPhone.ok) errors.push({ field: 'primaryContact.phone', message: pcPhone.error! });
    const pcRole = bounded(pc.role, 'Contact role', 100);
    if (!pcRole.ok) errors.push({ field: 'primaryContact.role', message: pcRole.error! });
    primaryContact = {
      ...(pcName.value !== undefined && { name: pcName.value }),
      ...(pcEmail.value !== undefined && { email: pcEmail.value }),
      ...(pcPhone.value !== undefined && { phone: pcPhone.value }),
      ...(pcRole.value !== undefined && { role: pcRole.value }),
    };
  }

  // Billing profile (§9) — billing email ≠ contact email is allowed
  let billingProfile: { email?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string; currency?: string } | undefined;
  if (payload.billingProfile && typeof payload.billingProfile === 'object') {
    const bp = payload.billingProfile;
    const bpEmail = email(bp.email, 'Billing email');
    if (!bpEmail.ok) errors.push({ field: 'billingProfile.email', message: bpEmail.error! });
    const bpAddress = bounded(bp.address, 'Billing address', 300);
    if (!bpAddress.ok) errors.push({ field: 'billingProfile.address', message: bpAddress.error! });
    const bpCity = bounded(bp.city, 'City', 100);
    if (!bpCity.ok) errors.push({ field: 'billingProfile.city', message: bpCity.error! });
    const bpState = bounded(bp.state, 'State', 100);
    if (!bpState.ok) errors.push({ field: 'billingProfile.state', message: bpState.error! });
    const bpPostal = bounded(bp.postalCode, 'Postal code', 20);
    if (!bpPostal.ok) errors.push({ field: 'billingProfile.postalCode', message: bpPostal.error! });
    const bpCountry = bounded(bp.country, 'Country', 100);
    if (!bpCountry.ok) errors.push({ field: 'billingProfile.country', message: bpCountry.error! });
    const bpCurrency = currency(bp.currency, 'Billing currency');
    if (!bpCurrency.ok) errors.push({ field: 'billingProfile.currency', message: bpCurrency.error! });
    billingProfile = {
      ...(bpEmail.value !== undefined && { email: bpEmail.value }),
      ...(bpAddress.value !== undefined && { address: bpAddress.value }),
      ...(bpCity.value !== undefined && { city: bpCity.value }),
      ...(bpState.value !== undefined && { state: bpState.value }),
      ...(bpPostal.value !== undefined && { postalCode: bpPostal.value }),
      ...(bpCountry.value !== undefined && { country: bpCountry.value }),
      ...(bpCurrency.value !== undefined && { currency: bpCurrency.value }),
    };
  }

  // Tax profile (§11) — flexible, country-agnostic. Step 2.3 names this
  // validator explicitly so the tax rules stay reusable (e.g. when project
  // tax contexts arrive).
  const tax = validateClientTaxProfile(payload.taxProfile);
  if (!tax.ok) errors.push(...tax.errors);
  const taxProfile = tax.ok ? tax.value : undefined;

  // Commercial defaults (§12) — defaults for NEW projects, never retroactive.
  const commercial = validateClientCommercialDefaults(payload.commercialDefaults);
  if (!commercial.ok) errors.push(...commercial.errors);
  const commercialDefaults = commercial.ok ? commercial.value : undefined;

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name: name!,
      ...(contactEmail.value !== undefined && { email: contactEmail.value }),
      ...(legalName.value !== undefined && { legalName: legalName.value }),
      ...(website.value !== undefined && { website: website.value }),
      ...(phone.value !== undefined && { phone: phone.value }),
      ...(industry.value !== undefined && { industry: industry.value }),
      ...(notes.value !== undefined && { notes: notes.value }),
      ...(primaryContact && Object.keys(primaryContact).length > 0 && { primaryContact }),
      ...(billingProfile && Object.keys(billingProfile).length > 0 && { billingProfile }),
      ...(taxProfile !== undefined && { taxProfile }),
      ...(commercialDefaults !== undefined && { commercialDefaults }),
      ...(status.value !== undefined && { status: status.value }),
    },
  };
}

const PAYMENT_TERMS_ENUM: readonly PaymentTerms[] = [
  'DUE_ON_RECEIPT', 'NET_7', 'NET_15', 'NET_30', 'NET_45', 'NET_60', 'CUSTOM',
] as const;

// ---------- update (spec §25) ----------

/** Same field rules as create, but every field (including name) is optional. */
export function validateClientUpdate(payload: ClientCreatePayload): {
  ok: true;
  value: Partial<Omit<AgencyClient, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>;
} | { ok: false; errors: ClientFieldError[] } {
  // Partial update (spec §29): a name-less PATCH is legal. Create's validator
  // requires a name, so when name is absent we pass a placeholder and strip
  // it back out — every other field rule applies unchanged.
  const result = validateClientCreate(
    payload.name === undefined ? { ...payload, name: '—partial-update—' } : payload
  );
  if (!result.ok) return result;
  const { name, ...rest } = result.value;
  if (payload.name === undefined) {
    return { ok: true, value: rest };
  }
  return { ok: true, value: { name, ...rest } };
}

// ---------- status transition (spec §14) ----------

export function validateClientStatusTransition(from: ClientStatus, to: ClientStatus): {
  ok: true;
} | { ok: false; error: string } {
  if (from === to) return { ok: false, error: `Client is already ${from}` };
  if (!canTransitionClientStatus(from, to)) {
    return { ok: false, error: `Cannot move a client from ${from} to ${to}` };
  }
  return { ok: true };
}

export { normalizeClientName };
