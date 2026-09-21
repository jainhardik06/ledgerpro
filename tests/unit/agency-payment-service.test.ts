/**
 * Module 10 (§87–§116) — payment DOMAIN service tests (Sprints 10B/10C).
 *
 * Pins the rules that make collections honest:
 *   - §88/§89 recording: PENDING landing, clientId DERIVED from the invoice,
 *     currency forced to the invoice's (§127 — never converted)
 *   - §91 overpayment rejected at CONFIRMATION (PENDING affects nothing, so
 *     two PENDING payments on one invoice are legal — first confirm wins)
 *   - §108 the confirmed money must enter a tracked, tenant-owned account
 *   - §92 cash = amount − withholding while the invoice settles in full
 *   - §94/§95/§129 confirming creates EXACTLY ONE core Transaction (Credit)
 *     carrying invoiceId + paymentId + clientId + projectId
 *   - §102 the state machine is the no-duplicate-transaction guard
 *   - §103 reversal never deletes — compensating Debit, payment stays history
 *   - §104 the invoice's amountPaid/amountDue/status are recomputed from the
 *     engine (PAID→PARTIALLY_PAID→SENT walk-back; OVERDUE stays, §80)
 *   - §114 compensating rollback: nothing half-confirmed ever persists
 *   - §156 the arithmetic gate, in-domain: 100k → 40k → 60k → PAID, no dupes,
 *     no negatives
 *
 * Repository reads/writes are mocked with an in-memory echo store — the
 * DOMAIN logic (and its rollback choreography) is what these tests pin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

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
  // Transitively imported by agency.clients (AuditContext/DomainResult home).
  createClient: vi.fn(), getClients: vi.fn(),
  updateClient: vi.fn(), searchClients: vi.fn(), findClientByName: vi.fn(),
  getLogs: vi.fn(),
}));

import {
  getInvoiceById, getPayments, getPaymentById,
  createPayment as createPaymentRepo, updatePayment as updatePaymentRepo,
  updateInvoice as updateInvoiceRepo, getAccountById,
  createTransaction, deleteTransaction,
  type PaymentCreateInput,
} from '@/lib/db';
import {
  recordManualPayment, confirmPayment, failPayment, reversePayment,
  getPayment, paymentConsistency,
} from '@/lib/agency/domain/agency.payments';
import type { Payment } from '@/lib/agency/types/payment';
import type { Invoice } from '@/lib/agency/types/invoice';
import { makeMoney, zeroMoney } from '@/lib/agency/types/money';
import { todayInTimezone } from '@/lib/agency/types/dates';

const TENANT = 'tenant-a';
const TODAY = todayInTimezone();
const audit = { username: 'tester', tenantId: TENANT, log: vi.fn() };
const ACTOR_ADMIN = { userId: 'admin-1', role: 'TENANT_ADMIN' as const };

// The in-memory echo store (hoisted so the vi.mock factory can close over it).
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

  vi.mocked(getInvoiceById).mockImplementation(async (id: string) =>
    h.invoices.get(id) ?? null);

  vi.mocked(updateInvoiceRepo).mockImplementation(async (id: string, _t: string, patch: Parameters<typeof updateInvoiceRepo>[2]) => {
    const inv = h.invoices.get(id);
    if (!inv) return false;
    h.invoices.set(id, { ...inv, ...patch } as Invoice);
    return true;
  });

  vi.mocked(getPayments).mockImplementation(async (_t: string, filters?: { invoiceId?: string }) =>
    [...h.payments.values()].filter(p => !filters?.invoiceId || p.invoiceId === filters.invoiceId));

  vi.mocked(getPaymentById).mockImplementation(async (id: string) =>
    h.payments.get(id) ?? null);

  vi.mocked(createPaymentRepo).mockImplementation(async (tenantId: string, input: PaymentCreateInput) => {
    h.seq += 1;
    const p = {
      ...input,
      id: `pay-${h.seq}`,
      tenantId,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Payment;
    h.payments.set(p.id!, p);
    return p;
  });

  vi.mocked(updatePaymentRepo).mockImplementation(async (id: string, _t: string, patch: Partial<Payment>) => {
    const p = h.payments.get(id);
    if (!p) return false;
    h.payments.set(id, { ...p, ...patch });
    return true;
  });

  vi.mocked(getAccountById).mockImplementation(async (id: string, _t: string) =>
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
});

/** Record via the domain (real validation path) and return the stored payment. */
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

