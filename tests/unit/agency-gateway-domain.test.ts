/**
 * Module 10 (Sprint 10D §96–§99/§111–§113) — Unit: the Razorpay adapter.
 *
 * Pins the gateway port's security contract with NO network and NO db:
 *   - §97 signature verification: HMAC-SHA256 over the RAW body, timing-safe
 *     compare, fail CLOSED (no secret ⇒ nothing is trusted), tamper-proof
 *   - §113 webhook parsing: only the event type + gateway payment id are
 *     ever surfaced — amount/invoice/tenant/account hints in the payload
 *     are dropped on the floor
 *   - §111 the port's fail-closed behavior when the API pair is absent
 *   - 10D validator: the gateway reference is legal only on a gateway method
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { razorpayGateway, __testing } from '@/lib/agency/domain/razorpay-gateway';
import { validatePaymentRecord } from '@/lib/agency/validators/payment';

const SECRET = 'whsec_unit_test_1234';

function sign(body: string, secret: string = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

const CAPTURED = JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_abc123',
        amount: 40000000,      // a LIE the domain must never read (§113)
        currency: 'INR',
        status: 'captured',
        notes: { invoice_id: 'someone-elses-invoice', tenantId: 'attacker-tenant' },
      },
    },
  },
});

describe('§97 razorpay signature verification', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });
  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('accepts a correctly signed raw body', () => {
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, sign(CAPTURED))).toBe(true);
  });

  it('rejects a wrong signature, a tampered body, and a missing header', () => {
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, sign(CAPTURED, 'whsec_wrong'))).toBe(false);
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED + ' ', sign(CAPTURED))).toBe(false);
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, null)).toBe(false);
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, '')).toBe(false);
  });

  it('§97 — FAILS CLOSED when no webhook secret is configured', () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, sign(CAPTURED))).toBe(false);
  });

  it('tolerates case and whitespace in the header (Razorpay sends lowercase hex)', () => {
    expect(razorpayGateway.verifyWebhookSignature(CAPTURED, '  ' + sign(CAPTURED).toUpperCase() + ' ')).toBe(true);
  });

  it('hexEqual: equal strings pass, length mismatches fail, never throws', () => {
    expect(__testing.hexEqual('aabb', 'aabb')).toBe(true);
    expect(__testing.hexEqual('aabb', 'AABB')).toBe(false); // raw compare — case folding happens in the caller
    expect(__testing.hexEqual('aabb', 'aabbcc')).toBe(false);
    expect(__testing.hexEqual('', '')).toBe(true);
  });
});

describe('§113 razorpay webhook parsing', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('payment.captured → PAYMENT_CAPTURED with the entity id', () => {
    const event = razorpayGateway.parseWebhookEvent(JSON.parse(CAPTURED));
    expect(event.gateway).toBe('RAZORPAY');
    expect(event.eventType).toBe('PAYMENT_CAPTURED');
    expect(event.gatewayPaymentId).toBe('pay_abc123');
  });

  it('payment_link.paid → PAYMENT_CAPTURED too (the money event)', () => {
    const event = razorpayGateway.parseWebhookEvent({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: 'plink_1' } },
        payment: { entity: { id: 'pay_linkpaid_1' } },
      },
    });
    expect(event.eventType).toBe('PAYMENT_CAPTURED');
    expect(event.gatewayPaymentId).toBe('pay_linkpaid_1');
  });

  it('payment.failed → PAYMENT_FAILED', () => {
    const event = razorpayGateway.parseWebhookEvent({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_fail_1' } } },
    });
    expect(event.eventType).toBe('PAYMENT_FAILED');
    expect(event.gatewayPaymentId).toBe('pay_fail_1');
  });

  it('other events (authorized, refunds, settlements) are UNHANDLED — acknowledged, not acted on', () => {
    for (const eventName of ['payment.authorized', 'refund.processed', 'settlement.processed', 'ping']) {
      const event = razorpayGateway.parseWebhookEvent({
        event: eventName,
        payload: { payment: { entity: { id: 'pay_x' } } },
      });
      expect(event.eventType).toBe('UNHANDLED');
      expect(event.gatewayPaymentId).toBeUndefined();
    }
  });

  it('§113 — the parsed event carries ONLY gateway/eventType/gatewayPaymentId; the payload lies are dropped', () => {
    const event = razorpayGateway.parseWebhookEvent(JSON.parse(CAPTURED));
    expect(Object.keys(event).sort()).toEqual(['eventType', 'gateway', 'gatewayPaymentId']);
  });

  it('shape-defensive: garbage payloads are UNHANDLED, never a crash', () => {
    expect(razorpayGateway.parseWebhookEvent(null).eventType).toBe('UNHANDLED');
    expect(razorpayGateway.parseWebhookEvent('string').eventType).toBe('UNHANDLED');
    expect(razorpayGateway.parseWebhookEvent({}).eventType).toBe('UNHANDLED');
    expect(razorpayGateway.parseWebhookEvent({ event: 'payment.captured' }).eventType).toBe('UNHANDLED');
    expect(razorpayGateway.parseWebhookEvent({ event: 'payment.captured', payload: {} }).eventType).toBe('UNHANDLED');
    expect(razorpayGateway.parseWebhookEvent({
      event: 'payment.captured', payload: { payment: { entity: { id: '' } } },
    }).eventType).toBe('UNHANDLED');
  });
});

describe('§111 the port fails closed without API keys', () => {
  beforeEach(() => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it('createPaymentLink → 503 when unconfigured (no network is ever attempted)', async () => {
    const result = await razorpayGateway.createPaymentLink({
      invoiceId: 'inv-1', clientId: 'c1', amount: { amount: 100000, currency: 'INR' },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });

  it('getPayment → 503 when unconfigured', async () => {
    const result = await razorpayGateway.getPayment('pay_abc');
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
  });
});

describe('10D validator — the gateway reference at manual intake', () => {
  const today = '2026-09-12';
  const base = { invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', receivedAt: today };

  it('accepts a Razorpay payment carrying its gateway reference', () => {
    const v = validatePaymentRecord({ ...base, gatewayPaymentId: 'pay_manual_1' }, today);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.gatewayPaymentId).toBe('pay_manual_1');
  });

  it('rejects a gateway reference on a NON-gateway method', () => {
    const v = validatePaymentRecord({
      ...base, method: 'BANK_TRANSFER', gatewayPaymentId: 'pay_manual_1',
    }, today);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.some(e => e.field === 'gatewayPaymentId')).toBe(true);
  });

  it('bounds the reference length', () => {
    const v = validatePaymentRecord({ ...base, gatewayPaymentId: 'x'.repeat(101) }, today);
    expect(v.ok).toBe(false);
  });

  it('no reference, no problem — the field is optional', () => {
    expect(validatePaymentRecord(base, today).ok).toBe(true);
  });
});
