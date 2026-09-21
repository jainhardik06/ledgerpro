/**
 * Module 12 §57 — Integration: the FULL collection loop, end to end, with
 * REAL domain services (agency.payment-links, agency.payments,
 * gateway-webhook) over an in-memory echo store. Only the Razorpay NETWORK
 * edges (createPaymentLink / getPayment / cancelPaymentLink) are mocked —
 * Bruno cannot reach real Razorpay, so this vitest suite IS the happy-path
 * evidence for the release gate.
 *
 *   Invoice → finalize → create link (§36 server-resolved amount)
 *   → client pays → payment_link.paid webhook (signed with the test secret)
 *   → §48 reconciliation (authoritative fetch, §49 amount verification)
 *   → Payment recorded (source RAZORPAY, §52) → confirmPayment (the ONE
 *   writer path) → invoice recompute (§104) → ONE Credit transaction.
 *
 * §57 — the gate: the full loop works WITHOUT duplicate financial records:
 *   - the same webhook twice ⇒ one payment, one transaction, one ack-everything
 *   - the link advances CREATED → PAID exactly once
 *   - the invoice lands PAID with amountPaid = total
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/db', () => ({
  getTenantById: vi.fn(async () => null), // Module 17 §15 — env-fallback credentials
  getTenants: vi.fn(async () => []),      // Module 17 §51 — no tenant webhook secrets
  getInvoiceById: vi.fn(),
  updateInvoice: vi.fn(),
  getPayments: vi.fn(),
  getPaymentById: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  getAccountById: vi.fn(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  findPaymentByGatewayId: vi.fn(),
  getPaymentLinks: vi.fn(async () => []),
  getPaymentLinkById: vi.fn(),
  createPaymentLink: vi.fn(),
  updatePaymentLink: vi.fn(),
  findPaymentLinkByProviderLinkId: vi.fn(),
  findWebhookEventByProviderEventId: vi.fn(),
  createWebhookEvent: vi.fn(),
  updateWebhookEvent: vi.fn(),
  listRecentWebhookEvents: vi.fn(),
  createLog: vi.fn(async () => undefined),
  getClientById: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getInvoiceById, updateInvoice as updateInvoiceRepo,
  getPayments, getPaymentById,
  createPayment as createPaymentRepo, updatePayment as updatePaymentRepo,
  getAccountById, createTransaction, deleteTransaction,
  findPaymentByGatewayId,
  getPaymentLinkById, createPaymentLink as createPaymentLinkRepo,
  updatePaymentLink as updatePaymentLinkRepo,
  findPaymentLinkByProviderLinkId,
  findWebhookEventByProviderEventId, createWebhookEvent, updateWebhookEvent,
  listRecentWebhookEvents,
  createLog,
  type PaymentCreateInput, type WebhookEventCreateInput, type WebhookEventUpdate,
  type PaymentLinkCreateInput,
} from '@/lib/db';
import {
  createInvoicePaymentLink, cancelPaymentLink,
} from '@/lib/agency/domain/agency.payment-links';
import { processRazorpayWebhook, listWebhookEvents } from '@/lib/agency/domain/gateway-webhook';
import { razorpayGateway } from '@/lib/agency/domain/razorpay-gateway';
import type { Payment } from '@/lib/agency/types/payment';
import type { PaymentLink } from '@/lib/agency/types/payment-link';
import type { Invoice } from '@/lib/agency/types/invoice';
import type { WebhookEvent } from '@/lib/agency/types/webhook-event';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';

const TENANT = 'tenant-a';
const SECRET = 'whsec_full_loop_test';
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };
const audit = { username: 'admin-1', tenantId: TENANT, log: vi.fn() };

const h = vi.hoisted(() => ({
  invoices: new Map<string, Invoice>(),
  payments: new Map<string, Payment>(),
  links: new Map<string, PaymentLink>(),
  webhookEvents: new Map<string, WebhookEvent>(),
  transactions: [] as Array<Record<string, unknown>>,
  deletedTx: [] as string[],
  gatewayPayments: new Map<string, { status: string; amount: number; currency: string; capturedAt: string }>(),
  seq: 0,
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.invoices.clear();
  h.payments.clear();
  h.links.clear();
  h.webhookEvents.clear();
  h.transactions.length = 0;
  h.deletedTx.length = 0;
  h.gatewayPayments.clear();
  h.seq = 0;

  // A finalized ₹1,00,000 invoice, ready for collection.
  h.invoices.set('inv-1', {
    id: 'inv-1', tenantId: TENANT, clientId: 'client-1',
    invoiceNumber: 'INV-2026-0001',
    issueDate: '2026-09-01', dueDate: '2026-09-30', currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'SENT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
  });

  vi.mocked(getInvoiceById).mockImplementation(async (id: string, t: string) => {
    const inv = h.invoices.get(id);
    return inv && inv.tenantId === t ? inv : null;
  });
  vi.mocked(updateInvoiceRepo).mockImplementation(async (id: string, _t: string, patch: Parameters<typeof updateInvoiceRepo>[2]) => {
    const inv = h.invoices.get(id);
    if (!inv) return false;
    h.invoices.set(id, { ...inv, ...patch } as Invoice);
    return true;
  });
  vi.mocked(getPayments).mockImplementation(async (_t: string, filters?: { invoiceId?: string }) =>
    [...h.payments.values()].filter(p => !filters?.invoiceId || p.invoiceId === filters.invoiceId));
  vi.mocked(getPaymentById).mockImplementation(async (id: string) => h.payments.get(id) ?? null);
  vi.mocked(createPaymentRepo).mockImplementation(async (tenantId: string, input: PaymentCreateInput) => {
    h.seq += 1;
    const p = { ...input, id: `pay-${h.seq}`, tenantId, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() } as unknown as Payment;
    h.payments.set(p.id!, p);
    return p;
  });
  vi.mocked(updatePaymentRepo).mockImplementation(async (id: string, _t: string, patch: Partial<Payment>) => {
    const p = h.payments.get(id);
    if (!p) return false;
    h.payments.set(id, { ...p, ...patch });
    return true;
  });
  vi.mocked(getAccountById).mockImplementation(async (id: string) =>
    (id === 'acct-1' ? { id: 'acct-1', tenantId: TENANT, name: 'HDFC Current', type: 'Bank' } : null) as Awaited<ReturnType<typeof getAccountById>>);
  vi.mocked(createTransaction).mockImplementation(async (data: Record<string, unknown>) => {
    h.seq += 1;
    const tx = { ...data, id: `tx-${h.seq}` };
    h.transactions.push(tx);
    return tx as Awaited<ReturnType<typeof createTransaction>>;
  });
  vi.mocked(deleteTransaction).mockImplementation(async (id: string) => {
    h.deletedTx.push(id);
    return true;
  });
  vi.mocked(findPaymentByGatewayId).mockImplementation(async (gateway: string, gatewayPaymentId: string) =>
    [...h.payments.values()].find(p => p.gateway === gateway && p.gatewayPaymentId === gatewayPaymentId) ?? null);

  vi.mocked(getPaymentLinkById).mockImplementation(async (id: string, t: string) => {
    const link = h.links.get(id);
    return link && link.tenantId === t ? link : null;
  });
  vi.mocked(createPaymentLinkRepo).mockImplementation(async (tenantId: string, input: PaymentLinkCreateInput) => {
    h.seq += 1;
    const link: PaymentLink = {
      ...(input as unknown as PaymentLink),
      id: `link-${h.seq}`, tenantId, status: 'CREATED',
      createdAt: new Date(), updatedAt: new Date(),
    };
    h.links.set(link.id!, link);
    return link;
  });
  vi.mocked(updatePaymentLinkRepo).mockImplementation(async (id: string, _t: string, patch: Partial<PaymentLink>) => {
    const link = h.links.get(id);
    if (!link) return false;
    h.links.set(id, { ...link, ...patch });
    return true;
  });
  vi.mocked(findPaymentLinkByProviderLinkId).mockImplementation(async (providerLinkId: string) =>
    [...h.links.values()].find(l => l.providerLinkId === providerLinkId) ?? null);

  // §42 — the WebhookEvent store, with real replay semantics.
  vi.mocked(findWebhookEventByProviderEventId).mockImplementation(
    async (_provider: string, providerEventId: string) => h.webhookEvents.get(providerEventId) ?? null
  );
  vi.mocked(createWebhookEvent).mockImplementation(async (input: WebhookEventCreateInput) => {
    if (h.webhookEvents.has(input.providerEventId)) return null; // lost the race
    const row: WebhookEvent = {
      id: `we-${h.webhookEvents.size + 1}`,
      provider: input.provider, providerEventId: input.providerEventId,
      eventType: input.eventType, receivedAt: new Date(),
      processingStatus: 'RECEIVED', payloadHash: input.payloadHash,
    };
    h.webhookEvents.set(input.providerEventId, row);
    return row;
  });
  vi.mocked(updateWebhookEvent).mockImplementation(async (id: string, patch: WebhookEventUpdate) => {
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
  // §43 — the operational-visibility read, tenant-scoped like the real store.
  vi.mocked(listRecentWebhookEvents).mockImplementation(
    async (filters: { tenantId?: string; processingStatus?: string } = {}, limit = 50) =>
      [...h.webhookEvents.values()]
        .filter(e => (filters.tenantId === undefined || e.tenantId === filters.tenantId)
          && (filters.processingStatus === undefined || e.processingStatus === filters.processingStatus))
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .slice(0, limit)
  );

  // The Razorpay NETWORK edges — everything else is the real code.
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  vi.spyOn(razorpayGateway, 'createPaymentLink').mockImplementation(async (request: { amount: { amount: number }; invoiceId: string }) => {
    h.seq += 1;
    const gatewayLinkId = `plink_${h.seq}`;
    h.gatewayPayments.set(`pay_for_${gatewayLinkId}`, {
      status: 'captured', amount: request.amount.amount, currency: 'INR',
      capturedAt: '2026-09-13T04:00:00.000Z',
    });
    return { ok: true, status: 200, data: { gatewayLinkId, url: `https://rzp.io/i/${gatewayLinkId}` } };
  });
  vi.spyOn(razorpayGateway, 'getPayment').mockImplementation(async (gatewayPaymentId: string) => {
    const found = h.gatewayPayments.get(gatewayPaymentId);
    if (!found) return { ok: false, status: 404, error: 'not found' };
    return {
      ok: true, status: 200,
      data: {
        gatewayPaymentId, status: found.status,
        amount: { amount: found.amount, currency: found.currency },
        capturedAt: found.capturedAt,
      },
    };
  });
  vi.spyOn(razorpayGateway, 'cancelPaymentLink').mockImplementation(async () => ({ ok: true, status: 200, data: null }));
});

afterEach(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

const sign = (body: string) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

/** The webhook Razorpay sends when the client completes a hosted checkout. */
const linkPaidBody = (gatewayPaymentId: string, plinkId: string) => JSON.stringify({
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: plinkId, amount: 999999999 } }, // the §113 lie
    payment: { entity: { id: gatewayPaymentId, amount: 999999999 } },
  },
});

