/**
 * Agency Vertical — Validators: tax & compliance input (Module 11, §6–§9/§29)
 *
 * Reusable, framework-free validation — the same contract as validators/client:
 * pure (input) → { ok, value } | { ok: false, errors } functions with no
 * NextResponse coupling, so API routes and the domain service share them.
 *
 * Rules:
 *   - BillingProfile (§7): PARTIAL by design (merge-patch against the stored
 *     profile). legalName is the one required-once field — an agency without
 *     a legal name has no billing identity, but a partial PATCH may leave it
 *     untouched when it already exists.
 *   - taxIdentifiers (§9): full-replace semantics (present array replaces,
 *     absent leaves untouched, [] clears). A GSTIN-typed identifier must pass
 *     the SHAPE check (§30) — format only, never a registry lookup. Other
 *     identifier types are bounded strings: Money OS never assumes only GSTIN.
 *   - TaxProfile (§6): name + country + taxTreatment required on create;
 *     taxTreatment is the configurable vocabulary, never a UI label.
 */
import {
  isTaxTreatment, isValidGstinShape, isValidPanShape,
  type AgencyBillingProfile, type TaxIdentifier, type TaxProfile, type TaxTreatment,
} from '../types/tax';
import {
  isInvoiceTaxLineType, isServiceClassificationType,
  type InvoiceExemption, type InvoiceTaxLineInput,
  type LineClassification, type PlaceOfSupply, type ReverseCharge,
} from '../types/invoice';
import type { WithholdingRule } from '../types/withholding';
import { isBusinessDate } from '../types/dates';

export interface TaxFieldError {
  field: string;
  message: string;
}