describe('10B recordManualPayment (§88–§92)', () => {
  it('lands PENDING with clientId derived and currency forced to the invoice (§89/§101/§127)', async () => {
    const res = await recordManualPayment(TENANT, ACTOR_ADMIN, {
      invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER', receivedAt: TODAY,
    }, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(res.status).toBe(201);
    expect(res.data.status).toBe('PENDING');
    expect(res.data.clientId).toBe('client-1');       // derived, never from payload
    expect(res.data.amount).toEqual(makeMoney(40000)); // INR forced by the invoice
    expect(res.data.createdBy).toBe('admin-1');
    // §101 — recording touched no money.
    expect(createTransaction).not.toHaveBeenCalled();
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_RECORDED')).toBe(true);
  });

  it('defaults receivedAt to today', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'UPI' });
    expect(p.receivedAt).toBe(TODAY);
  });

  it('keeps withholding as a separate Money field (§92)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 100000, method: 'BANK_TRANSFER', withholdingAmount: 10000 });
    expect(p.amount).toEqual(makeMoney(100000));
    expect(p.withholdingAmount).toEqual(makeMoney(10000));
  });

  it('rejects DRAFT (no number, §74), PAID (§91) and VOID invoices with 409s', async () => {
    h.invoices.set('inv-d', invoice({ id: 'inv-d', status: 'DRAFT', invoiceNumber: undefined }));
    h.invoices.set('inv-p', invoice({ id: 'inv-p', status: 'PAID', amountPaid: makeMoney(100000), amountDue: zeroMoney('INR') }));
    h.invoices.set('inv-v', invoice({ id: 'inv-v', status: 'VOID' }));
    for (const [id, why] of [['inv-d', 'draft'], ['inv-p', 'paid'], ['inv-v', 'void']] as const) {
      const res = await recordManualPayment(TENANT, ACTOR_ADMIN, { invoiceId: id, amount: 100, method: 'CASH' }, audit);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toMatch(/draft|already fully paid|cannot receive/i);
      }
      void why;
    }
  });

  it('never converts money — an explicit foreign currency is a 400 (§127)', async () => {
    const res = await recordManualPayment(TENANT, ACTOR_ADMIN, {
      invoiceId: 'inv-1', amount: 100, currency: 'USD', method: 'BANK_TRANSFER',
    }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/never converted/);
    }
  });

  it('rejects invalid payloads (§88/§92): missing invoice, zero amount, withholding > amount', async () => {
    const missing = await recordManualPayment(TENANT, ACTOR_ADMIN, { amount: 100, method: 'CASH' }, audit);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(400);

    const zero = await recordManualPayment(TENANT, ACTOR_ADMIN, { invoiceId: 'inv-1', amount: 0, method: 'CASH' }, audit);
    expect(zero.ok).toBe(false);

    const overheld = await recordManualPayment(TENANT, ACTOR_ADMIN, { invoiceId: 'inv-1', amount: 100, withholdingAmount: 200, method: 'CASH' }, audit);
    expect(overheld.ok).toBe(false);
  });

  it('§113 — a missing (or cross-tenant) invoice is an identical 404', async () => {
    const res = await recordManualPayment(TENANT, ACTOR_ADMIN, { invoiceId: 'inv-x', amount: 100, method: 'CASH' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });
});