describe('§57 — the full loop, no duplicate financial records', () => {
  it('Invoice → link → paid webhook → Payment → invoice → transaction → account, exactly once', async () => {
    // 1. create the link (§36: the server resolves the full ₹1,00,000)
    const created = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) return;
    const link = created.data;
    expect(link.status).toBe('CREATED');
    expect(link.amount).toEqual(makeMoney(100000));
    expect(link.providerLinkId).toMatch(/^plink_\d+$/);

    // the gateway recorded what the checkout will collect (our mock's ledger)
    const gatewayPaymentId = `pay_for_${link.providerLinkId}`;
    expect(h.gatewayPayments.get(gatewayPaymentId)?.amount).toBe(100000);

    // 2. the client pays; Razorpay delivers payment_link.paid (signed)
    const raw = linkPaidBody(gatewayPaymentId, link.providerLinkId);
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'CONFIRMED', status: 200, gatewayLinkId: link.providerLinkId });

    // 3. exactly ONE payment exists, CONFIRMED, source RAZORPAY (§52)
    expect(h.payments.size).toBe(1);
    const [payment] = [...h.payments.values()];
    expect(payment.status).toBe('CONFIRMED');
    expect(payment.reconciliationStatus).toBe('RECONCILED');
    expect(payment.source).toBe('RAZORPAY');
    expect(payment.gatewayPaymentId).toBe(gatewayPaymentId);
    expect(payment.gatewayLinkId).toBe(link.providerLinkId); // §47 lineage
    expect(payment.method).toBe('RAZORPAY');
    expect(payment.amount).toEqual(makeMoney(100000));

    // 4. the invoice recomputed: PAID, amountPaid = total (§104)
    const invoice = h.invoices.get('inv-1')!;
    expect(invoice.status).toBe('PAID');
    expect(invoice.amountPaid).toEqual(makeMoney(100000));
    expect(invoice.amountDue).toEqual(zeroMoney('INR'));

    // 5. exactly ONE core transaction — a Credit of ₹1,00,000 (§129)
    expect(h.transactions).toHaveLength(1);
    expect(h.transactions[0]).toMatchObject({ type: 'Credit', amount: 100000 });

    // 6. the link advanced to PAID (§41)
    expect(h.links.get(link.id!)!.status).toBe('PAID');

    // 7. §57 — THE GATE: the same webhook again changes NOTHING
    const replay = await processRazorpayWebhook(raw, sign(raw));
    expect(replay).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    expect(h.payments.size).toBe(1);        // still one payment
    expect(h.transactions).toHaveLength(1); // still one transaction
    expect(h.deletedTx).toHaveLength(0);    // nothing compensated/rewound
    expect(h.links.get(link.id!)!.status).toBe('PAID');
    expect(h.webhookEvents.size).toBe(1);   // one event row, terminal PROCESSED
    expect([...h.webhookEvents.values()][0].processingStatus).toBe('PROCESSED');

    // 7b. §43 — the operational-visibility surface answers "processed?":
    // the tenant sees exactly this event, PROCESSED, with its event name.
    const visible = await listWebhookEvents(TENANT);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({
      provider: 'RAZORPAY', eventType: 'payment_link.paid', processingStatus: 'PROCESSED',
    });
    expect(typeof visible[0].payloadHash).toBe('string'); // §42 — hash, never the payload

    // 7c. §115 — the webhook journey is auditable END TO END: WEBHOOK_RECEIVED
    // at intake, PAYMENT_RECONCILED when the gateway money settled into the
    // ledger (exactly once — the replay acked with no new writes), and
    // WEBHOOK_PROCESSED at the §44 terminal stamp.
    const audited = vi.mocked(createLog).mock.calls.map(call => call[1]);
    expect(audited).toContain('WEBHOOK_RECEIVED');
    expect(audited).toContain('PAYMENT_RECONCILED');
    expect(audited).toContain('WEBHOOK_PROCESSED');
    expect(audited.filter(a => a === 'PAYMENT_RECONCILED')).toHaveLength(1);
    expect(audited.filter(a => a === 'WEBHOOK_RECEIVED')).toHaveLength(1);

    // 8. the invoice now refuses a new link (nothing left to collect, §36)
    const again = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(again).toMatchObject({ ok: false, status: 409 });
  });

  it('a PARTIAL link collects part, the invoice lands PARTIALLY_PAID, and a second link collects the rest', async () => {
    // 1. an explicit ₹40,000 partial (§37 — the browser may only NARROW)
    const first = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', { amount: 40000 }, audit);
    expect(first.ok).toBe(true);
    if (!first.ok || !first.data) return;
    expect(first.data.amount).toEqual(makeMoney(40000));
    h.gatewayPayments.get(`pay_for_${first.data.providerLinkId}`)!.amount = 40000;

    const raw1 = linkPaidBody(`pay_for_${first.data.providerLinkId}`, first.data.providerLinkId);
    const res1 = await processRazorpayWebhook(raw1, sign(raw1));
    expect(res1.outcome).toBe('CONFIRMED');

    expect(h.payments.size).toBe(1);
    expect(h.invoices.get('inv-1')!.status).toBe('PARTIALLY_PAID');
    expect(h.invoices.get('inv-1')!.amountDue).toEqual(makeMoney(60000));
    expect(h.transactions).toHaveLength(1);
    expect(h.links.get(first.data.id!)!.status).toBe('PAID');

    // 2. §36 — a NEW link defaults to the REMAINING ₹60,000, not the total
    const second = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(second.ok).toBe(true);
    if (!second.ok || !second.data) return;
    expect(second.data.amount).toEqual(makeMoney(60000));

    const raw2 = linkPaidBody(`pay_for_${second.data.providerLinkId}`, second.data.providerLinkId);
    const res2 = await processRazorpayWebhook(raw2, sign(raw2));
    expect(res2.outcome).toBe('CONFIRMED');

    // two payments, two transactions, invoice PAID — no duplicates anywhere
    expect(h.payments.size).toBe(2);
    expect(h.transactions).toHaveLength(2);
    expect(h.invoices.get('inv-1')!.status).toBe('PAID');
    expect(h.invoices.get('inv-1')!.amountPaid).toEqual(makeMoney(100000));
    expect(h.links.get(second.data.id!)!.status).toBe('PAID');
  });

  it('a mismatched gateway payment is recorded PENDING+ERROR and NEVER becomes money (§49/§50)', async () => {
    const created = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) return;

    // the gateway's authoritative record says ₹1,50,000 — the §49 liar
    h.gatewayPayments.get(`pay_for_${created.data.providerLinkId}`)!.amount = 150000;

    const raw = linkPaidBody(`pay_for_${created.data.providerLinkId}`, created.data.providerLinkId);
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RECONCILIATION_ERROR', status: 200 });

    const [payment] = [...h.payments.values()];
    expect(payment.status).toBe('PENDING');                    // §50 — never falsely PAID
    expect(payment.reconciliationStatus).toBe('ERROR');
    expect(payment.source).toBe('RAZORPAY');
    expect(payment.gatewayLinkId).toBe(created.data.providerLinkId); // §47 lineage
    expect(h.transactions).toHaveLength(0);                     // no money moved
    expect(h.invoices.get('inv-1')!.status).toBe('SENT');      // untouched
    expect(h.links.get(created.data.id!)!.status).toBe('CREATED');

    // §42 — the rejection is terminal for THIS delivery: a replay acks clean
    const replay = await processRazorpayWebhook(raw, sign(raw));
    expect(replay).toMatchObject({ outcome: 'REPLAY_ACKED', status: 200 });
    expect(h.payments.size).toBe(1);
    expect(h.transactions).toHaveLength(0);
  });

  it('a cancelled link cannot be collected: the webhook after cancel still records the real money', async () => {
    const created = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) return;
    const link = created.data;

    // the admin cancels before the client pays (§46 — gateway first)
    const cancelled = await cancelPaymentLink(TENANT, ACTOR_ADMIN, link.id!, audit);
    expect(cancelled.ok).toBe(true);
    expect(h.links.get(link.id!)!.status).toBe('CANCELLED');

    // the client had ALREADY paid — the webhook still records the money
    // through the §48 path (cancel does not erase a capture)
    const raw = linkPaidBody(`pay_for_${link.providerLinkId}`, link.providerLinkId);
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'CONFIRMED', status: 200 });
    expect(h.payments.size).toBe(1);
    expect(h.transactions).toHaveLength(1);
    expect(h.invoices.get('inv-1')!.status).toBe('PAID');
  });

  it('§115 — a transient failure audits WEBHOOK_RECEIVED + WEBHOOK_FAILED and the event row lands FAILED for retry', async () => {
    const created = await createInvoicePaymentLink(TENANT, ACTOR_ADMIN, 'inv-1', {}, audit);
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) return;

    // §48 step 3 — the authoritative gateway fetch fails: transient, ack 500.
    vi.spyOn(razorpayGateway, 'getPayment').mockImplementation(async () => ({ ok: false, status: 502, error: 'gateway unavailable' }));

    const raw = linkPaidBody(`pay_for_${created.data.providerLinkId}`, created.data.providerLinkId);
    const result = await processRazorpayWebhook(raw, sign(raw));
    expect(result).toMatchObject({ outcome: 'RETRY_LATER', status: 500 });

    // Nothing was written: no payment, no transaction, invoice untouched.
    expect(h.payments.size).toBe(0);
    expect(h.transactions).toHaveLength(0);
    expect(h.invoices.get('inv-1')!.status).toBe('SENT');

    // The event row is FAILED (the §44 recovery path holds it for redelivery).
    const [row] = [...h.webhookEvents.values()];
    expect(row.processingStatus).toBe('FAILED');

    // §115 — the failure lifecycle is audited: RECEIVED at intake, FAILED at
    // the terminal stamp (the retry-later audit itself is the existing
    // WEBHOOK_RETRY_LATER event).
    const audited = vi.mocked(createLog).mock.calls.map(call => call[1]);
    expect(audited).toContain('WEBHOOK_RECEIVED');
    expect(audited).toContain('WEBHOOK_RETRY_LATER');
    expect(audited).toContain('WEBHOOK_FAILED');
    expect(audited).not.toContain('WEBHOOK_PROCESSED');
    expect(audited).not.toContain('PAYMENT_RECONCILED');
  });
});
