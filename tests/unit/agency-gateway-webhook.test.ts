/**
 * Module 10 §96–§99/§113–§115 + 10F replay/recovery, Module 12 §38–§50 —
 * Unit: the webhook intake service outcome matrix.
 *
 * Every path through processRazorpayWebhook, with the db and the payment
 * domain MOCKED (the razorpay adapter itself is real — its signature check
 * runs against a test secret; getPayment is spied for the §48 fetch):
 *   - §97  signature first, fail closed (401), no db read before it passes
 *   - §42  the WebhookEvent store: every parseable delivery is recorded;
 *          PROCESSED/IGNORED replays ack with ZERO writes; FAILED re-runs
 *   - §99  a non-PENDING stored payment → replay ack, zero writes
 *   - §113 the store resolves tenant/invoice/amount — the payload's numbers
 *          never reach the domain
 *   - §115 business rejection → ERROR stamp + 200 ack;
 *          transient 500 → 500 ack (the gateway retry IS the recovery)
 *   - §40  link cancelled/expired/partially_paid lifecycle events
 *   - §48/§49 the link money path: fetch the AUTHORITATIVE payment, verify
 *          against stored facts, record + confirm through the NORMAL path;
 *          a mismatch records PENDING+ERROR and creates NO transaction
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/db', () => ({
  createLog: vi.fn(async () => undefined),
  // Module 17 §51 — multi-secret verification scans tenants; none stored here.
  getTenantById: vi.fn(async () => null),
  getTenants: vi.fn(async () => []),
  findPaymentByGatewayId: vi.fn(async () => null),
  getPaymentById: vi.fn(async () => null),
  updatePayment: vi.fn(async () => true),
  getInvoiceById: vi.fn(async () => null),
  getPayments: vi.fn(async () => []),
  createPayment: vi.fn(async () => null),
  findPaymentLinkByProviderLinkId: vi.fn(async () => null),
  updatePaymentLink: vi.fn(async () => true),
  findWebhookEventByProviderEventId: vi.fn(async () => null),
  createWebhookEvent: vi.fn(async () => null),
  updateWebhookEvent: vi.fn(async () => true),
}));

vi.mock('@/lib/agency/domain/agency.payments', () => ({
  confirmPayment: vi.fn(async () => ({ ok: false, status: 500, error: 'unstubbed' })),
  failPayment: vi.fn(async () => ({ ok: false, status: 500, error: 'unstubbed' })),
  recordManualPayment: vi.fn(async () => ({ ok: false, status: 500, error: 'unstubbed' })),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

import {
  createLog, findPaymentByGatewayId, getPaymentById, updatePayment,
  getInvoiceById, getPayments, createPayment as createPaymentRepo,
  findPaymentLinkByProviderLinkId, updatePaymentLink,
  findWebhookEventByProviderEventId, createWebhookEvent, updateWebhookEvent,
  type WebhookEventCreateInput, type WebhookEventUpdate,
} from '@/lib/db';
import { confirmPayment, failPayment, recordManualPayment } from '@/lib/agency/domain/agency.payments';
import { logError } from '@/lib/logger';
import { processRazorpayWebhook } from '@/lib/agency/domain/gateway-webhook';
import { razorpayGateway } from '@/lib/agency/domain/razorpay-gateway';
import type { Payment } from '@/lib/agency/types/payment';
import type { PaymentLink } from '@/lib/agency/types/payment-link';
import type { Invoice } from '@/lib/agency/types/invoice';
import type { WebhookEvent } from '@/lib/agency/types/webhook-event';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';

const SECRET = 'whsec_webhook_test';

/** A stateful §42 store — the replay/idempotency tests run against it. */
const h = vi.hoisted(() => ({
  webhookEvents: new Map<string, WebhookEvent>(),
}));