export interface TaxValidated<T> {
  ok: boolean;
  value?: T;
  errors?: TaxFieldError[];
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_TAX_IDENTIFIERS = 20;

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

function bounded(v: unknown, label: string, max: number): TaxValidated<string | undefined> {
  const s = str(v);
  if (s === undefined) return { ok: true, value: undefined };
  if (s.length > max) return { ok: false, errors: [{ field: label, message: `${label} is too long (max ${max} characters)` }] };
  return { ok: true, value: s };
}

// ---------- §9 — tax identifiers ----------

export interface TaxIdentifiersPayload {
  taxIdentifiers?: unknown;
}

/**
 * Validate a taxIdentifiers[] payload. Returns the NORMALIZED array (values
 * trimmed, GSTIN/PAN upper-cased) or errors. An absent/undefined payload is
 * "do not touch" (value undefined); an explicit [] is a legal clear.
 */
export function validateTaxIdentifiers(v: unknown): TaxValidated<TaxIdentifier[] | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: [] };
  if (!Array.isArray(v)) {
    return { ok: false, errors: [{ field: 'taxIdentifiers', message: 'taxIdentifiers must be an array' }] };
  }
  if (v.length > MAX_TAX_IDENTIFIERS) {
    return { ok: false, errors: [{ field: 'taxIdentifiers', message: `Too many tax identifiers (max ${MAX_TAX_IDENTIFIERS})` }] };
  }

  const errors: TaxFieldError[] = [];
  const identifiers: TaxIdentifier[] = [];
  v.forEach((raw, i) => {
    const path = `taxIdentifiers[${i}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push({ field: path, message: `${path} must be an object` });
      return;
    }
    const entry = raw as { type?: unknown; value?: unknown; country?: unknown };
    const type = str(entry.type);
    const value = str(entry.value);
    if (!type) {
      errors.push({ field: `${path}.type`, message: `${path}.type is required (e.g. GSTIN, PAN, VAT, EIN, TIN)` });
    } else if (type.length > 30) {
      errors.push({ field: `${path}.type`, message: `${path}.type is too long (max 30 characters)` });
    }
    if (!value) {
      errors.push({ field: `${path}.value`, message: `${path}.value is required` });
    } else if (value.length > 50) {
      errors.push({ field: `${path}.value`, message: `${path}.value is too long (max 50 characters)` });
    } else if (type) {
      // §30 — SHAPE checks for the known formats only. Other jurisdictions'
      // identifier types are stored as bounded strings, never rejected for
      // not looking like a GSTIN.
      const normalizedType = type.toUpperCase();
      if (normalizedType === 'GSTIN' && !isValidGstinShape(value)) {
        errors.push({ field: `${path}.value`, message: `${path}.value is not a well-formed GSTIN (15 characters: state code + PAN + entity code + Z + checksum position)` });
      }
      if (normalizedType === 'PAN' && !isValidPanShape(value)) {
        errors.push({ field: `${path}.value`, message: `${path}.value is not a well-formed PAN (10 characters: 5 letters + 4 digits + 1 letter)` });
      }
    }
    const country = bounded(entry.country, `${path}.country`, 100);
    if (!country.ok && country.errors) errors.push(...country.errors);
    if (type && value && country.ok) {
      identifiers.push({
        type,
        value: type.toUpperCase() === 'GSTIN' || type.toUpperCase() === 'PAN' ? value.trim().toUpperCase() : value,
        ...(country.value !== undefined && { country: country.value }),
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: identifiers };
}

// ---------- §7 — agency billing profile ----------

export interface BillingProfilePayload {
  legalName?: unknown;
  displayName?: unknown;
  address?: unknown;
  country?: unknown;
  state?: unknown;
  postalCode?: unknown;
  taxRegistrationType?: unknown;
  taxRegistrationNumber?: unknown;
  taxIdentifiers?: unknown;
  defaultCurrency?: unknown;
  invoicePrefix?: unknown;
}

/**
 * Validate a billing-profile PATCH against the stored profile (null when none
 * exists yet). Partial: absent fields keep their stored value. legalName must
 * exist in the MERGED result — a first write without it is a real 400, and a
 * later PATCH may never clear it.
 */
export function validateBillingProfileUpdate(
  payload: BillingProfilePayload,
  existing: AgencyBillingProfile | null
): TaxValidated<Partial<AgencyBillingProfile>> {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [{ field: 'payload', message: 'Request body must be an object' }] };
  }
  const errors: TaxFieldError[] = [];

  const legalName = bounded(payload.legalName, 'legalName', 200);
  if (!legalName.ok && legalName.errors) errors.push(...legalName.errors);
  const displayName = bounded(payload.displayName, 'displayName', 200);
  if (!displayName.ok && displayName.errors) errors.push(...displayName.errors);
  const address = bounded(payload.address, 'address', 500);
  if (!address.ok && address.errors) errors.push(...address.errors);
  const country = bounded(payload.country, 'country', 100);
  if (!country.ok && country.errors) errors.push(...country.errors);
  const state = bounded(payload.state, 'state', 100);
  if (!state.ok && state.errors) errors.push(...state.errors);
  const postalCode = bounded(payload.postalCode, 'postalCode', 20);
  if (!postalCode.ok && postalCode.errors) errors.push(...postalCode.errors);
  const taxRegistrationType = bounded(payload.taxRegistrationType, 'taxRegistrationType', 50);
  if (!taxRegistrationType.ok && taxRegistrationType.errors) errors.push(...taxRegistrationType.errors);
  const taxRegistrationNumber = bounded(payload.taxRegistrationNumber, 'taxRegistrationNumber', 50);
  if (!taxRegistrationNumber.ok && taxRegistrationNumber.errors) errors.push(...taxRegistrationNumber.errors);

  const defaultCurrencyRaw = str(payload.defaultCurrency)?.toUpperCase();
  if (defaultCurrencyRaw !== undefined && !CURRENCY_RE.test(defaultCurrencyRaw)) {
    errors.push({ field: 'defaultCurrency', message: 'defaultCurrency must be a 3-letter ISO currency code (e.g. INR, USD)' });
  }

  // §23 — the invoice-number prefix: bounded, and restricted to the character
  // set that is safe inside an invoice number (letters, digits, dash).
  const invoicePrefix = bounded(payload.invoicePrefix, 'invoicePrefix', 20);
  if (invoicePrefix.ok && invoicePrefix.value !== undefined && !/^[A-Za-z0-9-]+$/.test(invoicePrefix.value)) {
    errors.push({ field: 'invoicePrefix', message: 'invoicePrefix may contain only letters, digits and dashes' });
  }

  const taxIdentifiers = validateTaxIdentifiers(payload.taxIdentifiers);
  if (!taxIdentifiers.ok && taxIdentifiers.errors) errors.push(...taxIdentifiers.errors);

  // legalName must survive the merge: required on first write, never clearable.
  const mergedLegalName = legalName.value ?? existing?.legalName;
  if (!mergedLegalName) {
    errors.push({ field: 'legalName', message: 'legalName is required to create the billing profile' });
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: Partial<AgencyBillingProfile> = {
    ...(legalName.value !== undefined && { legalName: legalName.value }),
    ...(displayName.value !== undefined && { displayName: displayName.value }),
    ...(address.value !== undefined && { address: address.value }),
    ...(country.value !== undefined && { country: country.value }),
    ...(state.value !== undefined && { state: state.value }),
    ...(postalCode.value !== undefined && { postalCode: postalCode.value }),
    ...(taxRegistrationType.value !== undefined && { taxRegistrationType: taxRegistrationType.value }),
    ...(taxRegistrationNumber.value !== undefined && { taxRegistrationNumber: taxRegistrationNumber.value }),
    ...(taxIdentifiers.value !== undefined && { taxIdentifiers: taxIdentifiers.value }),
    ...(defaultCurrencyRaw !== undefined && { defaultCurrency: defaultCurrencyRaw }),
    ...(invoicePrefix.value !== undefined && { invoicePrefix: invoicePrefix.value }),
  };
  return { ok: true, value };
}

// ---------- §6 — tenant tax profiles ----------

export interface TaxProfilePayload {
  name?: unknown;
  country?: unknown;
  registrationType?: unknown;
  registrationNumber?: unknown;
  taxTreatment?: unknown;
  stateOrRegion?: unknown;
  active?: unknown;
}

function validateTaxProfileFields(payload: TaxProfilePayload): {
  errors: TaxFieldError[];
  value: Partial<Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt'>>;
} {
  const errors: TaxFieldError[] = [];
  const name = bounded(payload.name, 'name', 200);
  if (!name.ok && name.errors) errors.push(...name.errors);
  const country = bounded(payload.country, 'country', 100);
  if (!country.ok && country.errors) errors.push(...country.errors);
  const registrationType = bounded(payload.registrationType, 'registrationType', 50);
  if (!registrationType.ok && registrationType.errors) errors.push(...registrationType.errors);
  const registrationNumber = bounded(payload.registrationNumber, 'registrationNumber', 50);
  if (!registrationNumber.ok && registrationNumber.errors) errors.push(...registrationNumber.errors);
  const stateOrRegion = bounded(payload.stateOrRegion, 'stateOrRegion', 100);
  if (!stateOrRegion.ok && stateOrRegion.errors) errors.push(...stateOrRegion.errors);

  let taxTreatment: TaxTreatment | undefined;
  if (payload.taxTreatment !== undefined) {
    if (!isTaxTreatment(payload.taxTreatment)) {
      errors.push({ field: 'taxTreatment', message: 'taxTreatment must be one of: REGISTERED, UNREGISTERED, EXEMPT, EXPORT, OTHER' });
    } else {
      taxTreatment = payload.taxTreatment;
    }
  }

  let active: boolean | undefined;
  if (payload.active !== undefined) {
    if (typeof payload.active !== 'boolean') {
      errors.push({ field: 'active', message: 'active must be a boolean' });
    } else {
      active = payload.active;
    }
  }

  // §30 — when the profile declares itself a GSTIN registration, the number
  // must at least be well-formed (SHAPE only, never a registry lookup).
  const normalizedRegType = registrationType.value?.toUpperCase();
  if (
    normalizedRegType === 'GSTIN'
    && registrationNumber.ok
    && registrationNumber.value !== undefined
    && !isValidGstinShape(registrationNumber.value)
  ) {
    errors.push({ field: 'registrationNumber', message: 'registrationNumber is not a well-formed GSTIN (15 characters)' });
  }

  const value: Partial<Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt'>> = {
    ...(name.value !== undefined && { name: name.value }),
    ...(country.value !== undefined && { country: country.value }),
    ...(registrationType.value !== undefined && { registrationType: registrationType.value }),
    ...(registrationNumber.value !== undefined && { registrationNumber: registrationNumber.value }),
    ...(taxTreatment !== undefined && { taxTreatment }),
    ...(stateOrRegion.value !== undefined && { stateOrRegion: stateOrRegion.value }),
    ...(active !== undefined && { active }),
  };
  return { errors, value };
}

/** Create (§6): name, country and taxTreatment are all required. */
export function validateTaxProfileCreate(payload: TaxProfilePayload): TaxValidated<Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>> {
  const { errors, value } = validateTaxProfileFields(payload);
  // Required-field errors fire only when the field is genuinely absent — a
  // field that already failed its own shape/bounds check does not also get
  // called "required".
  const hasError = (field: string) => errors.some(e => e.field === field);
  if (!value.name && !hasError('name')) errors.push({ field: 'name', message: 'name is required' });
  if (!value.country && !hasError('country')) errors.push({ field: 'country', message: 'country is required' });
  if (!value.taxTreatment && !hasError('taxTreatment')) errors.push({ field: 'taxTreatment', message: 'taxTreatment is required' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: value as Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'> };
}

/** Update: partial — only the sent fields change. */
export function validateTaxProfileUpdate(payload: TaxProfilePayload): TaxValidated<Partial<Omit<TaxProfile, 'id' | 'tenantId' | 'createdAt'>>> {
  const { errors, value } = validateTaxProfileFields(payload);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

// ---------- §11 — invoice tax line inputs ----------

const MAX_TAX_LINES = 10;
const MAX_RATE = 100;

/**
 * Validate a taxes[] payload for the taxation route (§11): each entry is
 * {type?, name, code?, rate, metadata?}. type is OPTIONAL (stored as OTHER
 * when absent) but must be in the closed vocabulary when present. Amounts
 * are NEVER accepted — the engine computes them (§78).
 */
export function validateTaxLineInputs(v: unknown): TaxValidated<InvoiceTaxLineInput[] | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: [] };
  if (!Array.isArray(v)) {
    return { ok: false, errors: [{ field: 'taxes', message: 'taxes must be an array' }] };
  }
  if (v.length > MAX_TAX_LINES) {
    return { ok: false, errors: [{ field: 'taxes', message: `Too many tax lines (max ${MAX_TAX_LINES})` }] };
  }
  const errors: TaxFieldError[] = [];
  const taxes: InvoiceTaxLineInput[] = [];
  v.forEach((raw, i) => {
    const path = `taxes[${i}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push({ field: path, message: `${path} must be an object` });
      return;
    }
    const entry = raw as { type?: unknown; name?: unknown; code?: unknown; rate?: unknown; metadata?: unknown };

    if (entry.type !== undefined && !isInvoiceTaxLineType(entry.type)) {
      errors.push({ field: `${path}.type`, message: `${path}.type must be one of: CGST, SGST, IGST, CESS, OTHER` });
    }
    const name = str(entry.name);
    if (!name) errors.push({ field: `${path}.name`, message: `${path}.name is required` });
    else if (name.length > 100) errors.push({ field: `${path}.name`, message: `${path}.name is too long (max 100 characters)` });
    const code = bounded(entry.code, `${path}.code`, 50);
    if (!code.ok && code.errors) errors.push(...code.errors);

    if (typeof entry.rate !== 'number' || !Number.isFinite(entry.rate) || entry.rate < 0 || entry.rate > MAX_RATE) {
      errors.push({ field: `${path}.rate`, message: `${path}.rate must be a number between 0 and ${MAX_RATE}` });
    }
    const metadata = entry.metadata !== undefined && typeof entry.metadata === 'object' && entry.metadata !== null
      ? entry.metadata as Record<string, unknown>
      : undefined;

    if (errors.every(e => !e.field.startsWith(path))) {
      taxes.push({
        ...(isInvoiceTaxLineType(entry.type) && { type: entry.type }),
        name: name!,
        ...(code.value !== undefined && { code: code.value }),
        rate: entry.rate as number,
        ...(metadata !== undefined && { metadata }),
      });
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: taxes };
}

// ---------- §15/§16/§17 — invoice compliance fields ----------

/** §15 — the place of supply USED for the invoice: country + state/region
 *  required, optional code. Stored configuration, never a determination. */
export function validatePlaceOfSupply(v: unknown): TaxValidated<PlaceOfSupply | null | undefined> {
  if (v === undefined) return { ok: true, value: undefined }; // do-not-touch
  if (v === null) return { ok: true, value: null };           // clear
  if (typeof v !== 'object') {
    return { ok: false, errors: [{ field: 'placeOfSupply', message: 'placeOfSupply must be an object' }] };
  }
  const entry = v as { country?: unknown; stateOrRegion?: unknown; code?: unknown };
  const errors: TaxFieldError[] = [];
  const country = bounded(entry.country, 'placeOfSupply.country', 100);
  if (!country.ok && country.errors) errors.push(...country.errors);
  const stateOrRegion = bounded(entry.stateOrRegion, 'placeOfSupply.stateOrRegion', 100);
  if (!stateOrRegion.ok && stateOrRegion.errors) errors.push(...stateOrRegion.errors);
  const code = bounded(entry.code, 'placeOfSupply.code', 20);
  if (!code.ok && code.errors) errors.push(...code.errors);
  if (!country.value) errors.push({ field: 'placeOfSupply.country', message: 'placeOfSupply.country is required' });
  if (!stateOrRegion.value) errors.push({ field: 'placeOfSupply.stateOrRegion', message: 'placeOfSupply.stateOrRegion is required' });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      country: country.value!,
      stateOrRegion: stateOrRegion.value!,
      ...(code.value !== undefined && { code: code.value }),
    },
  };
}

