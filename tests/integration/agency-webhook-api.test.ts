/**
 * Module 10 (Sprint 10D/10F §96–§99/§113/§115) — Integration: the webhook
 * ROUTE boundary at /api/webhooks/razorpay.
 *
 * Runs the REAL route handler with the razorpay adapter REAL (its HMAC check
 * executes against a test secret) and only the repository/payment-domain
 * edges mocked. Pins the route contract:
 *   - §97/§98 NO session gate exists — the signature IS the auth; an invalid
 *     or missing signature is a 401 before anything else is read
 *   - the body is verified as RAW text (a signature over different bytes fails)
 *   - the ack contract: 200 {received:true, outcome}, 401/400
 *     {received:false, outcome}, 405 on GET
 *   - §99 replay → 200, the domain never invoked
 *   - §113 wrong-invoice/wrong-tenant payload hints are ignored — the STORED
 *     payment (found by gateway id) is what the domain receives
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import type { Payment } from '@/lib/agency/types/payment';
import { AGENCY_A } from '../fixtures/agency-fixtures';

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    findPaymentByGatewayId: vi.fn(),
    getPaymentById: vi.fn(),
    updatePayment: vi.fn(),
    createLog: vi.fn(),
    // Module 12 §42/§48 — the webhook event store and payment-link lookups
    // must be mocked too: the real ones would hit the real DAL.
    findWebhookEventByProviderEventId: vi.fn(),
    createWebhookEvent: vi.fn(),
    updateWebhookEvent: vi.fn(async () => true),
    findPaymentLinkByProviderLinkId: vi.fn(async () => null),
    updatePaymentLink: vi.fn(async () => true),
    getInvoiceById: vi.fn(async () => null),
    getPayments: vi.fn(async () => []),
    createPayment: vi.fn(async () => null),
    // imported by agency.clients (AuditContext/DomainResult home) — same module
    getLogs: vi.fn(), createClient: vi.fn(), getClients: vi.fn(),
    updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  };
});

vi.mock('@/lib/agency/domain/agency.payments', () => ({
  confirmPayment: vi.fn(async () => ({ ok: false, status: 500, error: 'unstubbed' })),
  failPayment: vi.fn(async () => ({ ok: false, status: 500, error: 'unstubbed' })),
}));

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import {
  findPaymentByGatewayId, getPaymentById, updatePayment, createLog,
  findWebhookEventByProviderEventId, createWebhookEvent,
  findPaymentLinkByProviderLinkId,
} from '@/lib/db';
import { confirmPayment } from '@/lib/agency/domain/agency.payments';
import { POST as webhookRoute, GET as webhookGetRoute } from '@/app/api/webhooks/razorpay/route';
import { NextRequest } from 'next/server';

const mockFindByGatewayId = vi.mocked(findPaymentByGatewayId);
const mockGetPaymentById = vi.mocked(getPaymentById);
const mockUpdatePayment = vi.mocked(updatePayment);
const mockCreateLog = vi.mocked(createLog);
const mockConfirm = vi.mocked(confirmPayment);
const mockFindWebhookEvent = vi.mocked(findWebhookEventByProviderEventId);
const mockCreateWebhookEvent = vi.mocked(createWebhookEvent);
const mockFindLink = vi.mocked(findPaymentLinkByProviderLinkId);

const SECRET = 'whsec_integration_test';

const T: string = AGENCY_A.tenant.id;

function requestFor(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3100'), init as ConstructorParameters<typeof NextRequest>[1]);
}

function webhookRequest(body: string, signature: string | null): NextRequest {
  return requestFor('/api/webhooks/razorpay', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(signature !== null && { 'x-razorpay-signature': signature }),
    },
  });
}

const sign = (body: string) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

/** §113 — the payload's money/tenant/invoice hints are all lies. */
const capturedBody = (gatewayPaymentId: string) => JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: gatewayPaymentId,
        amount: 888888,
        notes: { invoiceId: 'attacker-invoice', tenantId: 'attacker-tenant' },
      },
    },
  },
});

function gatewayPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-gw-1', tenantId: T, invoiceId: 'inv-real', clientId: 'client-real',
    amount: { amount: 40000, currency: 'INR' }, method: 'RAZORPAY',
    status: 'PENDING', receivedAt: '2026-09-01', createdBy: 'admin-1',
    gateway: 'RAZORPAY', gatewayPaymentId: 'pay_gw_route_1',
    reconciliationStatus: 'PENDING',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  } as Payment;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  mockCreateLog.mockResolvedValue({} as Awaited<ReturnType<typeof createLog>>);
  mockFindByGatewayId.mockResolvedValue(null);
  mockGetPaymentById.mockResolvedValue(null);
  mockUpdatePayment.mockResolvedValue(true as Awaited<ReturnType<typeof updatePayment>>);
  // Module 12 §42 — fresh event row per delivery; no replay short-circuit.
  mockFindWebhookEvent.mockResolvedValue(null);
  mockCreateWebhookEvent.mockResolvedValue({
    id: 'we-route-1', provider: 'RAZORPAY', providerEventId: 'hash',
    eventType: 'payment.captured', receivedAt: new Date(),
    processingStatus: 'RECEIVED', payloadHash: 'hash',
  } as Awaited<ReturnType<typeof createWebhookEvent>>);
  mockFindLink.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