const mocked = {
  createLog: vi.mocked(createLog),
  findPaymentByGatewayId: vi.mocked(findPaymentByGatewayId),
  getPaymentById: vi.mocked(getPaymentById),
  updatePayment: vi.mocked(updatePayment),
  getInvoiceById: vi.mocked(getInvoiceById),
  getPayments: vi.mocked(getPayments),
  createPaymentRepo: vi.mocked(createPaymentRepo),
  findPaymentLinkByProviderLinkId: vi.mocked(findPaymentLinkByProviderLinkId),
  updatePaymentLink: vi.mocked(updatePaymentLink),
  findWebhookEventByProviderEventId: vi.mocked(findWebhookEventByProviderEventId),
  createWebhookEvent: vi.mocked(createWebhookEvent),
  updateWebhookEvent: vi.mocked(updateWebhookEvent),
  confirmPayment: vi.mocked(confirmPayment),
  failPayment: vi.mocked(failPayment),
  recordManualPayment: vi.mocked(recordManualPayment),
  logError: vi.mocked(logError),
};

const sign = (body: string, secret: string = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex');

/** A payload whose amounts/notes are LIES the domain must never read (§113). */
const capturedBody = (gatewayPaymentId: string) => JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: gatewayPaymentId,
        amount: 999999999, // lie
        notes: { invoiceId: 'liar-invoice', tenantId: 'liar-tenant', accountId: 'liar-account' },
      },
    },
  },
});

const failedBody = (gatewayPaymentId: string) => JSON.stringify({
  event: 'payment.failed',
  payload: { payment: { entity: { id: gatewayPaymentId } } },
});

/** §40 — a link-carried money event (payment_link.paid carries BOTH entities). */
const linkPaidBody = (gatewayPaymentId: string, plinkId: string) => JSON.stringify({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: plinkId, amount: 999999999 } }, // amount lie
    payment: { entity: { id: gatewayPaymentId, amount: 999999999 } },
  },
});

const linkPartiallyPaidBody = (gatewayPaymentId: string, plinkId: string) => JSON.stringify({
  event: 'payment_link.partially_paid',
  payload: {
    payment_link: { entity: { id: plinkId } },
    payment: { entity: { id: gatewayPaymentId } },
  },
});

/** §40 — link lifecycle events carry NO payment entity at all. */
const linkLifecycleBody = (eventName: 'payment_link.cancelled' | 'payment_link.expired', plinkId: string) =>
  JSON.stringify({ event: eventName, payload: { payment_link: { entity: { id: plinkId } } } });

function storedPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-record-1',
    tenantId: 'tenant-a',
    invoiceId: 'inv-real-1',
    clientId: 'client-1',
    amount: { amount: 40000, currency: 'INR' },
    method: 'RAZORPAY',
    status: 'PENDING',
    receivedAt: '2026-09-01',
    gateway: 'RAZORPAY',
    gatewayPaymentId: 'pay_gw_1',
    reconciliationStatus: 'PENDING',
    ...overrides,
  } as Payment;
}

function storedLink(overrides: Partial<PaymentLink> = {}): PaymentLink {
  return {
    id: 'link-1',
    tenantId: 'tenant-a',
    invoiceId: 'inv-real-1',
    provider: 'RAZORPAY',
    providerLinkId: 'plink_1',
    shortUrl: 'https://rzp.io/i/example',
    amount: { amount: 40000, currency: 'INR' },
    status: 'CREATED',
    createdAt: new Date('2026-09-10'),
    updatedAt: new Date('2026-09-10'),
    ...overrides,
  };
}

function storedInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-real-1',
    tenantId: 'tenant-a',
    clientId: 'client-1',
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

/** §48 — the AUTHORITATIVE gateway view (the only money the domain reads). */
const snapshot = (overrides: Partial<{ gatewayPaymentId: string; status: string; amount: { amount: number; currency: string }; capturedAt: string }> = {}) => ({
  gatewayPaymentId: 'pay_link_1',
  status: 'captured',
  amount: { amount: 40000, currency: 'INR' },
  capturedAt: '2026-09-13T04:00:00.000Z',
  ...overrides,
});

