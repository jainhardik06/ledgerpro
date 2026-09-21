/**
 * Module 11 (Sprints 11.1–11.3 / §6–§9, §30) — Unit: tax types & validators.
 *
 * Pure tests, no db mocks. Pins:
 *   - §30 GSTIN/PAN SHAPE validation: format only, tolerant of case/whitespace,
 *     every malformed shape rejected — and NEVER a registry claim.
 *   - §9 taxIdentifiers: GSTIN-typed identifiers shape-checked; other types
 *     (VAT/EIN/TIN) are bounded strings, never rejected for not being GSTINs.
 *   - §7 BillingProfile: partial merge-patch; legalName required once and
 *     never clearable; taxIdentifiers full-replace; [] is a legal clear.
 *   - §6 TaxProfile: name/country/taxTreatment required on create; the
 *     configurable vocabulary (REGISTERED/UNREGISTERED/EXEMPT/EXPORT/OTHER).
 */
import { describe, expect, it } from 'vitest';
import {
  isValidGstinShape, isValidPanShape, isTaxTreatment,
} from '@/lib/agency/types/tax';
import {
  validateBillingProfileUpdate, validateTaxIdentifiers,
  validateTaxProfileCreate, validateTaxProfileUpdate,
} from '@/lib/agency/validators/tax';
import { validateClientTaxProfile } from '@/lib/agency/validators/client';

// ---------- §30 — GSTIN / PAN shape ----------

