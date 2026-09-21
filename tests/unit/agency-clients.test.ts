/**
 * Module 2.8 — client contract unit tests (pure functions, no DB).
 *
 * Covers the spec rules that live in types + validators:
 *   - status lifecycle §14 (legal transitions, illegal hops, restore-only-from-ARCHIVED rule is domain)
 *   - normalization §18 (duplicate detection is case/whitespace-insensitive)
 *   - validation §31 (name required/trimmed/bounded, email format, phone
 *     bounded, currency 3-letter, status/billingModel/paymentTerms enums)
 *   - partial update §29 (name-less PATCH is legal)
 *   - §17 default-on-read: DEFAULT_CLIENT_STATUS
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionClientStatus, normalizeClientName, DEFAULT_CLIENT_STATUS,
  CLIENT_STATUSES, BILLING_MODELS,
} from '@/lib/agency/types/client';
import {
  validateClientCreate, validateClientUpdate, validateClientStatusTransition,
  validateClientTaxProfile, validateClientCommercialDefaults,
} from '@/lib/agency/validators/client';

describe('Module 2.8 unit — client status lifecycle (§14)', () => {
  it('allows PROSPECT → ACTIVE and PROSPECT → INACTIVE', () => {
    expect(canTransitionClientStatus('PROSPECT', 'ACTIVE')).toBe(true);
    expect(canTransitionClientStatus('PROSPECT', 'INACTIVE')).toBe(true);
  });

  it('allows ACTIVE ⇄ PAUSED and ACTIVE → INACTIVE', () => {
    expect(canTransitionClientStatus('ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransitionClientStatus('PAUSED', 'ACTIVE')).toBe(true);
    expect(canTransitionClientStatus('ACTIVE', 'INACTIVE')).toBe(true);
  });

  it('allows PAUSED → INACTIVE', () => {
    expect(canTransitionClientStatus('PAUSED', 'INACTIVE')).toBe(true);
  });

  it('allows INACTIVE → ARCHIVED and INACTIVE → ACTIVE (re-activation)', () => {
    expect(canTransitionClientStatus('INACTIVE', 'ARCHIVED')).toBe(true);
    expect(canTransitionClientStatus('INACTIVE', 'ACTIVE')).toBe(true);
  });

  it('allows ARCHIVED → INACTIVE only (restore, not re-activation)', () => {
    expect(canTransitionClientStatus('ARCHIVED', 'INACTIVE')).toBe(true);
    expect(canTransitionClientStatus('ARCHIVED', 'ACTIVE')).toBe(false);
  });

  it('rejects the common illegal hops', () => {
    // archive is reached from INACTIVE, not straight from ACTIVE (§14)
    expect(canTransitionClientStatus('ACTIVE', 'ARCHIVED')).toBe(false);
    expect(canTransitionClientStatus('PROSPECT', 'ARCHIVED')).toBe(false);
    expect(canTransitionClientStatus('PROSPECT', 'PAUSED')).toBe(false);
    expect(canTransitionClientStatus('ARCHIVED', 'PROSPECT')).toBe(false);
  });

  it('validates a same-state transition as an error, not a no-op', () => {
    expect(validateClientStatusTransition('ACTIVE', 'ACTIVE').ok).toBe(false);
  });

  it('validates an illegal hop with a human-readable error', () => {
    const r = validateClientStatusTransition('ACTIVE', 'ARCHIVED');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('ACTIVE');
  });
});

describe('Module 2.8 unit — duplicate normalization (§18)', () => {
  it('is case-insensitive', () => {
    expect(normalizeClientName('Acme Studio')).toBe(normalizeClientName('acme studio'));
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeClientName('  Acme  ')).toBe(normalizeClientName('Acme'));
  });

  it('collapses inner whitespace', () => {
    expect(normalizeClientName('Acme   Studio')).toBe('acme studio');
  });

  it('produces a deterministic key', () => {
    expect(normalizeClientName('  Foo\tBAR  qux ')).toBe('foo bar qux');
  });
});

describe('Module 2.8 unit — create validation (§31)', () => {
  it('requires a name', () => {
    const r = validateClientCreate({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'name')).toBe(true);
  });

  it('accepts a minimal valid payload and trims the name', () => {
    const r = validateClientCreate({ name: '  Acme  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('Acme');
  });

  it('rejects a name over 120 characters', () => {
    const r = validateClientCreate({ name: 'x'.repeat(121) });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed contact email when present', () => {
    const r = validateClientCreate({ name: 'Acme', email: 'not-an-email' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.field === 'email')).toBe(true);
  });

  it('rejects a malformed billing email independently of the contact email', () => {
    const r = validateClientCreate({ name: 'Acme', email: 'ops@acme.com', billingProfile: { email: 'bad' } });
    expect(r.ok).toBe(false);
  });

  it('rejects a phone over 30 characters', () => {
    const r = validateClientCreate({ name: 'Acme', phone: '9'.repeat(31) });
    expect(r.ok).toBe(false);
  });

  it('rejects a currency that is not 3 letters', () => {
    const r = validateClientCreate({ name: 'Acme', commercialDefaults: { currency: 'RUPEES' } });
    expect(r.ok).toBe(false);
  });

  it('accepts a 3-letter ISO-style currency (case-insensitive)', () => {
    const r = validateClientCreate({ name: 'Acme', commercialDefaults: { currency: 'inr' } });
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown status enum', () => {
    const r = validateClientCreate({ name: 'Acme', status: 'DELETED' });
    expect(r.ok).toBe(false);
  });

  it('accepts every declared status', () => {
    for (const s of CLIENT_STATUSES) {
      expect(validateClientCreate({ name: 'Acme', status: s }).ok).toBe(true);
    }
  });

  it('rejects an unknown billing model', () => {
    const r = validateClientCreate({ name: 'Acme', commercialDefaults: { billingModel: 'HOURLY' } });
    expect(r.ok).toBe(false);
  });

  it('accepts every declared billing model', () => {
    for (const m of BILLING_MODELS) {
      expect(validateClientCreate({ name: 'Acme', commercialDefaults: { billingModel: m } }).ok).toBe(true);
    }
  });

  it('rejects an unknown payment terms value', () => {
    const r = validateClientCreate({ name: 'Acme', commercialDefaults: { paymentTerms: 'NET_99' } });
    expect(r.ok).toBe(false);
  });

  it('accepts a full payload with nested profiles (§16 shape)', () => {
    const r = validateClientCreate({
      name: 'Acme Studio',
      email: 'ops@acme.com',
      primaryContact: { name: 'Priya', email: 'priya@acme.com', phone: '+91 90000 00000', role: 'Finance' },
      billingProfile: { email: 'accounts@acme.com', city: 'Mumbai', country: 'India', currency: 'INR' },
      taxProfile: { country: 'IN', registrationType: 'GSTIN', registrationNumber: '27AAAAA0000A1Z5', placeOfSupply: 'Maharashtra' },
      commercialDefaults: { billingModel: 'TIME_AND_MATERIALS', paymentTerms: 'NET_15', currency: 'INR' },
      status: 'PROSPECT',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.primaryContact?.name).toBe('Priya');
      expect(r.value.taxProfile?.registrationType).toBe('GSTIN');
      expect(r.value.status).toBe('PROSPECT');
    }
  });

  it('defaults status to ACTIVE on read when missing (§17/§106)', () => {
    expect(DEFAULT_CLIENT_STATUS).toBe('ACTIVE');
  });
});

describe('Module 2.8 unit — partial update validation (§29)', () => {
  it('accepts a PATCH with no name (partial update)', () => {
    const r = validateClientUpdate({ phone: '+91 90000 00000', notes: 'mornings' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBeUndefined();
      expect(r.value.phone).toBe('+91 90000 00000');
      expect(r.value.notes).toBe('mornings');
    }
  });

  it('keeps name validation when a rename IS present', () => {
    expect(validateClientUpdate({ name: '' }).ok).toBe(false);
    expect(validateClientUpdate({ name: 'x'.repeat(121) }).ok).toBe(false);
    const r = validateClientUpdate({ name: '  Renamed  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe('Renamed');
  });

  it('never leaks the placeholder name used for partial updates', () => {
    const r = validateClientUpdate({ notes: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.value)).not.toContain('partial-update');
  });

  it('still validates nested fields on partial updates', () => {
    const r = validateClientUpdate({ billingProfile: { email: 'bad' } });
    expect(r.ok).toBe(false);
  });

  it('still validates status enum on partial updates', () => {
    expect(validateClientUpdate({ status: 'DELETED' }).ok).toBe(false);
  });
});

describe('Module 2.8 unit — standalone profile validators (Step 2.3)', () => {
  it('validateClientTaxProfile accepts an absent profile', () => {
    expect(validateClientTaxProfile(undefined).ok).toBe(true);
    expect(validateClientTaxProfile({}).ok).toBe(true);
  });

  it('validateClientTaxProfile trims and returns only set fields (§11, country-agnostic)', () => {
    const r = validateClientTaxProfile({ country: '  Singapore  ', registrationNumber: 'T2025000A' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ country: 'Singapore', registrationNumber: 'T2025000A' });
    }
  });

  it('validateClientTaxProfile bounds every field', () => {
    expect(validateClientTaxProfile({ country: 'x'.repeat(101) }).ok).toBe(false);
    expect(validateClientTaxProfile({ registrationType: 'x'.repeat(51) }).ok).toBe(false);
    expect(validateClientTaxProfile({ registrationNumber: 'x'.repeat(51) }).ok).toBe(false);
    expect(validateClientTaxProfile({ placeOfSupply: 'x'.repeat(101) }).ok).toBe(false);
  });

  it('validateClientCommercialDefaults accepts an absent block', () => {
    expect(validateClientCommercialDefaults(undefined).ok).toBe(true);
    expect(validateClientCommercialDefaults({}).ok).toBe(true);
  });

  it('validateClientCommercialDefaults validates the enums and currency', () => {
    expect(validateClientCommercialDefaults({ billingModel: 'HOURLY' }).ok).toBe(false);
    expect(validateClientCommercialDefaults({ paymentTerms: 'NET_99' }).ok).toBe(false);
    expect(validateClientCommercialDefaults({ currency: 'rupees' }).ok).toBe(false);
    const r = validateClientCommercialDefaults({ billingModel: 'FIXED_FEE', paymentTerms: 'NET_30', currency: 'inr' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ billingModel: 'FIXED_FEE', paymentTerms: 'NET_30', currency: 'INR' });
    }
  });

  it('empty profile objects do not appear in the create value (reuse through create is exact)', () => {
    const r = validateClientCreate({ name: 'Acme', taxProfile: {}, commercialDefaults: {} });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.taxProfile).toBeUndefined();
      expect(r.value.commercialDefaults).toBeUndefined();
    }
  });
});