/** §16 — reverseCharge is a bare {applicable: boolean}. No intelligence. */
export function validateReverseCharge(v: unknown): TaxValidated<ReverseCharge | null | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== 'object') {
    return { ok: false, errors: [{ field: 'reverseCharge', message: 'reverseCharge must be an object' }] };
  }
  const { applicable } = v as { applicable?: unknown };
  if (typeof applicable !== 'boolean') {
    return { ok: false, errors: [{ field: 'reverseCharge.applicable', message: 'reverseCharge.applicable must be a boolean' }] };
  }
  return { ok: true, value: { applicable } };
}

/** §17 — exemption needs a reason; the reference is optional. */
export function validateExemption(v: unknown): TaxValidated<InvoiceExemption | null | undefined> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== 'object') {
    return { ok: false, errors: [{ field: 'exemption', message: 'exemption must be an object' }] };
  }
  const entry = v as { reason?: unknown; reference?: unknown };
  const errors: TaxFieldError[] = [];
  const reason = bounded(entry.reason, 'exemption.reason', 300);
  if (!reason.ok && reason.errors) errors.push(...reason.errors);
  const reference = bounded(entry.reference, 'exemption.reference', 200);
  if (!reference.ok && reference.errors) errors.push(...reference.errors);
  if (!reason.value) errors.push({ field: 'exemption.reason', message: 'exemption.reason is required (why the invoice carries no tax)' });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { reason: reason.value!, ...(reference.value !== undefined && { reference: reference.value }) },
  };
}