describe('Module 11 §30 — GSTIN shape validation (format, never registry)', () => {
  it('accepts well-formed GSTINs', () => {
    // 27 (Maharashtra) + PAN AAPFU0939F + entity code 1 + Z + checksum slot V
    expect(isValidGstinShape('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstinShape('29AAFCA5212M1Z8')).toBe(true);
    expect(isValidGstinShape('07AAECG1234A1Z9')).toBe(true);
  });

  it('is case/whitespace tolerant — shape only', () => {
    expect(isValidGstinShape('  27aapfu0939f1zv ')).toBe(true);
  });

  it('rejects every malformed shape', () => {
    expect(isValidGstinShape('27AAPFU0939F1Z')).toBe(false);      // 14 chars
    expect(isValidGstinShape('27AAPFU0939F1ZV1')).toBe(false);    // 16 chars
    expect(isValidGstinShape('2AAPFU0939F1ZV')).toBe(false);      // 1-digit state code
    expect(isValidGstinShape('X7AAPFU0939F1ZV')).toBe(false);     // letter state code
    expect(isValidGstinShape('271APFU0939F1ZV')).toBe(false);     // digit where PAN letters belong
    expect(isValidGstinShape('27AAPFU09X9F1ZV')).toBe(false);    // letter inside the PAN digit run
    expect(isValidGstinShape('27AAPFU0939F1YV')).toBe(false);     // the literal Z position
    expect(isValidGstinShape('')).toBe(false);
    expect(isValidGstinShape('not a gstin')).toBe(false);
  });

  it('PAN shape: 5 letters + 4 digits + 1 letter', () => {
    expect(isValidPanShape('AAPFU0939F')).toBe(true);
    expect(isValidPanShape(' aapfu0939f ')).toBe(true);
    expect(isValidPanShape('AAPFU0939')).toBe(false);
    expect(isValidPanShape('AAPFU0939FF')).toBe(false);
    expect(isValidPanShape('0939AAPFUA')).toBe(false);
  });
});

// ---------- §6 — the configurable tax-treatment vocabulary ----------

describe('Module 11 §6 — tax treatment vocabulary', () => {
  it('accepts exactly the five configurable treatments', () => {
    for (const t of ['REGISTERED', 'UNREGISTERED', 'EXEMPT', 'EXPORT', 'OTHER']) {
      expect(isTaxTreatment(t)).toBe(true);
    }
    expect(isTaxTreatment('GST')).toBe(false);
    expect(isTaxTreatment('registered')).toBe(false); // case-sensitive vocabulary
    expect(isTaxTreatment(undefined)).toBe(false);
  });
});

// ---------- §9 — tax identifiers ----------

describe('Module 11 §9 — taxIdentifiers validation', () => {
  it('a GSTIN-typed identifier must pass the shape check', () => {
    const v = validateTaxIdentifiers([{ type: 'GSTIN', value: '27AAPFU0939F1ZV' }]);
    expect(v.ok).toBe(true);
    expect(v.value).toEqual([{ type: 'GSTIN', value: '27AAPFU0939F1ZV' }]);
  });

  it('normalizes GSTIN/PAN values to upper case', () => {
    const v = validateTaxIdentifiers([{ type: 'gstin', value: '27aapfu0939f1zv' }]);
    expect(v.ok).toBe(true);
    expect(v.value?.[0].value).toBe('27AAPFU0939F1ZV');
    expect(v.value?.[0].type).toBe('gstin'); // type string is preserved verbatim
  });

  it('a malformed GSTIN is a real 400, never silently stored', () => {
    const v = validateTaxIdentifiers([{ type: 'GSTIN', value: '27AAPFU0939F1Z' }]);
    expect(v.ok).toBe(false);
    expect(v.errors?.[0].field).toBe('taxIdentifiers[0].value');
  });

  it('VAT/EIN/TIN identifiers are bounded strings — the DB is never GSTIN-only', () => {
    const v = validateTaxIdentifiers([
      { type: 'VAT', value: 'DE123456789', country: 'DE' },
      { type: 'EIN', value: '12-3456789', country: 'US' },
    ]);
    expect(v.ok).toBe(true);
    expect(v.value).toHaveLength(2);
  });

  it('absent = do-not-touch (undefined), explicit [] = clear', () => {
    expect(validateTaxIdentifiers(undefined).value).toBeUndefined();
    expect(validateTaxIdentifiers([]).value).toEqual([]);
  });

  it('rejects missing type/value and non-array payloads', () => {
    expect(validateTaxIdentifiers([{ value: '27AAPFU0939F1ZV' }]).ok).toBe(false);
    expect(validateTaxIdentifiers([{ type: 'GSTIN' }]).ok).toBe(false);
    expect(validateTaxIdentifiers('GSTIN').ok).toBe(false);
  });
});

// ---------- §7 — agency billing profile ----------

describe('Module 11 §7 — billing profile merge-patch', () => {
  it('a first write without legalName is a real 400 — no anonymous issuer', () => {
    const v = validateBillingProfileUpdate({ country: 'IN' }, null);
    expect(v.ok).toBe(false);
    expect(v.errors?.some(e => e.field === 'legalName')).toBe(true);
  });

  it('legalName alone creates the profile', () => {
    const v = validateBillingProfileUpdate({ legalName: 'Atlas Digital Private Limited' }, null);
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ legalName: 'Atlas Digital Private Limited' });
  });

  it('a later partial PATCH keeps the stored legalName (merge, not replace)', () => {
    const v = validateBillingProfileUpdate(
      { country: 'IN', state: 'Maharashtra' },
      { legalName: 'Atlas Digital Private Limited' }
    );
    expect(v.ok).toBe(true);
    // The validator returns only the CHANGED fields; the domain merges — the
    // required-legalName check passed because the stored value survives.
    expect(v.value).toEqual({ country: 'IN', state: 'Maharashtra' });
  });

  it('legalName can never be cleared — an empty PATCH value is a no-op that keeps the stored name', () => {
    const v = validateBillingProfileUpdate({ legalName: '   ' }, { legalName: 'Atlas Digital Private Limited' });
    // The whitespace value trims to undefined; the merged result still carries
    // the stored legalName, so the required-once rule holds with no error.
    expect(v.ok).toBe(true);
    expect(v.value?.legalName).toBeUndefined(); // unchanged field is simply not in the patch
  });

  it('taxIdentifiers replace wholesale, with GSTIN shape enforced', () => {
    const v = validateBillingProfileUpdate({
      legalName: 'Atlas Digital Private Limited',
      taxIdentifiers: [
        { type: 'GSTIN', value: '27AAPFU0939F1ZV' },
        { type: 'PAN', value: 'AAPFU0939F' },
      ],
    }, null);
    expect(v.ok).toBe(true);
    expect(v.value?.taxIdentifiers).toHaveLength(2);

    const bad = validateBillingProfileUpdate({
      legalName: 'Atlas Digital Private Limited',
      taxIdentifiers: [{ type: 'GSTIN', value: 'NOPE' }],
    }, null);
    expect(bad.ok).toBe(false);
  });

  it('defaultCurrency must be a 3-letter code; invoicePrefix is charset-bounded', () => {
    expect(validateBillingProfileUpdate({ legalName: 'A', defaultCurrency: 'inr' }, null).ok).toBe(true);
    expect(validateBillingProfileUpdate({ legalName: 'A', defaultCurrency: 'RUPEE' }, null).ok).toBe(false);
    expect(validateBillingProfileUpdate({ legalName: 'A', invoicePrefix: 'INV-2026' }, null).ok).toBe(true);
    expect(validateBillingProfileUpdate({ legalName: 'A', invoicePrefix: 'INV 2026' }, null).ok).toBe(false);
  });
});