const AUDIT = { username: 'razorpay-webhook', tenantId: 'tenant-a', log: expect.any(Function) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  h.webhookEvents.clear();

  mocked.findPaymentByGatewayId.mockResolvedValue(null);
  mocked.getPaymentById.mockResolvedValue(null as unknown as Payment);
  mocked.getInvoiceById.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getInvoiceById>>);
  mocked.getPayments.mockResolvedValue([]);
  mocked.createPaymentRepo.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof createPaymentRepo>>);
  mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(null as unknown as PaymentLink);
  mocked.updatePaymentLink.mockResolvedValue(true);

  // §42 — realistic store semantics: find/create/update over the hoisted map.
  mocked.findWebhookEventByProviderEventId.mockImplementation(
    async (_provider: string, providerEventId: string) => h.webhookEvents.get(providerEventId) ?? null
  );
  mocked.createWebhookEvent.mockImplementation(async (input: WebhookEventCreateInput) => {
    if (h.webhookEvents.has(input.providerEventId)) return null; // lost the race
    const row: WebhookEvent = {
      id: `we-${h.webhookEvents.size + 1}`,
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      receivedAt: new Date(),
      processingStatus: 'RECEIVED',
      payloadHash: input.payloadHash,
    };
    h.webhookEvents.set(input.providerEventId, row);
    return row;
  });
  mocked.updateWebhookEvent.mockImplementation(async (id: string, patch: WebhookEventUpdate) => {
    for (const [key, row] of h.webhookEvents) {
      if (row.id === id) {
        const merged = { ...row, ...patch, id: row.id } as WebhookEvent;
        if (patch.processedAt === null) delete (merged as Partial<WebhookEvent>).processedAt;
        if (patch.errorMessage === null) delete (merged as Partial<WebhookEvent>).errorMessage;
        h.webhookEvents.set(key, merged);
        return true;
      }
    }
    return false;
  });

  // §48 — the gateway fetch defaults to 503 (unconfigured); tests override.
  vi.spyOn(razorpayGateway, 'getPayment').mockResolvedValue({
    ok: false, status: 503, error: 'unconfigured',
  } as never);
});

afterEach(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe('§97 — the signature gate comes first and fails closed', () => {
  it('wrong signature → 401 SIGNATURE_INVALID, and the db is never touched', async () => {
    const body = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(body, sign(body, 'wrong'), '203.0.113.9');
    expect(result).toMatchObject({ outcome: 'SIGNATURE_INVALID', status: 401 });
    expect(mocked.findPaymentByGatewayId).not.toHaveBeenCalled();
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
    expect(h.webhookEvents.size).toBe(0); // §42 — nothing recorded before the gate
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'WEBHOOK_SIGNATURE_REJECTED', expect.any(String), undefined, '203.0.113.9'
    );
  });

  it('missing signature header → 401', async () => {
    const result = await processRazorpayWebhook(capturedBody('pay_gw_1'), null);
    expect(result.outcome).toBe('SIGNATURE_INVALID');
    expect(result.status).toBe(401);
  });

  it('no secret configured → 401 for even a correctly signed body (fail closed)', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(body, sign(body));
    expect(result.outcome).toBe('SIGNATURE_INVALID');
    expect(result.status).toBe(401);
  });

  it('signature covers the RAW bytes — a tampered body fails', async () => {
    const result = await processRazorpayWebhook(capturedBody('pay_gw_1') + ' ', sign(capturedBody('pay_gw_1')));
    expect(result.outcome).toBe('SIGNATURE_INVALID');
  });
});

describe('parsing and event routing', () => {
  it('valid signature, unparseable body → 400 MALFORMED_BODY, recorded FAILED (§42/§43)', async () => {
    const raw = 'this is not json';
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'MALFORMED_BODY', status: 400 });
    expect(mocked.findPaymentByGatewayId).not.toHaveBeenCalled();
    expect(h.webhookEvents.size).toBe(1);
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('FAILED');
  });

  it('unhandled event → 200 UNHANDLED_EVENT, no store lookup, row lands IGNORED (§44)', async () => {
    const raw = JSON.stringify({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_gw_1' } } } });
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'UNHANDLED_EVENT', status: 200 });
    expect(mocked.findPaymentByGatewayId).not.toHaveBeenCalled();
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('IGNORED');
  });

  it('captured event for an UNKNOWN gateway payment → 200 UNRESOLVED_PAYMENT + structured log', async () => {
    const raw = capturedBody('pay_unknown');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'UNRESOLVED_PAYMENT', status: 200, gatewayPaymentId: 'pay_unknown' });
    expect(mocked.findPaymentByGatewayId).toHaveBeenCalledWith('RAZORPAY', 'pay_unknown');
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
    expect(mocked.logError).toHaveBeenCalled();
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'WEBHOOK_UNRESOLVED_PAYMENT', expect.any(String), undefined, undefined
    );
    // §43 — the event is still visible (PROCESSED, not FAILED: we did all we could).
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('PROCESSED');
  });
});

