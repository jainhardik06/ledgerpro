"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { X, IndianRupee } from 'lucide-react';
import type { Invoice } from '@/lib/agency/types/invoice';
import type { PaymentMethod } from '@/lib/agency/types/payment';
import { PAYMENT_METHODS, invoiceAcceptsPayments } from '@/lib/agency/types/payment';
import { cashPortionOf, calculatePaymentBalance, wouldOverpay } from '@/lib/agency/domain/payment-calculation';
import { makeMoney } from '@/lib/agency/types/money';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

/**
 * Record Payment drawer (Module 10 §88–§92/§108). Records a MANUAL payment
 * — it lands PENDING (§101: nothing moves until it is confirmed). Partial
 * amounts are normal (§90); withholding/TDS is a separate field (§92 — the
 * invoice settles by the full amount, only amount − withholding reaches the
 * account). The account may be chosen here or at confirmation (§108).
 *
 * The preview math runs through the shared engine (payment-calculation.ts)
 * — the drawer never re-derives money (§127).
 */
interface AccountRow { id?: string; name: string; type: string }

const METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CASH: 'Cash',
  CARD: 'Card',
  RAZORPAY: 'Razorpay',
  OTHER: 'Other',
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface PaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pre-select an invoice (the invoice detail page's deep link). */
  defaultInvoiceId?: string;
}

export function PaymentDrawer({ isOpen, onClose, onSaved, defaultInvoiceId }: PaymentDrawerProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [withholding, setWithholding] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [accountId, setAccountId] = useState('');
  const [receivedAt, setReceivedAt] = useState(todayLocal());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Payable invoices only: issued, not retired, not fully settled (§89 —
    // a payment always settles a numbered invoice).
    fetch('/api/agency/invoices')
      .then(res => res.json())
      .then(body => {
        const payable: Invoice[] = (body.invoices || []).filter((i: Invoice) => invoiceAcceptsPayments(i.status));
        setInvoices(payable);
        setClientNames(body.clientNames || {});
        if (defaultInvoiceId && payable.some(i => i.id === defaultInvoiceId)) {
          setInvoiceId(defaultInvoiceId);
        }
      })
      .catch(() => setError('We couldn\'t load the invoices.'));
    fetch('/api/accounts')
      .then(res => res.json())
      .then(body => setAccounts(body.accounts || []))
      .catch(() => setAccounts([]));
  }, [isOpen, defaultInvoiceId]);

  const selected = invoices.find(i => i.id === invoiceId);

  // Prefill the outstanding balance when an invoice is picked (still fully
  // editable — partial payments are the norm, §90).
  useEffect(() => {
    if (selected) setAmount(String(selected.amountDue.amount));
  }, [invoiceId]);

  // §127 — the preview runs the shared engine on a simulated CONFIRMED
  // payment, never drawer math.
  const preview = useMemo(() => {
    if (!selected) return null;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const wh = Number(withholding);
    const payment = {
      amount: makeMoney(amt, selected.currency),
      ...(Number.isFinite(wh) && wh > 0 ? { withholdingAmount: makeMoney(wh, selected.currency) } : {}),
      status: 'PENDING' as const,
    };
    const cash = cashPortionOf(payment);
    const settledBefore = makeMoney(selected.total.amount - selected.amountDue.amount, selected.currency);
    const after = calculatePaymentBalance(selected.total, [{ ...payment, status: 'CONFIRMED' as const }]);
    return {
      cash,
      balanceAfter: after.amountDue.amount,
      overpay: wouldOverpay(selected.total, settledBefore, payment.amount),
    };
  }, [selected, amount, withholding]);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agency/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          amount: Number(amount),
          ...(withholding.trim() !== '' && { withholdingAmount: Number(withholding) }),
          method,
          ...(accountId && { accountId }),
          receivedAt,
          ...(reference.trim() !== '' && { reference: reference.trim() }),
          ...(notes.trim() !== '' && { notes: notes.trim() }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'The payment was rejected.');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  const inputCls = 'w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/25';
  const labelCls = 'block text-[11.5px] font-medium text-neutral-400 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Record payment">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md h-full overflow-y-auto bg-[#0a0a0a] border-l border-white/[0.08] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-neutral-400" aria-hidden />
            <h2 className="text-[15px] font-semibold text-white">Record payment</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-neutral-500 hover:text-white transition-colors">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <p className="text-[12px] text-neutral-500">
          Record payment received against an invoice. Payments are recorded as pending until confirmed to update account ledgers.
        </p>

        {error && (
          <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-3 text-[12.5px] text-red-300">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="payment-invoice" className={labelCls}>Invoice</label>
          <Select
            id="payment-invoice"
            value={invoiceId}
            onChange={e => setInvoiceId(e.target.value)}
            className={inputCls}
          >
            <option value="">Select an invoice…</option>
            {invoices.map(i => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber || 'Draft Invoice'} — {clientNames[i.clientId] || 'Client'} — due {i.currency === 'INR' ? '₹' : ''}{i.amountDue.amount.toLocaleString('en-IN')}
              </option>
            ))}
          </Select>
          {invoices.length === 0 && (
            <p className="mt-1.5 text-[11.5px] text-neutral-600">No payable invoices found. Invoices must be finalized and issued before receiving payments.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="payment-amount" className={labelCls}>Amount received (settlement) *</label>
            <input
              id="payment-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="payment-withholding" className={labelCls}>Withheld / TDS</label>
            <input
              id="payment-withholding"
              type="number"
              min="0"
              step="0.01"
              value={withholding}
              onChange={e => setWithholding(e.target.value)}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="payment-method" className={labelCls}>Method *</label>
            <Select
              id="payment-method"
              value={method}
              onChange={e => setMethod(e.target.value as PaymentMethod)}
              className={inputCls}
            >
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="payment-received" className={labelCls}>Received on *</label>
            <DatePicker
              id="payment-received"
              value={receivedAt}
              max={todayLocal()}
              onChange={e => setReceivedAt(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="payment-account" className={labelCls}>Receiving Account</label>
          <Select
            id="payment-account"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">Choose at confirmation…</option>
            {accounts.filter(a => a.id).map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </Select>
          <p className="mt-1.5 text-[11px] text-neutral-600">A confirmed payment must enter a tracked account — pick it now or when confirming.</p>
        </div>

        <div>
          <label htmlFor="payment-reference" className={labelCls}>Reference (UTR / cheque no.)</label>
          <input
            id="payment-reference"
            type="text"
            maxLength={200}
            value={reference}
            onChange={e => setReference(e.target.value)}
            placeholder="e.g. UTR 004512…"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="payment-notes" className={labelCls}>Notes</label>
          <textarea
            id="payment-notes"
            maxLength={2000}
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className={inputCls}
          />
        </div>

        {preview && selected && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[12px] space-y-1">
            <div className="flex justify-between text-neutral-400">
              <span>Settles against {selected.invoiceNumber ?? 'invoice'}</span>
              <span className="tabular-nums text-neutral-200">{preview.balanceAfter.toLocaleString('en-IN')} remaining</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Net deposit amount</span>
              <span className="tabular-nums text-neutral-200">{preview.cash.amount.toLocaleString('en-IN')} {preview.cash.currency}</span>
            </div>
            {preview.overpay && (
              <p className="text-amber-300">This exceeds the outstanding balance for this invoice.</p>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-[12.5px] text-neutral-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !invoiceId || !amount || Number(amount) <= 0}
            className="px-4 py-2 rounded-lg bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