// ---------- §6 — tax profile create/update ----------

describe('Module 11 §6 — tax profile validation', () => {
  it('create requires name, country and taxTreatment', () => {
    expect(validateTaxProfileCreate({ name: 'GST Registered' }).ok).toBe(false);
    expect(validateTaxProfileCreate({ name: 'GST Registered', country: 'IN' }).ok).toBe(false);
    const v = validateTaxProfileCreate({
      name: 'GST Registered — Maharashtra',
      country: 'IN',
      taxTreatment: 'REGISTERED',
      stateOrRegion: 'Maharashtra',
    });
    expect(v.ok).toBe(true);
    expect(v.value).toMatchObject({ name: 'GST Registered — Maharashtra', country: 'IN', taxTreatment: 'REGISTERED' });
  });

  it('a GSTIN-typed registrationNumber must be well-formed (§30)', () => {
    const bad = validateTaxProfileCreate({
      name: 'GST Registered', country: 'IN', taxTreatment: 'REGISTERED',
      registrationType: 'GSTIN', registrationNumber: '27AAPFU0939F1Z',
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors?.some(e => e.field === 'registrationNumber')).toBe(true);

    const good = validateTaxProfileCreate({
      name: 'GST Registered', country: 'IN', taxTreatment: 'REGISTERED',
      registrationType: 'GSTIN', registrationNumber: '27AAPFU0939F1ZV',
    });
    expect(good.ok).toBe(true);
  });

  it('non-GSTIN registration types are never shape-checked against GSTIN rules', () => {
    const v = validateTaxProfileCreate({
      name: 'EU VAT', country: 'DE', taxTreatment: 'REGISTERED',
      registrationType: 'VAT', registrationNumber: 'DE123456789',
    });
    expect(v.ok).toBe(true);
  });

  it('update is partial: only sent fields change', () => {
    const v = validateTaxProfileUpdate({ active: false });
    expect(v.ok).toBe(true);
    expect(v.value).toEqual({ active: false });

    expect(validateTaxProfileUpdate({ taxTreatment: 'ZERO_RATED' }).ok).toBe(false);
  });
});

// ---------- §8/§9 — client tax profile extension ----------

describe('Module 11 §8/§9 — client tax profile extension', () => {
  it('accepts the Module 11 fields through the existing client validator', () => {
    const v = validateClientTaxProfile({
      country: 'IN',
      state: 'Karnataka',
      taxTreatment: 'REGISTERED',
      taxIdentifiers: [{ type: 'GSTIN', value: '29AAFCA5212M1Z8' }],
    });
    expect(v.ok).toBe(true);
    // Module 2 TS lesson: capture the narrowed value — expect() does not narrow.
    const value = v.ok ? v.value : undefined;
    expect(value).toMatchObject({
      country: 'IN', state: 'Karnataka', taxTreatment: 'REGISTERED',
      taxIdentifiers: [{ type: 'GSTIN', value: '29AAFCA5212M1Z8' }],
    });
  });

  it('rejects a bad taxTreatment and a malformed GSTIN identifier', () => {
    expect(validateClientTaxProfile({ taxTreatment: 'COMPOSITE' }).ok).toBe(false);
    expect(validateClientTaxProfile({
      taxIdentifiers: [{ type: 'GSTIN', value: 'BAD' }],
    }).ok).toBe(false);
  });

  it('an empty/absent profile stays valid — clients without tax data are legal', () => {
    expect(validateClientTaxProfile(undefined).ok).toBe(true);
    expect(validateClientTaxProfile({}).ok).toBe(true);
    // A VAT client (international) is exactly as valid as a GST client.
    expect(validateClientTaxProfile({
      country: 'DE', taxTreatment: 'REGISTERED',
      taxIdentifiers: [{ type: 'VAT', value: 'DE123456789' }],
    }).ok).toBe(true);
  });
});