describe('§42 — the WebhookEvent store (idempotency first line)', () => {
  it('the SAME webhook twice → one payment action total; the second is REPLAY_ACKED (§56)', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({
      ok: true, status: 200, data: { payment: storedPayment({ status: 'CONFIRMED' }), invoice: {}, transactionId: 'txn_core_1' },
    } as never);
    const raw = capturedBody('pay_gw_1');

    const first = await processRazorpayWebhook(raw, sign(raw));
    expect(first).toMatchObject({ outcome: 'CONFIRMED', status: 200, transactionId: 'txn_core_1' });

    const second = await processRazorpayWebhook(raw, sign(raw));
    expect(second).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    // §57 — one payment, one transaction: exactly one domain action ever ran.
    expect(mocked.confirmPayment).toHaveBeenCalledTimes(1);
    expect(mocked.updatePayment).not.toHaveBeenCalled();
    expect(h.webhookEvents.size).toBe(1); // one row, updated in place
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('PROCESSED');
  });

  it('a FAILED delivery does NOT block the redelivery — the retry re-runs and succeeds (§45/§46)', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment
      .mockResolvedValueOnce({ ok: false, status: 500, error: 'ledger write failed' } as never)
      .mockResolvedValueOnce({ ok: true, status: 200, data: { transactionId: 'txn_retry' } } as never);
    const raw = capturedBody('pay_gw_1');

    const first = await processRazorpayWebhook(raw, sign(raw));
    expect(first).toMatchObject({ outcome: 'RETRY_LATER', status: 500 });
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('FAILED');
    expect([...h.webhookEvents.values()][0].errorMessage).toBe('ledger write failed');

    const second = await processRazorpayWebhook(raw, sign(raw));
    expect(second).toMatchObject({ outcome: 'CONFIRMED', status: 200 });
    expect(mocked.confirmPayment).toHaveBeenCalledTimes(2);
    expect(h.webhookEvents.size).toBe(1);
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('PROCESSED');
  });

  it('an UNHANDLED delivery replays as REPLAY_ACKED (IGNORED is terminal too)', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: { payment: { entity: { id: 'pay_x' } } } });
    await processRazorpayWebhook(raw, sign(raw));
    const second = await processRazorpayWebhook(raw, sign(raw));
    expect(second).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    expect(h.webhookEvents.size).toBe(1);
  });

  it('the event row carries the tenant once resolved + the raw-body hash as providerEventId (§42)', async () => {
    const raw = capturedBody('pay_gw_1');
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({ ok: true, status: 200, data: { transactionId: 't1' } } as never);
    await processRazorpayWebhook(raw, sign(raw));
    const row = [...h.webhookEvents.values()][0];
    const { createHash } = await import('crypto');
    expect(row.providerEventId).toBe(createHash('sha256').update(raw, 'utf8').digest('hex'));
    expect(row.tenantId).toBe('tenant-a');
    expect(row.eventType).toBe('payment.captured');
  });
});

