/**
 * Module 12 (§33–§37, §46, §53, §113) — Unit: the payment-link surface.
 *
 *   - the validator: partial amount bounds, description, expiry forms
 *   - the §33 link state machine: CREATED → PARTIALLY_PAID → PAID, and the
 *     terminal states that can never go back
 *   - §53 the public projection: shortUrl and checkout info ONLY — a key
 *     secret can never leak through it
 *   - §36/§37 the SERVER resolves the amount: default = amountDue, a
 *     payload amount may only NARROW (exceeding the balance is a 400), and
 *     the browser's number is never the source of truth
 *   - §113 a missing invoice/link and another tenant's are identical 404s
 *   - §46 cancel: gateway FIRST, only a CREATED link, repeat-safe
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  getTenantById: vi.fn(async () => null), // Module 17 §15 — no stored tenant credentials (env fallback)
  getInvoiceById: vi.fn(async () => null),
  getPayments: vi.fn(async () => []),
  getClientById: vi.fn(async () => null),
  getPaymentLinks: vi.fn(async () => []),
  getPaymentLinkById: vi.fn(async () => null),
  createPaymentLink: vi.fn(),
  updatePaymentLink: vi.fn(async () => true),
}));

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import {
  getInvoiceById, getPayments, getClientById,
  getPaymentLinks, getPaymentLinkById,
  createPaymentLink as createPaymentLinkRepo, updatePaymentLink as updatePaymentLinkRepo,
} from '@/lib/db';
import {
  createInvoicePaymentLink, listInvoicePaymentLinks, cancelPaymentLink,
} from '@/lib/agency/domain/agency.payment-links';
import { validatePaymentLinkCreate } from '@/lib/agency/validators/payment-link';
import {
  canTransitionPaymentLinkStatus, toPublicPaymentLink,
} from '@/lib/agency/types/payment-link';
import { razorpayGateway } from '@/lib/agency/domain/razorpay-gateway';
import type { PaymentLink } from '@/lib/agency/types/payment-link';
import type { Invoice } from '@/lib/agency/types/invoice';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';

const TENANT = 'tenant-a';
const OTHER = 'tenant-b';
const ACTOR = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };
const audit = { username: 'admin-1', tenantId: TENANT, log: vi.fn() };

const mocked = {
  getInvoiceById: vi.mocked(getInvoiceById),
  getPayments: vi.mocked(getPayments),
  getClientById: vi.mocked(getClientById),
  getPaymentLinks: vi.mocked(getPaymentLinks),
  getPaymentLinkById: vi.mocked(getPaymentLinkById),
  createPaymentLinkRepo: vi.mocked(createPaymentLinkRepo),
  updatePaymentLinkRepo: vi.mocked(updatePaymentLinkRepo),
};

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId: TENANT, clientId: 'client-1',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-09-01', dueDate: '2026-09-30', currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'SENT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function link(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'link-1', tenantId: TENANT, invoiceId: 'inv-1', provider: 'RAZORPAY',
    providerLinkId: 'plink_1', shortUrl: 'https://rzp.io/i/example',
    amount: makeMoney(100000), status: 'CREATED',
    createdAt: new Date('2026-09-10'), updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

// getClientById returns the core Client type (§113 store-wins shape); only
// name/email are read by the domain.
const client = () => ({
  id: 'client-1', tenantId: TENANT, name: 'Acme Pvt Ltd',
  email: 'billing@acme.example',
} as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(razorpayGateway, 'createPaymentLink').mockResolvedValue({
    ok: true, status: 200, data: { gatewayLinkId: 'plink_new', url: 'https://rzp.io/i/new' },
  } as never);
  vi.spyOn(razorpayGateway, 'cancelPaymentLink').mockResolvedValue({
    ok: true, status: 200, data: null,
  } as never);
});

// ---------- the validator ----------

describe('validatePaymentLinkCreate (§35/§37)', () => {
  it('accepts an empty payload — everything is optional, the server resolves the amount', () => {
    const v = validatePaymentLinkCreate({}, (new Date('2026-09-13T00:00:00')));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.amount).toBeUndefined();
      expect(v.value.description).toBeUndefined();
      expect(v.value.expiresAt).toBeUndefined();
    }
  });

  it('accepts a positive partial amount', () => {
    const v = validatePaymentLinkCreate({ amount: 40000 }, (new Date('2026-09-13T00:00:00')));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.amount).toBe(40000);
  });

  it('rejects zero, negative, non-finite, and absurd amounts', () => {
    for (const amount of [0, -1, Number.NaN, 1e12 + 1]) {
      const v = validatePaymentLinkCreate({ amount }, new Date('2026-09-13T00:00:00'));
      expect(v.ok).toBe(false);
    }
  });

  it('trims and bounds the description (≤500)', () => {
    const v = validatePaymentLinkCreate({ description: '  Project retainer  ' }, (new Date('2026-09-13T00:00:00')));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.description).toBe('Project retainer');
    expect(validatePaymentLinkCreate({ description: 'x'.repeat(501) }, (new Date('2026-09-13T00:00:00'))).ok).toBe(false);
  });

  it('accepts a future full ISO expiry and a date-only expiry (end of that day)', () => {
    const iso = validatePaymentLinkCreate({ expiresAt: '2026-10-01T12:00:00.000Z' }, new Date('2026-09-13T00:00:00'));
    expect(iso.ok).toBe(true);
    if (iso.ok) expect(iso.value.expiresAt).toBe('2026-10-01T12:00:00.000Z');

    const dateOnly = validatePaymentLinkCreate({ expiresAt: '2026-10-01' }, new Date('2026-09-13T00:00:00'));
    expect(dateOnly.ok).toBe(true);
    // normalized through the same local-time parse the domain will invert
    if (dateOnly.ok) expect(dateOnly.value.expiresAt).toBe(new Date('2026-10-01T23:59:59').toISOString());
  });

  it('rejects a past expiry and garbage dates', () => {
    const now = new Date('2026-09-13T00:00:00');
    expect(validatePaymentLinkCreate({ expiresAt: '2026-09-01' }, now).ok).toBe(false);
    expect(validatePaymentLinkCreate({ expiresAt: 'not-a-date' }, now).ok).toBe(false);
  });

  it('deliberately has NO tenant/currency/account fields — §113: none of those come from the body', () => {
    const v = validatePaymentLinkCreate({ tenantId: OTHER, currency: 'USD', accountId: 'acct-x' }, (new Date('2026-09-13T00:00:00')));
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect((v.value as Record<string, unknown>).tenantId).toBeUndefined();
      expect((v.value as Record<string, unknown>).currency).toBeUndefined();
    }
  });
});

// ---------- the §33 state machine ----------

describe('the payment link state machine (§33)', () => {
  it('CREATED may become PARTIALLY_PAID, PAID, EXPIRED or CANCELLED', () => {
    for (const to of ['PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
      expect(canTransitionPaymentLinkStatus('CREATED', to)).toBe(true);
    }
  });

  it('PARTIALLY_PAID may only become PAID (money already moved — no cancel, no expiry)', () => {
    expect(canTransitionPaymentLinkStatus('PARTIALLY_PAID', 'PAID')).toBe(true);
    expect(canTransitionPaymentLinkStatus('PARTIALLY_PAID', 'CANCELLED')).toBe(false);
    expect(canTransitionPaymentLinkStatus('PARTIALLY_PAID', 'EXPIRED')).toBe(false);
  });

  it('PAID/EXPIRED/CANCELLED are terminal', () => {
    for (const from of ['PAID', 'EXPIRED', 'CANCELLED'] as const) {
      for (const to of ['CREATED', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
        expect(canTransitionPaymentLinkStatus(from, to)).toBe(false);
      }
    }
  });

  it('no state transitions to itself', () => {
    for (const s of ['CREATED', 'PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
      expect(canTransitionPaymentLinkStatus(s, s)).toBe(false);
    }
  });
});

// ---------- §53: the public projection ----------

describe('toPublicPaymentLink (§53)', () => {
  it('projects checkout info ONLY — no secrets, no internal ids beyond the document', () => {
    const stored = link({ expiresAt: new Date('2026-10-01T23:59:59') });
    const pub = toPublicPaymentLink(stored);
    expect(Object.keys(pub).sort()).toEqual([
      'amount', 'createdAt', 'expiresAt', 'id', 'invoiceId', 'provider', 'providerLinkId', 'shortUrl', 'status',
    ]);
    expect(pub.shortUrl).toBe('https://rzp.io/i/example');
    expect(pub.amount).toEqual({ amount: 100000, currency: 'INR' });
    expect(JSON.stringify(pub)).not.toContain('keySecret');
    expect(JSON.stringify(pub)).not.toContain('webhookSecret');
  });

  it('omits absent optional fields rather than nulling them', () => {
    const pub = toPublicPaymentLink(link({ shortUrl: undefined, expiresAt: undefined }));
    expect('shortUrl' in pub).toBe(false);
    expect('expiresAt' in pub).toBe(false);
  });
});

// ---------- §36/§37: create ----------

describe('createInvoicePaymentLink (§34–§37, §53, §113)', () => {
  it('§113 — a missing invoice and another tenant\'s invoice are identical 404s', async () => {
    // the store holds the invoice under the OTHER tenant — tenant-a sees nothing
    mocked.getInvoiceById.mockImplementation(async (_id: string, t: string) =>
      t === OTHER ? invoice({ tenantId: OTHER }) : null);
    const missing = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(missing).toMatchObject({ ok: false, status: 404 });

    const foreign = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(foreign).toMatchObject({ ok: false, status: 404 });
    // the gateway is never called for a foreign invoice
    expect(razorpayGateway.createPaymentLink).not.toHaveBeenCalled();
  });

  it('a DRAFT invoice → 409 (a draft carries no number, §74)', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice({ status: 'DRAFT', invoiceNumber: null }));
    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(res).toMatchObject({ ok: false, status: 409 });
    if (!res.ok) expect(res.error).toMatch(/draft/i);
  });

  it('a PAID invoice → 409 (nothing left to collect)', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice({ status: 'PAID' }));
    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it('§36 — an invoice with zero outstanding balance → 409', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPayments.mockResolvedValue([
      { id: 'pay-1', amount: makeMoney(100000), status: 'CONFIRMED' } as never,
    ]);
    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(razorpayGateway.createPaymentLink).not.toHaveBeenCalled();
  });

  it('§37 — the DEFAULT amount is the outstanding balance, computed by the server', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPayments.mockResolvedValue([
      { id: 'pay-1', amount: makeMoney(40000), status: 'CONFIRMED' } as never,
    ]);
    mocked.getClientById.mockResolvedValue(client());
    mocked.createPaymentLinkRepo.mockResolvedValue(link());

    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(res.ok).toBe(true);
    // the gateway was asked for the remaining 60000 — never the browser's word
    // (§15/17.15: the second argument is the tenant-credentials slot —
    // undefined here, the env-fallback deployment posture)
    expect(razorpayGateway.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { amount: 60000, currency: 'INR' } }),
      undefined
    );
    expect(audit.log).toHaveBeenCalledWith('PAYMENT_LINK_CREATED', expect.stringContaining('60000'));
  });

  it('§36 — a payload amount EXCEEDING the balance is a 400 (the ₹1-liar guard)', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPayments.mockResolvedValue([]);
    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', { amount: 100001 }, audit);
    expect(res).toMatchObject({ ok: false, status: 400, code: 'PAYMENT_LINK_AMOUNT_EXCEEDS_BALANCE' });
    expect(razorpayGateway.createPaymentLink).not.toHaveBeenCalled();
    expect(mocked.createPaymentLinkRepo).not.toHaveBeenCalled();
  });

  it('§37 — an explicit PARTIAL (≤ amountDue) is honoured and audited as one', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPayments.mockResolvedValue([]);
    mocked.getClientById.mockResolvedValue(client());
    mocked.createPaymentLinkRepo.mockResolvedValue(link({ amount: makeMoney(40000) }));

    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', { amount: 40000 }, audit);
    expect(res.ok).toBe(true);
    expect(razorpayGateway.createPaymentLink).toHaveBeenCalledWith(
      expect.objectContaining({ amount: { amount: 40000, currency: 'INR' } }),
      undefined
    );
    expect(audit.log).toHaveBeenCalledWith('PAYMENT_LINK_CREATED', expect.stringContaining('explicit partial'));
  });

  it('a gateway failure is fail-closed passthrough — NO link row is stored', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    vi.mocked(razorpayGateway.createPaymentLink).mockResolvedValue({
      ok: false, status: 503, error: 'Razorpay is not configured',
    } as never);
    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', {}, audit);
    expect(res).toMatchObject({ ok: false, status: 503, error: 'Razorpay is not configured' });
    expect(mocked.createPaymentLinkRepo).not.toHaveBeenCalled();
  });

  it('stores the link with the §33 shape and stamps CREATED', async () => {
    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPayments.mockResolvedValue([]);
    mocked.getClientById.mockResolvedValue(client());
    mocked.createPaymentLinkRepo.mockResolvedValue(link());

    const res = await createInvoicePaymentLink(TENANT, ACTOR, 'inv-1', { expiresAt: '2026-10-01' }, audit);
    expect(res.ok).toBe(true);
    expect(mocked.createPaymentLinkRepo).toHaveBeenCalledWith(TENANT, expect.objectContaining({
      invoiceId: 'inv-1',
      provider: 'RAZORPAY',
      providerLinkId: 'plink_new',
      shortUrl: 'https://rzp.io/i/new',
      // status is stamped CREATED by the repo itself, not by the domain
      expiresAt: new Date('2026-10-01T23:59:59'),
    }));
  });
});

// ---------- §55: list ----------

describe('listInvoicePaymentLinks (§34, §113)', () => {
  it('404s for a missing invoice; returns the link history for a real one', async () => {
    mocked.getInvoiceById.mockResolvedValue(null);
    const missing = await listInvoicePaymentLinks(TENANT, 'inv-1');
    expect(missing).toMatchObject({ ok: false, status: 404 });

    mocked.getInvoiceById.mockResolvedValue(invoice());
    mocked.getPaymentLinks.mockResolvedValue([
      link({ id: 'link-2', status: 'EXPIRED' }),
      link({ id: 'link-1', status: 'CREATED' }),
    ]);
    const res = await listInvoicePaymentLinks(TENANT, 'inv-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });
});

// ---------- §46: cancel ----------

describe('cancelPaymentLink (§46, §113)', () => {
  it('§113 — a missing link and another tenant\'s link are identical 404s', async () => {
    // the store holds the link under the OTHER tenant — tenant-a sees nothing
    mocked.getPaymentLinkById.mockImplementation(async (_id: string, t: string) =>
      t === OTHER ? link({ tenantId: OTHER }) : null);
    const missing = await cancelPaymentLink(TENANT, ACTOR, 'link-1', audit);
    expect(missing).toMatchObject({ ok: false, status: 404 });

    const foreign = await cancelPaymentLink(TENANT, ACTOR, 'link-1', audit);
    expect(foreign).toMatchObject({ ok: false, status: 404 });
    expect(razorpayGateway.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('only a CREATED link can be cancelled — money already moved cannot be un-moved', async () => {
    for (const status of ['PARTIALLY_PAID', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
      mocked.getPaymentLinkById.mockResolvedValue(link({ status }));
      const res = await cancelPaymentLink(TENANT, ACTOR, 'link-1', audit);
      expect(res).toMatchObject({ ok: false, status: 409 });
    }
    expect(razorpayGateway.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('the gateway is cancelled FIRST — a gateway failure leaves the stored status untouched', async () => {
    mocked.getPaymentLinkById.mockResolvedValue(link());
    vi.mocked(razorpayGateway.cancelPaymentLink).mockResolvedValue({
      ok: false, status: 502, error: 'gateway unreachable',
    } as never);
    const res = await cancelPaymentLink(TENANT, ACTOR, 'link-1', audit);
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(mocked.updatePaymentLinkRepo).not.toHaveBeenCalled();
  });

  it('success → CANCELLED + audit (§46: the gateway call is repeat-safe)', async () => {
    mocked.getPaymentLinkById
      .mockResolvedValueOnce(link())
      .mockResolvedValueOnce(link({ status: 'CANCELLED' }));
    const res = await cancelPaymentLink(TENANT, ACTOR, 'link-1', audit);
    expect(res.ok).toBe(true);
    expect(razorpayGateway.cancelPaymentLink).toHaveBeenCalledWith('plink_1', undefined);
    expect(mocked.updatePaymentLinkRepo).toHaveBeenCalledWith('link-1', TENANT, { status: 'CANCELLED' });
    expect(audit.log).toHaveBeenCalledWith('PAYMENT_LINK_CANCELLED', expect.any(String));
  });
});
