/**
 * Agency Vertical — Query: gateway payment reconciliation overview (Module 10, §115/§128)
 *
 * The 10F visibility surface: where does gateway money stand, and does the
 * ledger agree with the engine? Pure READ — it never writes, never retries
 * (retryGatewayPayment in the domain service is the write path).
 *
 *   §115 every gateway payment carries a reconciliation state —
 *        RECONCILED (the webhook confirmed the money into the ledger),
 *        PENDING (recorded, the webhook has not landed / not finished), or
 *        ERROR (the domain refused the gateway's capture — e.g. §91: the
 *        invoice settled by other means first). Manual payments never
 *        carry the field.
 *   §128 the consistency diagnostic — the §104 engine's expected position
 *        (settled/due recomputed from the FULL payment list) vs the stored
 *        invoice money. Any drift is surfaced here, per invoice touched by
 *        gateway money; §129 integrity (a CONFIRMED payment with no core
 *        transaction) is flagged, never silently absorbed.
 */
import { getPayments, getInvoiceById } from '@/lib/db';
import type { Payment, PaymentStatus } from '../types/payment';
import type { Invoice } from '../types/invoice';
import { calculatePaymentBalance } from '../domain/payment-calculation';

export interface GatewayPaymentRow {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientId: string;
  gateway: string;
  gatewayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reconciliationStatus: 'RECONCILED' | 'PENDING' | 'ERROR' | 'UNSET';
  transactionId: string | null;
  accountId: string | null;
  receivedAt: string;
}

export interface InvoiceConsistencyRow {
  invoiceId: string;
  invoiceNumber: string | null;
  /** §104 engine — Σ CONFIRMED − Σ REVERSED recomputed from the full list. */
  expectedSettled: number;
  /** Stored invoice.amountPaid. */
  storedSettled: number;
  expectedDue: number;
  storedDue: number;
  consistent: boolean;
}

export interface ReconciliationOverview {
  /** Gateway payments only (§115 — manual ones are reconciled by construction). */
  gatewayPayments: GatewayPaymentRow[];
  counts: {
    total: number;
    byPaymentStatus: Record<PaymentStatus, number>;
    byReconciliationStatus: { RECONCILED: number; PENDING: number; ERROR: number; UNSET: number };
  };
  /** §128 — drift check for every invoice touched by gateway money. */
  consistency: InvoiceConsistencyRow[];
  inconsistentInvoices: number;
  /** §129 — CONFIRMED payments missing their ONE core transaction. */
  confirmedWithoutTransaction: string[];
}

export async function getReconciliationOverview(tenantId: string): Promise<ReconciliationOverview> {
  const payments = await getPayments(tenantId, {});
  const gatewayPayments = payments.filter(p => p.gateway !== undefined);

  const byPaymentStatus: Record<PaymentStatus, number> = { PENDING: 0, CONFIRMED: 0, FAILED: 0, REVERSED: 0 };
  const byReconciliationStatus = { RECONCILED: 0, PENDING: 0, ERROR: 0, UNSET: 0 };
  const confirmedWithoutTransaction: string[] = [];

  const rows: GatewayPaymentRow[] = [];
  const invoicesById = new Map<string, Invoice>();
  for (const payment of gatewayPayments) {
    byPaymentStatus[payment.status] += 1;
    const recon = payment.reconciliationStatus ?? 'UNSET';
    byReconciliationStatus[recon] += 1;
    if (payment.status === 'CONFIRMED' && !payment.transactionId) {
      confirmedWithoutTransaction.push(payment.id);
    }
    if (!invoicesById.has(payment.invoiceId)) {
      const invoice = await getInvoiceById(payment.invoiceId, tenantId);
      if (invoice) invoicesById.set(payment.invoiceId, invoice);
    }
    const invoice = invoicesById.get(payment.invoiceId);
    rows.push({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      clientId: payment.clientId,
      gateway: payment.gateway!,
      gatewayPaymentId: payment.gatewayPaymentId ?? '',
      amount: payment.amount.amount,
      currency: payment.amount.currency,
      status: payment.status,
      reconciliationStatus: recon,
      transactionId: payment.transactionId ?? null,
      accountId: payment.accountId ?? null,
      receivedAt: payment.receivedAt,
    });
  }

  // §128 — recompute each touched invoice's position from its FULL payment
  // list through the engine and compare with the stored money.
  const consistency: InvoiceConsistencyRow[] = [];
  for (const [invoiceId, invoice] of invoicesById) {
    const paymentsForInvoice = await getPayments(tenantId, { invoiceId });
    const balance = calculatePaymentBalance(invoice.total, paymentsForInvoice);
    consistency.push({
      invoiceId,
      invoiceNumber: invoice.invoiceNumber ?? null,
      expectedSettled: balance.settled.amount,
      storedSettled: invoice.amountPaid.amount,
      expectedDue: balance.amountDue.amount,
      storedDue: invoice.amountDue.amount,
      consistent: balance.settled.amount === invoice.amountPaid.amount
        && balance.amountDue.amount === invoice.amountDue.amount,
    });
  }
  consistency.sort((a, b) => (a.consistent === b.consistent ? 0 : a.consistent ? 1 : -1));

  return {
    gatewayPayments: rows,
    counts: {
      total: gatewayPayments.length,
      byPaymentStatus,
      byReconciliationStatus,
    },
    consistency,
    inconsistentInvoices: consistency.filter(c => !c.consistent).length,
    confirmedWithoutTransaction,
  };
}