describe('§99 — replay idempotency (stored payment state)', () => {
  it('a webhook for a non-PENDING payment acks 200 with ZERO writes', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment({ status: 'CONFIRMED', reconciliationStatus: 'RECONCILED' }));
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200, paymentId: 'pay-record-1' });
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
    expect(mocked.updatePayment).not.toHaveBeenCalled();
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'WEBHOOK_REPLAY_ACKED', expect.any(String), 'tenant-a', undefined
    );
  });

  it('the duplicate-webhook race on confirm (409, re-read shows CONFIRMED) is a REPLAY, not an error', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({ ok: false, status: 409, error: 'not pending' } as never);
    mocked.getPaymentById.mockResolvedValue(storedPayment({ status: 'CONFIRMED' }));
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('REPLAY_ACKED');
    expect(mocked.updatePayment).not.toHaveBeenCalled();
  });

  it('the duplicate-webhook race on fail (409, re-read shows FAILED) is a REPLAY', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.failPayment.mockResolvedValue({ ok: false, status: 409, error: 'not pending' } as never);
    mocked.getPaymentById.mockResolvedValue(storedPayment({ status: 'FAILED' }));
    const raw = failedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('REPLAY_ACKED');
    expect(mocked.updatePayment).not.toHaveBeenCalled();
  });
});

describe('§113/§114 — captured money confirms through the NORMAL path', () => {
  it('PAYMENT_CAPTURED on a PENDING gateway payment → CONFIRMED via confirmPayment with the webhook actor', async () => {
    const stored = storedPayment();
    mocked.findPaymentByGatewayId.mockResolvedValue(stored);
    mocked.confirmPayment.mockResolvedValue({
      ok: true, status: 200, data: { payment: stored, invoice: {}, transactionId: 'txn_core_1' },
    } as never);
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({
      outcome: 'CONFIRMED', status: 200, paymentId: 'pay-record-1', transactionId: 'txn_core_1',
    });
    // §113 — the payment resolved from the STORE, the actor is the synthetic webhook actor.
    expect(mocked.confirmPayment).toHaveBeenCalledWith(
      'pay-record-1', 'tenant-a',
      { userId: 'razorpay-webhook', role: 'GATEWAY', username: 'razorpay-webhook' },
      undefined, AUDIT
    );
    expect(mocked.updatePayment).not.toHaveBeenCalled();
  });

  it('the payload amount never reaches the domain — the stored payment id is what confirm receives', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({ ok: true, status: 200, data: { transactionId: 't1' } } as never);
    await processRazorpayWebhook(capturedBody('pay_gw_1'), sign(capturedBody('pay_gw_1')));
    const call = mocked.confirmPayment.mock.calls[0];
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain('999999999');
    expect(serialized).not.toContain('liar-invoice');
    expect(serialized).not.toContain('liar-tenant');
  });
});

describe('§115 — rejection vs transient failure', () => {
  it('business rejection (e.g. §91 overpay 400) → ERROR stamp + 200 ack', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({
      ok: false, status: 400, error: 'Payment exceeds remaining balance', code: 'PAYMENT_EXCEEDS_BALANCE',
    } as never);
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({
      outcome: 'RECONCILIATION_ERROR', status: 200, paymentId: 'pay-record-1',
      error: 'Payment exceeds remaining balance',
    });
    expect(mocked.updatePayment).toHaveBeenCalledWith('pay-record-1', 'tenant-a', { reconciliationStatus: 'ERROR' });
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'WEBHOOK_RECONCILIATION_ERROR', expect.stringContaining('reconciliationStatus ERROR'), 'tenant-a', undefined
    );
  });

  it('a 409 that is NOT a race (still PENDING) → RECONCILIATION_ERROR, not a replay', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({ ok: false, status: 409, error: 'state conflict' } as never);
    mocked.getPaymentById.mockResolvedValue(storedPayment()); // still PENDING
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('RECONCILIATION_ERROR');
    expect(mocked.updatePayment).toHaveBeenCalledWith('pay-record-1', 'tenant-a', { reconciliationStatus: 'ERROR' });
  });

  it('transient 500 (compensation already ran) → 500 RETRY_LATER, payment stays PENDING, no ERROR stamp', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.confirmPayment.mockResolvedValue({ ok: false, status: 500, error: 'ledger write failed' } as never);
    const raw = capturedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({
      outcome: 'RETRY_LATER', status: 500, paymentId: 'pay-record-1', error: 'ledger write failed',
    });
    expect(mocked.updatePayment).not.toHaveBeenCalled();
    expect(mocked.logError).toHaveBeenCalled();
  });
});