describe('10C confirmPayment (§94/§95/§101/§108/§114)', () => {
  it('§156 — 100k invoice: 40k confirm → PARTIALLY_PAID due 60k; 60k confirm → PAID due 0; exactly two Credits, no negatives', async () => {
    const p1 = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER', accountId: 'acct-1' });
    const r1 = await confirmPayment(p1.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(r1.ok).toBe(true);
    if (!r1.ok || !r1.data) return;
    let inv = r1.data.invoice;
    expect(inv.amountPaid).toEqual(makeMoney(40000));
    expect(inv.amountDue).toEqual(makeMoney(60000));
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(r1.data.payment.status).toBe('CONFIRMED');
    expect(r1.data.payment.transactionId).toBe('tx-2'); // linked to its Credit
    expect(storedPayment(p1.id!).accountId).toBe('acct-1');

    const p2 = await recorded({ invoiceId: 'inv-1', amount: 60000, method: 'UPI' });
    const r2 = await confirmPayment(p2.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(r2.ok).toBe(true);
    if (!r2.ok || !r2.data) return;
    inv = r2.data.invoice;
    expect(inv.amountPaid).toEqual(makeMoney(100000));
    expect(inv.amountDue).toEqual(zeroMoney('INR'));
    expect(inv.status).toBe('PAID');

    // §129 — exactly one transaction per confirmed payment, full lineage.
    expect(h.transactions).toHaveLength(2);
    const [t1, t2] = h.transactions as Array<Record<string, any>>;
    expect(t1.type).toBe('Credit'); expect(t1.amount).toBe(40000);
    expect(t2.type).toBe('Credit'); expect(t2.amount).toBe(60000);
    for (const t of [t1, t2]) {
      expect(t.invoiceId).toBe('inv-1');
      expect(t.clientId).toBe('client-1');
      expect(t.projectId).toBe('proj-1');
      expect(t.category).toBe('Payment');
      expect(t.tenantId).toBe(TENANT);
      expect(t.userId).toBe('admin-1');
    }
    expect(t1.paymentId).toBe(p1.id);
    expect(t2.paymentId).toBe(p2.id);
    expect(t1.description).toContain('INV-2026-0001');
    // Never a negative anywhere.
    expect(inv.amountDue.amount).toBeGreaterThanOrEqual(0);
    expect(h.deletedTx).toEqual([]);
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_CONFIRMED')).toBe(true);
    expect(audit.log.mock.calls.some(c => c[0] === 'INVOICE_PAYMENT_STATE_RECOMPUTED')).toBe(true);
  });

  it('§92 — the Credit carries the CASH (amount − withholding) while the invoice settles in full', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 100000, withholdingAmount: 10000, method: 'BANK_TRANSFER' });
    const res = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(h.transactions).toHaveLength(1);
    expect((h.transactions[0] as Record<string, any>).amount).toBe(90000);
    expect((h.transactions[0] as Record<string, any>).notes).toMatch(/withheld 10000/);
    expect(res.data.invoice.amountPaid).toEqual(makeMoney(100000)); // settled in full
    expect(res.data.invoice.status).toBe('PAID');
  });

  it('§108 — a manual payment without an account is a 400; an unknown account is a 404', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    const noAcct = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(noAcct.ok).toBe(false);
    if (!noAcct.ok) {
      expect(noAcct.status).toBe(400);
      expect(noAcct.error).toMatch(/§108/);
    }
    const badAcct = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-x' }, audit);
    expect(badAcct.ok).toBe(false);
    if (!badAcct.ok) expect(badAcct.status).toBe(404);
    expect(createTransaction).not.toHaveBeenCalled(); // nothing moved
  });

  it('§91 — overpayment is rejected at CONFIRMATION with PAYMENT_EXCEEDS_BALANCE', async () => {
    const p1 = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER' });
    const p2 = await recorded({ invoiceId: 'inv-1', amount: 60001, method: 'UPI' });
    const r1 = await confirmPayment(p1.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(r1.ok).toBe(true);
    const r2 = await confirmPayment(p2.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.status).toBe(400);
      expect(r2.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    }
    expect(h.transactions).toHaveLength(1); // only the first confirm's Credit
  });

  it('§101/§91 — two PENDING payments may coexist; the SECOND confirm loses the race', async () => {
    const p1 = await recorded({ invoiceId: 'inv-1', amount: 60000, method: 'UPI' });
    const p2 = await recorded({ invoiceId: 'inv-1', amount: 60000, method: 'UPI' });
    // Both PENDING, both legal — pending affects nothing.
    expect(h.payments.size).toBe(2);
    const r1 = await confirmPayment(p1.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(r1.ok).toBe(true);
    const r2 = await confirmPayment(p2.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.status).toBe(400);
      expect(r2.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    }
    expect(storedPayment(p2.id!).status).toBe('PENDING'); // untouched by the failed confirm
  });

  it('§102 — the state machine is the no-duplicate-transaction guard: double-confirm 409s', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    const first = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(first.ok).toBe(true);
    const second = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.error).toMatch(/§102/);
    }
    expect(h.transactions).toHaveLength(1); // §129 — never a second Credit
  });

  it('§102 — a FAILED payment cannot be confirmed; §127 — a foreign-currency payment is a 400', async () => {
    const failed = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    await failPayment(failed.id!, TENANT, ACTOR_ADMIN, { reason: 'bounce' }, audit);
    const res = await confirmPayment(failed.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);

    h.payments.set('pay-usd', {
      ...storedPayment('pay-1'),
      id: 'pay-usd', status: 'PENDING', amount: { amount: 100, currency: 'USD' },
    } as Payment);
    const fx = await confirmPayment('pay-usd', TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(fx.ok).toBe(false);
    if (!fx.ok) {
      expect(fx.status).toBe(400);
      expect(fx.error).toMatch(/never converted/);
    }
  });
});