/** §13/§14 — a line's HSN/SAC classification: {type, code}, never defaulted. */
export function validateClassification(v: unknown): TaxValidated<LineClassification | undefined> {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (typeof v !== 'object') {
    return { ok: false, errors: [{ field: 'classification', message: 'classification must be an object' }] };
  }
  const entry = v as { type?: unknown; code?: unknown };
  const errors: TaxFieldError[] = [];
  if (!isServiceClassificationType(entry.type)) {
    errors.push({ field: 'classification.type', message: 'classification.type must be HSN or SAC' });
  }
  const code = bounded(entry.code, 'classification.code', 20);
  if (!code.ok && code.errors) errors.push(...code.errors);
  if (!code.value) errors.push({ field: 'classification.code', message: 'classification.code is required' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { type: entry.type as LineClassification['type'], code: code.value! } };
}

// ---------- §19 — withholding rule configuration ----------

export interface WithholdingRulePayload {
  jurisdiction?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  ruleCode?: unknown;
  rate?: unknown;
  threshold?: unknown;
  conditions?: unknown;
  active?: unknown;
}

const MAX_RULE_CODE = 50;
const MAX_JURISDICTION = 10;

/** §19 — the validated write shape. effectiveTo/threshold may be explicitly
 *  null: null CLEARS the window end / threshold (absent = untouched). They are
 *  omitted from the base and re-declared — an intersection with the base's
 *  `string | undefined` would silently drop the null. */
export type ValidatedWithholdingRuleFields =
  Partial<Omit<WithholdingRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'effectiveTo' | 'threshold'>> & {
    effectiveTo?: string | null;
    threshold?: number | null;
  };

function validateWithholdingRuleFields(payload: WithholdingRulePayload): {
  errors: TaxFieldError[];
  value: ValidatedWithholdingRuleFields;
} {
  const errors: TaxFieldError[] = [];

  const jurisdiction = bounded(payload.jurisdiction, 'jurisdiction', MAX_JURISDICTION);
  if (!jurisdiction.ok && jurisdiction.errors) errors.push(...jurisdiction.errors);
  const ruleCode = bounded(payload.ruleCode, 'ruleCode', MAX_RULE_CODE);
  if (!ruleCode.ok && ruleCode.errors) errors.push(...ruleCode.errors);

  // §19 — the dates are the rule's effectivity window (inclusive both ends).
  // effectiveTo absent = open-ended; explicitly null clears it.
  let effectiveFrom: string | undefined;
  if (payload.effectiveFrom !== undefined) {
    const s = str(payload.effectiveFrom);
    if (!s || !isBusinessDate(s)) {
      errors.push({ field: 'effectiveFrom', message: 'effectiveFrom must be a valid date (YYYY-MM-DD)' });
    } else {
      effectiveFrom = s;
    }
  }
  let effectiveTo: string | undefined | null;
  if (payload.effectiveTo !== undefined) {
    if (payload.effectiveTo === null) {
      effectiveTo = null; // clear the window end
    } else {
      const s = str(payload.effectiveTo);
      if (!s || !isBusinessDate(s)) {
        errors.push({ field: 'effectiveTo', message: 'effectiveTo must be a valid date (YYYY-MM-DD) or null' });
      } else {
        effectiveTo = s;
      }
    }
  }
  if (effectiveFrom !== undefined && effectiveTo !== undefined && effectiveTo !== null && effectiveTo < effectiveFrom) {
    errors.push({ field: 'effectiveTo', message: 'effectiveTo cannot be before effectiveFrom' });
  }

  let rate: number | undefined;
  if (payload.rate !== undefined) {
    if (typeof payload.rate !== 'number' || !Number.isFinite(payload.rate) || payload.rate < 0 || payload.rate > MAX_RATE) {
      errors.push({ field: 'rate', message: `rate must be a number between 0 and ${MAX_RATE} (percent)` });
    } else {
      rate = payload.rate;
    }
  }

  let threshold: number | undefined | null;
  if (payload.threshold !== undefined) {
    if (payload.threshold === null) {
      threshold = null; // clear the threshold
    } else if (typeof payload.threshold !== 'number' || !Number.isFinite(payload.threshold) || payload.threshold < 0) {
      errors.push({ field: 'threshold', message: 'threshold must be a non-negative number or null' });
    } else {
      threshold = payload.threshold;
    }
  }

  const conditions = payload.conditions !== undefined && typeof payload.conditions === 'object' && payload.conditions !== null
    ? payload.conditions as Record<string, unknown>
    : undefined;

  let active: boolean | undefined;
  if (payload.active !== undefined) {
    if (typeof payload.active !== 'boolean') {
      errors.push({ field: 'active', message: 'active must be a boolean' });
    } else {
      active = payload.active;
    }
  }

  const value: ValidatedWithholdingRuleFields = {
    ...(jurisdiction.value !== undefined && { jurisdiction: jurisdiction.value.toUpperCase() }),
    ...(effectiveFrom !== undefined && { effectiveFrom }),
    ...(payload.effectiveTo !== undefined && { effectiveTo }),
    ...(ruleCode.value !== undefined && { ruleCode: ruleCode.value }),
    ...(rate !== undefined && { rate }),
    ...(payload.threshold !== undefined && { threshold }),
    ...(conditions !== undefined && { conditions }),
    ...(active !== undefined && { active }),
  };
  return { errors, value };
}

/** §19 — create: jurisdiction, effectiveFrom, ruleCode and rate required. */
export function validateWithholdingRuleCreate(
  payload: WithholdingRulePayload
): TaxValidated<Omit<WithholdingRule, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>> {
  const { errors, value } = validateWithholdingRuleFields(payload);
  const hasError = (field: string) => errors.some(e => e.field === field);
  if (!value.jurisdiction && !hasError('jurisdiction')) errors.push({ field: 'jurisdiction', message: 'jurisdiction is required' });
  if (!value.effectiveFrom && !hasError('effectiveFrom')) errors.push({ field: 'effectiveFrom', message: 'effectiveFrom is required' });
  if (!value.ruleCode && !hasError('ruleCode')) errors.push({ field: 'ruleCode', message: 'ruleCode is required' });
  if (value.rate === undefined && !hasError('rate')) errors.push({ field: 'rate', message: 'rate is required' });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      jurisdiction: value.jurisdiction!,
      effectiveFrom: value.effectiveFrom!,
      ...(value.effectiveTo != null && { effectiveTo: value.effectiveTo }),
      ruleCode: value.ruleCode!,
      rate: value.rate!,
      ...(value.threshold != null && { threshold: value.threshold }),
      ...(value.conditions !== undefined && { conditions: value.conditions }),
      active: value.active ?? true,
    },
  };
}

/** §19 — update: partial; only the sent fields change. */
export function validateWithholdingRuleUpdate(
  payload: WithholdingRulePayload
): TaxValidated<ValidatedWithholdingRuleFields> {
  const { errors, value } = validateWithholdingRuleFields(payload);
  if (errors.length > 0) return { ok: false, errors };
  if (Object.keys(value).length === 0) {
    return { ok: false, errors: [{ field: 'payload', message: 'Nothing to update' }] };
  }
  return { ok: true, value };
}
