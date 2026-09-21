/**
 * Module 10 (Sprint 10D §96/§108/§115, 10F retry) — Unit: gateway payment
 * INTAKE + manual reconciliation retry, through the real domain services
 * with an in-memory echo store.
 *
 *   - §96   a gateway reference is stored exactly once — duplicate intake
 *           409s with GATEWAY_PAYMENT_DUPLICATE (the webhook settles the
 *           ORIGINAL record, never a second one)
 *   - §101/§115 gateway intake lands PENDING with reconciliationStatus
 *           PENDING; confirming (webhook or retry) flips it to RECONCILED
 *   - §108  a gateway payment confirms without a payload accountId (its
 *           gateway record IS the provenance; an account may still be named)
 *   - 10F   retryGatewayPayment: manual payments 400; non-PENDING 409;
 *           success → RECONCILED; a domain refusal stamps ERROR (§115) and
 *           stays visible; a transient 500 does NOT stamp ERROR (the
 *           gateway/manual retry is the recovery path)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  getInvoiceById: vi.fn(),
  updateInvoice: vi.fn(),
  getTenantById: vi.fn(),
  getPayments: vi.fn(),
  getPaymentById: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  getAccountById: vi.fn(),
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  findPaymentByGatewayId: vi.fn(),
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getInvoiceById, getPayments, getPaymentById,
  createPayment as createPaymentRepo, updatePayment as updatePaymentRepo,
  updateInvoice as updateInvoiceRepo, getAccountById,
  createTransaction, deleteTransaction, findPaymentByGatewayId,
  type PaymentCreateInput,
} from '@/lib/db';
import {
  recordManualPayment, confirmPayment, retryGatewayPayment,
} from '@/lib/agency/domain/agency.payments';
import type { Payment } from '@/lib/agency/types/payment';
import type { Invoice } from '@/lib/agency/types/invoice';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

const h = vi.hoisted(() => ({
  invoices: new Map<string, Invoice>(),
  payments: new Map<string, Payment>(),
  transactions: [] as Array<Record<string, unknown>>,
  deletedTx: [] as string[],
  seq: 0,
}));

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1', tenantId: TENANT, clientId: 'client-1', projectId: 'proj-1',
    invoiceNumber: 'INV-2026-0001', issueDate: TODAY, dueDate: TODAY, currency: 'INR',
    subtotal: makeMoney(100000), discount: zeroMoney('INR'),
    taxLines: [], taxTotal: zeroMoney('INR'), total: makeMoney(100000),
    amountPaid: zeroMoney('INR'), amountDue: makeMoney(100000),
    status: 'SENT', createdBy: 'admin-1',
    createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.invoices.clear();
  h.payments.clear();
  h.transactions.length = 0;
  h.deletedTx.length = 0;
  h.seq = 0;
  h.invoices.set('inv-1', invoice());

  vi.mocked(getInvoiceById).mockImplementation(async (id: string) => h.invoices.get(id) ?? null);
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
    (id === 'acct-1'
      ? { id: 'acct-1', tenantId: TENANT, name: 'HDFC Current', type: 'Bank' }
      : null) as Awaited<ReturnType<typeof getAccountById>>);
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
  // §113 semantics — the lookup is tenant-AGNOSTIC by design (the webhook
  // payload never states a tenant).
  vi.mocked(findPaymentByGatewayId).mockImplementation(async (gateway: string, gatewayPaymentId: string) =>
    [...h.payments.values()].find(p => p.gateway === gateway && p.gatewayPaymentId === gatewayPaymentId) ?? null);
});

async function recorded(payload: Record<string, unknown>): Promise<Payment> {
  const res = await recordManualPayment(TENANT, ACTOR_ADMIN, payload, audit);
  if (!res.ok || !res.data) throw new Error(`record failed: ${res.status} ${res.error}`);
  return res.data;
}

function storedPayment(id: string): Payment {
  const p = h.payments.get(id);
  if (!p) throw new Error(`payment ${id} not in store`);
  return p;
}

describe('10D gateway intake via recordManualPayment (§96/§101/§115)', () => {
  it('lands PENDING carrying the gateway identity + reconciliationStatus PENDING', async () => {
    const p = await recorded({
      invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_A',
    });
    expect(p.status).toBe('PENDING');               // §101 — no money moved
    expect(p.gateway).toBe('RAZORPAY');
    expect(p.gatewayPaymentId).toBe('pay_gw_A');
    expect(p.reconciliationStatus).toBe('PENDING'); // §115 — until the webhook confirms
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('§96 — the same gateway reference can never be recorded twice: 409 GATEWAY_PAYMENT_DUPLICATE', async () => {
    await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_dup' });
    const second = await recordManualPayment(TENANT, ACTOR_ADMIN, {
      invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_dup',
    }, audit);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.code).toBe('GATEWAY_PAYMENT_DUPLICATE');
      expect(second.error).toMatch(/§96/);
    }
    expect(h.payments.size).toBe(1); // only the original
  });

  it('§96 guard is reference-scoped: a DIFFERENT gateway id records fine', async () => {
    await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_1' });
    const other = await recorded({ invoiceId: 'inv-1', amount: 2000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_2' });
    expect(other.gatewayPaymentId).toBe('pay_gw_2');
  });

  it('a gateway reference on a non-gateway method is a 400 (validator 10D)', async () => {
    const res = await recordManualPayment(TENANT, ACTOR_ADMIN, {
      invoiceId: 'inv-1', amount: 1000, method: 'BANK_TRANSFER', gatewayPaymentId: 'pay_gw_x',
    }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/gatewayPaymentId/);
    }
    expect(h.payments.size).toBe(0);
  });

  it('Module 12 §47 — the gateway LINK id (plink_…) rides along as lineage, same discipline', async () => {
    const p = await recorded({
      invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY',
      gatewayPaymentId: 'pay_gw_pl', gatewayLinkId: 'plink_9',
    });
    expect(p.gatewayLinkId).toBe('plink_9'); // stored — the reconciliation view resolves it
    expect(p.source).toBe('RAZORPAY');

    // non-gateway methods may not carry it either
    const res = await recordManualPayment(TENANT, ACTOR_ADMIN, {
      invoiceId: 'inv-1', amount: 1000, method: 'BANK_TRANSFER', gatewayLinkId: 'plink_x',
    }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/gatewayLinkId/);
    expect(h.payments.size).toBe(1); // only the gateway one
  });

  it('confirming a gateway payment flips reconciliationStatus to RECONCILED (§115) and needs no payload account (§108 gateway path)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_c' });
    const res = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, undefined, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    const stored = storedPayment(p.id!);
    expect(stored.status).toBe('CONFIRMED');
    expect(stored.reconciliationStatus).toBe('RECONCILED');
    expect(stored.transactionId).toBeDefined();
    expect(res.data.invoice.status).toBe('PARTIALLY_PAID');
    expect(h.transactions).toHaveLength(1); // §129 — exactly one Credit
    expect((h.transactions[0] as Record<string, any>).type).toBe('Credit');
  });

  it('a gateway payment may still name the account the money lands in', async () => {
    const p = await recorded({
      invoiceId: 'inv-1', amount: 100000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_acct', accountId: 'acct-1',
    });
    const res = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, undefined, audit);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((h.transactions[0] as Record<string, any>).accountId).toBe('acct-1');
    expect(storedPayment(p.id!).accountId).toBe('acct-1');
  });
});

describe('10F retryGatewayPayment (§102/§115)', () => {
  it('a MANUAL payment has no reconciliation state — 400', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'BANK_TRANSFER' });
    const res = await retryGatewayPayment(p.id!, TENANT, ACTOR_ADMIN, undefined, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/§115/);
    }
  });

  it('only a PENDING gateway payment can be retried — CONFIRMED is a 409 (§102)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_r1' });
    await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, undefined, audit);
    const res = await retryGatewayPayment(p.id!, TENANT, ACTOR_ADMIN, undefined, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error).toMatch(/§102/);
    }
    expect(h.transactions).toHaveLength(1); // no duplicate Credit from the retry
  });

  it('success: the retry confirms through the NORMAL path and lands RECONCILED', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_r2' });
    const res = await retryGatewayPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    const stored = storedPayment(p.id!);
    expect(stored.status).toBe('CONFIRMED');
    expect(stored.reconciliationStatus).toBe('RECONCILED');
    expect(res.data.invoice.amountDue).toEqual(makeMoney(60000));
    expect(h.transactions).toHaveLength(1);
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_RECONCILIATION_RETRY_SUCCEEDED')).toBe(true);
  });

  it('§115 — a retry the domain REFUSES stamps reconciliationStatus ERROR and returns the rejection', async () => {
    // 40k confirmed of a 100k invoice → 60k due; a 70k gateway retry overpays (§91).
    const first = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER', accountId: 'acct-1' });
    await confirmPayment(first.id!, TENANT, ACTOR_ADMIN, {}, audit);
    const p = await recorded({ invoiceId: 'inv-1', amount: 70000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_r3' });

    const res = await retryGatewayPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    }
    const stored = storedPayment(p.id!);
    expect(stored.status).toBe('PENDING');                  // nothing moved
    expect(stored.reconciliationStatus).toBe('ERROR');       // §115 — visible in the overview
    expect(h.transactions).toHaveLength(1);                  // only the manual 40k Credit
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_RECONCILIATION_RETRY_REJECTED')).toBe(true);
  });

  it('a TRANSIENT failure (500, compensation already ran) does NOT stamp ERROR — retry is the recovery', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'RAZORPAY', gatewayPaymentId: 'pay_gw_r4' });
    vi.mocked(updateInvoiceRepo).mockImplementation(async () => false); // force the §114 500 path
    const res = await retryGatewayPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    const stored = storedPayment(p.id!);
    expect(stored.status).toBe('PENDING');              // rolled back
    expect(stored.reconciliationStatus).toBe('PENDING'); // NOT ERROR — transient
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_RECONCILIATION_RETRY_REJECTED')).toBe(false);
  });

  it('a missing payment is an identical 404 (§113)', async () => {
    const res = await retryGatewayPayment('pay-nope', TENANT, ACTOR_ADMIN, undefined, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });
});