describe('payment.failed', () => {
  it('PAYMENT_FAILED on a PENDING gateway payment → MARKED_FAILED via failPayment', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.failPayment.mockResolvedValue({ ok: true, status: 200, data: storedPayment({ status: 'FAILED' }) } as never);
    const raw = failedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'MARKED_FAILED', status: 200, paymentId: 'pay-record-1' });
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
    expect(mocked.updatePayment).not.toHaveBeenCalled();
  });

  it('transient failure applying payment.failed → 500 RETRY_LATER', async () => {
    mocked.findPaymentByGatewayId.mockResolvedValue(storedPayment());
    mocked.failPayment.mockResolvedValue({ ok: false, status: 500, error: 'db down' } as never);
    const raw = failedBody('pay_gw_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RETRY_LATER', status: 500 });
    expect(mocked.updatePayment).not.toHaveBeenCalled();
  });
});

// ---------- Module 12 §40: link lifecycle events ----------

describe('§40 — link cancelled/expired', () => {
  it('payment_link.cancelled → LINK_ACKED, the stored link advances to CANCELLED', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    const raw = linkLifecycleBody('payment_link.cancelled', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'LINK_ACKED', status: 200, gatewayLinkId: 'plink_1' });
    expect(mocked.updatePaymentLink).toHaveBeenCalledWith('link-1', 'tenant-a', { status: 'CANCELLED' });
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'PAYMENT_LINK_CANCELLED', expect.any(String), 'tenant-a', undefined
    );
    // §43 — tenant stamped on the event row once resolved from the STORED link.
    expect([...h.webhookEvents.values()][0].tenantId).toBe('tenant-a');
  });

  it('payment_link.expired → LINK_ACKED, the stored link advances to EXPIRED', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    const raw = linkLifecycleBody('payment_link.expired', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'LINK_ACKED', status: 200 });
    expect(mocked.updatePaymentLink).toHaveBeenCalledWith('link-1', 'tenant-a', { status: 'EXPIRED' });
  });

  it('§46 repeat-safe — a link already terminal writes nothing, still acks 200', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink({ status: 'CANCELLED' }));
    const raw = linkLifecycleBody('payment_link.cancelled', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'LINK_ACKED', status: 200 });
    expect(mocked.updatePaymentLink).not.toHaveBeenCalled();
  });

  it('a link event for an UNKNOWN link → 200 UNRESOLVED_PAYMENT (reconciliation gold)', async () => {
    const raw = linkLifecycleBody('payment_link.cancelled', 'plink_unknown');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'UNRESOLVED_PAYMENT', status: 200, gatewayLinkId: 'plink_unknown' });
    expect(mocked.updatePaymentLink).not.toHaveBeenCalled();
  });
});

// ---------- Module 12 §48/§49/§50: the link money path ----------