describe('10B failPayment (§102)', () => {
  it('PENDING → FAILED touching no money; the audit names the rule', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    const res = await failPayment(p.id!, TENANT, ACTOR_ADMIN, { reason: 'cheque bounced' }, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(res.data.status).toBe('FAILED');
    expect(createTransaction).not.toHaveBeenCalled();
    expect(h.invoices.get('inv-1')!.amountPaid).toEqual(zeroMoney('INR')); // invoice untouched
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_FAILED')).toBe(true);
  });

  it('only a PENDING payment can fail (§102)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    const res = await failPayment(p.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });
});

describe('10B/10C reversePayment (§103/§104)', () => {
  async function fullyPaidInvoice(): Promise<void> {
    const p1 = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER' });
    const p2 = await recorded({ invoiceId: 'inv-1', amount: 60000, method: 'UPI' });
    await confirmPayment(p1.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    await confirmPayment(p2.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(h.invoices.get('inv-1')!.status).toBe('PAID');
  }

  it('§103 — compensating Debit returns the cash; the payment STAYS (REVERSED); status walks back', async () => {
    await fullyPaidInvoice();
    const res = await reversePayment('pay-1', TENANT, ACTOR_ADMIN, { reason: 'chargeback' }, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;

    // The payment is never deleted — history is immutable.
    const p = storedPayment('pay-1');
    expect(p.status).toBe('REVERSED');

    // The compensating Debit carries the same lineage.
    expect(h.transactions).toHaveLength(3);
    const debit = h.transactions[2] as Record<string, any>;
    expect(debit.type).toBe('Debit');
    expect(debit.amount).toBe(40000);
    expect(debit.paymentId).toBe('pay-1');
    expect(debit.invoiceId).toBe('inv-1');
    expect(debit.notes).toMatch(/Reversal of payment pay-1/);

    // The original Credit was NOT touched.
    expect(h.deletedTx).toEqual([]);

    // §104 — settled drops to 60k, the status walks back from PAID.
    const inv = res.data.invoice;
    expect(inv.amountPaid).toEqual(makeMoney(60000));
    expect(inv.amountDue).toEqual(makeMoney(40000));
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(audit.log.mock.calls.some(c => c[0] === 'PAYMENT_REVERSED')).toBe(true);
  });

  it('a full reversal walks the status all the way back to SENT', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 100000, method: 'BANK_TRANSFER' });
    await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(h.invoices.get('inv-1')!.status).toBe('PAID');
    const res = await reversePayment(p.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.data) return;
    expect(res.data.invoice.status).toBe('SENT');
    expect(res.data.invoice.amountDue).toEqual(makeMoney(100000));
    expect(res.data.invoice.amountPaid).toEqual(zeroMoney('INR'));
  });

  it('only a CONFIRMED payment can be reversed (§102)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    const res = await reversePayment(p.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
    expect(createTransaction).not.toHaveBeenCalled();
  });
});

describe('§114 compensating rollback', () => {
  it('confirm: payment update failing deletes the just-created transaction (404)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    vi.mocked(updatePaymentRepo).mockImplementation(async () => false);
    const res = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(h.deletedTx).toHaveLength(1); // the orphan Credit was removed
  });

  it('confirm: invoice recompute failing reverts the payment AND deletes the transaction (500)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    vi.mocked(updateInvoiceRepo).mockImplementation(async () => false);
    const res = await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    const stored = storedPayment(p.id!);
    expect(stored.status).toBe('PENDING');        // reverted
    expect(stored.transactionId).toBeNull();      // unlinked
    expect(h.deletedTx).toHaveLength(1);          // the Credit removed
  });

  it('reverse: invoice recompute failing restores CONFIRMED and deletes the Debit (500)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    vi.mocked(updateInvoiceRepo).mockImplementation(async () => false);
    const res = await reversePayment(p.id!, TENANT, ACTOR_ADMIN, {}, audit);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
    expect(storedPayment(p.id!).status).toBe('CONFIRMED'); // restored
    expect(h.deletedTx).toHaveLength(1);                   // the Debit removed
  });
});

describe('reads (§116/§128)', () => {
  it('getPayment attaches the invoice; missing payments are 404s', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 1000, method: 'CASH' });
    const res = await getPayment(p.id!, TENANT);
    expect(res.ok).toBe(true);
    if (res.ok && res.data) {
      expect(res.data.payment.id).toBe(p.id);
      expect(res.data.invoice?.id).toBe('inv-1');
    }
    const missing = await getPayment('pay-nope', TENANT);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
  });

  it('paymentConsistency compares the engine against the stored state (§128)', async () => {
    const p = await recorded({ invoiceId: 'inv-1', amount: 40000, method: 'BANK_TRANSFER' });
    await confirmPayment(p.id!, TENANT, ACTOR_ADMIN, { accountId: 'acct-1' }, audit);
    const good = await paymentConsistency(TENANT, 'inv-1');
    expect(good.ok).toBe(true);
    if (good.ok && good.data) expect(good.data.consistent).toBe(true);

    // Drift the stored due — the checker must notice.
    const inv = h.invoices.get('inv-1')!;
    h.invoices.set('inv-1', { ...inv, amountDue: makeMoney(123) });
    const bad = await paymentConsistency(TENANT, 'inv-1');
    expect(bad.ok).toBe(true);
    if (bad.ok && bad.data) expect(bad.data.consistent).toBe(false);
  });
});