describe('§97/§98 — no session, the signature is the auth', () => {
  it('a POST without a signature header → 401, domain untouched', async () => {
    const res = await webhookRoute(webhookRequest(capturedBody('pay_gw_route_1'), null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ received: false, outcome: 'SIGNATURE_INVALID' });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('a garbage signature → 401', async () => {
    const res = await webhookRoute(webhookRequest(capturedBody('pay_gw_route_1'), 'deadbeef'));
    expect(res.status).toBe(401);
    expect((await res.json()).outcome).toBe('SIGNATURE_INVALID');
  });

  it('the signature is over the RAW bytes — signing a DIFFERENT body fails', async () => {
    const res = await webhookRoute(webhookRequest(capturedBody('pay_gw_route_1'), sign(capturedBody('pay_OTHER'))));
    expect(res.status).toBe(401);
  });

  it('an unconfigured secret fails closed even for a valid signature', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = capturedBody('pay_gw_route_1');
    const res = await webhookRoute(webhookRequest(body, sign(body)));
    expect(res.status).toBe(401);
  });

  it('GET probes learn nothing — 405', async () => {
    const res = await webhookGetRoute();
    expect(res.status).toBe(405);
  });
});

describe('ack contract', () => {
  it('valid signature, non-JSON body → 400 MALFORMED_BODY', async () => {
    const raw = 'not json at all';
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(400);
    expect((await res.json()).outcome).toBe('MALFORMED_BODY');
  });

  it('valid signature, unhandled event → 200 {received: true, outcome: UNHANDLED_EVENT}', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: { payment: { entity: { id: 'pay_x' } } } });
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.outcome).toBe('UNHANDLED_EVENT');
    expect(mockFindByGatewayId).not.toHaveBeenCalled();
  });

  it('captured event with NO stored payment → 200 UNRESOLVED_PAYMENT (never a 4xx retry storm)', async () => {
    const raw = capturedBody('pay_unknown_route');
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ received: true, outcome: 'UNRESOLVED_PAYMENT' });
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

describe('§99 replay + §113 store-wins resolution', () => {
  it('a stored non-PENDING payment → 200 REPLAY_ACKED and the domain is NEVER invoked', async () => {
    mockFindByGatewayId.mockResolvedValue(gatewayPayment({
      status: 'CONFIRMED', reconciliationStatus: 'RECONCILED', transactionId: 'tx-1',
    }));
    const raw = capturedBody('pay_gw_route_1');
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ received: true, outcome: 'REPLAY_ACKED', paymentId: 'pay-gw-1' });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockUpdatePayment).not.toHaveBeenCalled();
  });

  it('§113 — payload lies are ignored: the STORED payment/tenant is what confirmPayment receives', async () => {
    mockFindByGatewayId.mockResolvedValue(gatewayPayment());
    mockConfirm.mockResolvedValue({
      ok: true, status: 200,
      data: { payment: gatewayPayment({ status: 'CONFIRMED' }), invoice: {}, transactionId: 'tx-core-9' },
    } as never);
    const raw = capturedBody('pay_gw_route_1');
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ received: true, outcome: 'CONFIRMED', paymentId: 'pay-gw-1' });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const [paymentId, tenantId] = mockConfirm.mock.calls[0];
    expect(paymentId).toBe('pay-gw-1');
    expect(tenantId).toBe(T);
    // The payload's fabricated hints reached nothing.
    const serialized = JSON.stringify(mockConfirm.mock.calls[0]);
    expect(serialized).not.toContain('attacker-invoice');
    expect(serialized).not.toContain('attacker-tenant');
    expect(serialized).not.toContain('888888');
  });

  it('§115 — a domain refusal → 200 RECONCILIATION_ERROR with the ERROR stamp', async () => {
    mockFindByGatewayId.mockResolvedValue(gatewayPayment());
    mockConfirm.mockResolvedValue({
      ok: false, status: 400, error: 'Payment exceeds the outstanding invoice balance',
      code: 'PAYMENT_EXCEEDS_BALANCE',
    } as never);
    const raw = capturedBody('pay_gw_route_1');
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('RECONCILIATION_ERROR');
    expect(mockUpdatePayment).toHaveBeenCalledWith('pay-gw-1', T, { reconciliationStatus: 'ERROR' });
  });

  it('a transient domain failure → 500 RETRY_LATER (the gateway retries — 10F recovery)', async () => {
    mockFindByGatewayId.mockResolvedValue(gatewayPayment());
    mockConfirm.mockResolvedValue({ ok: false, status: 500, error: 'ledger write failed' } as never);
    const raw = capturedBody('pay_gw_route_1');
    const res = await webhookRoute(webhookRequest(raw, sign(raw)));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ received: false, outcome: 'RETRY_LATER' });
    expect(mockUpdatePayment).not.toHaveBeenCalled(); // stays PENDING, not ERROR
  });
});