describe('§48 — payment_link.paid reconciliation flow (happy path)', () => {
  it('fetches the AUTHORITATIVE payment, records via the NORMAL intake, confirms — one transaction', async () => {
    // No stored payment for the gateway id — the §48 path must create it.
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(storedInvoice());
    mocked.getPayments.mockResolvedValue([]);
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot(),
    } as never);
    mocked.recordManualPayment.mockResolvedValue({
      ok: true, status: 201, data: storedPayment({ id: 'pay-link-1', invoiceId: 'inv-real-1', gatewayPaymentId: 'pay_link_1' }),
    } as never);
    mocked.confirmPayment.mockResolvedValue({
      ok: true, status: 200, data: { transactionId: 'txn_link_1' },
    } as never);

    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));

    expect(result).toMatchObject({
      outcome: 'CONFIRMED', status: 200,
      paymentId: 'pay-link-1', transactionId: 'txn_link_1', gatewayLinkId: 'plink_1',
    });
    // §48/§49 — the amount came from the FETCHED snapshot (40000), never the
    // webhook's 999999999 lie; the invoice came from the STORED link.
    expect(mocked.recordManualPayment).toHaveBeenCalledWith(
      'tenant-a',
      { userId: 'razorpay-webhook', role: 'GATEWAY', username: 'razorpay-webhook' },
      expect.objectContaining({
        invoiceId: 'inv-real-1',
        amount: 40000,
        method: 'RAZORPAY',
        gatewayPaymentId: 'pay_link_1',
        gatewayLinkId: 'plink_1', // §47 — the link lineage, from the STORED link
      }),
      AUDIT
    );
    const serialized = JSON.stringify(mocked.recordManualPayment.mock.calls[0]);
    expect(serialized).not.toContain('999999999');
    // §41 — the stored link reflects the collection.
    expect(mocked.updatePaymentLink).toHaveBeenCalledWith('link-1', 'tenant-a', { status: 'PAID' });
    expect(mocked.confirmPayment).toHaveBeenCalledTimes(1);
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('PROCESSED');
  });

  it('§56 — the same paid-link webhook twice → ONE record + ONE confirm (replay acks)', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(storedInvoice());
    mocked.getPayments.mockResolvedValue([]);
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({ ok: true, status: 200, data: snapshot() } as never);
    mocked.recordManualPayment.mockResolvedValue({
      ok: true, status: 201, data: storedPayment({ id: 'pay-link-1', gatewayPaymentId: 'pay_link_1' }),
    } as never);
    mocked.confirmPayment.mockResolvedValue({ ok: true, status: 200, data: { transactionId: 'txn_link_1' } } as never);

    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const first = await processRazorpayWebhook(raw, sign(raw));
    const second = await processRazorpayWebhook(raw, sign(raw));
    expect(first.outcome).toBe('CONFIRMED');
    expect(second).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    expect(mocked.recordManualPayment).toHaveBeenCalledTimes(1);
    expect(mocked.confirmPayment).toHaveBeenCalledTimes(1);
    expect(h.webhookEvents.size).toBe(1);
  });

  it('payment_link.partially_paid advances the link to PARTIALLY_PAID (no full-PAID claim)', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(storedInvoice());
    mocked.getPayments.mockResolvedValue([]);
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({ ok: true, status: 200, data: snapshot() } as never);
    mocked.recordManualPayment.mockResolvedValue({
      ok: true, status: 201, data: storedPayment({ id: 'pay-link-1', gatewayPaymentId: 'pay_link_1' }),
    } as never);
    mocked.confirmPayment.mockResolvedValue({ ok: true, status: 200, data: { transactionId: 'txn_link_1' } } as never);

    const raw = linkPartiallyPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('CONFIRMED');
    expect(mocked.updatePaymentLink).toHaveBeenCalledWith('link-1', 'tenant-a', { status: 'PARTIALLY_PAID' });
  });
});

describe('§49/§50 — amount verification failures', () => {
  beforeEach(() => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(storedInvoice());
    mocked.getPayments.mockResolvedValue([]);
  });

  it('gateway amount EXCEEDS the outstanding balance → RECONCILIATION_ERROR, Payment PENDING+ERROR, NO transaction', async () => {
    // A ₹1.5L payment against a ₹1L invoice — the §49 liar scenario.
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot({ amount: { amount: 150000, currency: 'INR' } }),
    } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));

    expect(result).toMatchObject({ outcome: 'RECONCILIATION_ERROR', status: 200 });
    expect(result.error).toContain('exceeds');
    // §50 — the money is recorded as it arrived (gateway denomination), PENDING
    // + reconciliationStatus ERROR; it is NEVER falsely PAID.
    expect(mocked.createPaymentRepo).toHaveBeenCalledWith('tenant-a', expect.objectContaining({
      invoiceId: 'inv-real-1',
      gatewayPaymentId: 'pay_link_1',
      gatewayLinkId: 'plink_1', // §47 — the lineage rides the ERROR record too
      source: 'RAZORPAY',
      reconciliationStatus: 'ERROR',
    }));
    expect(mocked.confirmPayment).not.toHaveBeenCalled(); // no transaction, no §104 recompute
    expect(mocked.recordManualPayment).not.toHaveBeenCalled();
    expect(mocked.createLog).toHaveBeenCalledWith(
      'razorpay-webhook', 'WEBHOOK_RECONCILIATION_ERROR', expect.stringContaining('NO transaction'), 'tenant-a', undefined
    );
  });

  it('gateway amount exceeds the LINK\'s own amount (partial link, bigger payment) → mismatch', async () => {
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot({ amount: { amount: 50000, currency: 'INR' } }),
    } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('RECONCILIATION_ERROR');
    expect(result.error).toContain("link's own amount");
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
  });

  it('a currency mismatch is never converted (§127) → mismatch', async () => {
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot({ amount: { amount: 40000, currency: 'USD' } }),
    } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('RECONCILIATION_ERROR');
    expect(result.error).toContain('USD');
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
  });

  it('a gateway payment not yet captured → mismatch, no money recorded as confirmed', async () => {
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot({ status: 'authorized' }),
    } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result.outcome).toBe('RECONCILIATION_ERROR');
    expect(result.error).toContain('captured');
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
  });

  it('the §96 insert race (11000) on the mismatch record is a REPLAY, not an error', async () => {
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: true, status: 200, data: snapshot({ amount: { amount: 150000, currency: 'INR' } }),
    } as never);
    const race = Object.assign(new Error('dup'), { code: 11000 });
    mocked.createPaymentRepo.mockRejectedValue(race);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
  });
});

describe('§48 transient failures on the link path', () => {
  it('the gateway payment cannot be FETCHED → 500 RETRY_LATER, nothing recorded', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({
      ok: false, status: 502, error: 'gateway unreachable',
    } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RETRY_LATER', status: 500, error: 'gateway unreachable' });
    expect(mocked.recordManualPayment).not.toHaveBeenCalled();
    expect(mocked.createPaymentRepo).not.toHaveBeenCalled();
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
    // §44 — a transient failure lands FAILED so the redelivery re-runs.
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('FAILED');
  });

  it('the link resolves to an invoice that no longer exists → RECONCILIATION_ERROR, no money recorded', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(null);
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({ ok: true, status: 200, data: snapshot() } as never);
    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RECONCILIATION_ERROR', status: 200 });
    expect(mocked.recordManualPayment).not.toHaveBeenCalled();
    expect(mocked.confirmPayment).not.toHaveBeenCalled();
  });

  it('the recorded payment is then refused by confirm (§91 overpay) → PENDING+ERROR, acked 200', async () => {
    mocked.findPaymentLinkByProviderLinkId.mockResolvedValue(storedLink());
    mocked.getInvoiceById.mockResolvedValue(storedInvoice());
    // The §49 pre-check passes (40k ≤ 100k outstanding, ≤ the 40k link); the
    // DOMAIN then refuses at confirm time — the §115 business rejection.
    mocked.getPayments.mockResolvedValue([]);
    vi.mocked(razorpayGateway.getPayment).mockResolvedValue({ ok: true, status: 200, data: snapshot() } as never);
    mocked.recordManualPayment.mockResolvedValue({
      ok: true, status: 201, data: storedPayment({ id: 'pay-link-1', gatewayPaymentId: 'pay_link_1' }),
    } as never);
    mocked.confirmPayment.mockResolvedValue({
      ok: false, status: 400, error: 'Payment exceeds remaining balance', code: 'PAYMENT_EXCEEDS_BALANCE',
    } as never);

    const raw = linkPaidBody('pay_link_1', 'plink_1');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RECONCILIATION_ERROR', status: 200, paymentId: 'pay-link-1' });
    expect(mocked.updatePayment).toHaveBeenCalledWith('pay-link-1', 'tenant-a', { reconciliationStatus: 'ERROR' });
    expect(mocked.confirmPayment).toHaveBeenCalledTimes(1);
  });

  it('a paid-link webhook for an UNKNOWN link → 200 UNRESOLVED_PAYMENT, nothing recorded', async () => {
    const raw = linkPaidBody('pay_link_1', 'plink_nope');
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'UNRESOLVED_PAYMENT', status: 200, gatewayLinkId: 'plink_nope' });
    expect(mocked.recordManualPayment).not.toHaveBeenCalled();
    expect(vi.mocked(razorpayGateway.getPayment)).not.toHaveBeenCalled();
  });
});
