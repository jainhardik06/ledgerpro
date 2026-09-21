"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { IndianRupee, Plus, Check, X, Undo2 } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Payment, PaymentStatus } from '@/lib/agency/types/payment';
import { PaymentDrawer } from '@/components/agency/payments/PaymentDrawer';
import { Select } from '@/components/ui/Select';
import { confirmModal } from '@/components/ui/Dialog';

/**
 * Payments (Module 10 §116) — the collections view. Readable by the whole
 * agency workspace (the collections picture is shared context); recording,
 * confirming, failing and reversing are admin surfaces (§110 — money
 * movement is admin/finance work).
 *
 * §101 — only CONFIRMED rows touched money; PENDING rows await confirmation
 * and affect nothing. §103 — REVERSED rows stay in history (they are never
 * deleted); their cash was returned by a compensating transaction.
 */
const STATUS_STYLE: Record<PaymentStatus, string> = {
  PENDING: 'text-amber-300 bg-amber-400/10',
  CONFIRMED: 'text-emerald-300 bg-emerald-400/10',
  FAILED: 'text-neutral-500 bg-white/[0.03]',
  REVERSED: 'text-red-300 bg-red-400/10',
};

const METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CASH: 'Cash',
  CARD: 'Card', RAZORPAY: 'Razorpay', OTHER: 'Other',
};

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

interface ListResponse {
  success: boolean;
  payments: Payment[];
  invoiceLabels: Record<string, string>;
  clientNames: Record<string, string>;
}

export default function PaymentsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<Payment[]>([]);
  const [invoiceLabels, setInvoiceLabels] = useState<Record<string, string>>({});
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<Array<{ id?: string; name: string; type: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | PaymentStatus>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInvoice, setDrawerInvoice] = useState<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  /** §108 — the account picker shown when a PENDING payment has none. */
  const [confirming, setConfirming] = useState<Payment | null>(null);
  const [confirmAccount, setConfirmAccount] = useState('');

  useEffect(() => {
    if (!allowed) return;
    fetch('/api/accounts')
      .then(res => res.json())
      .then(body => setAccounts(body.accounts || []))
      .catch(() => setAccounts([]));
  }, [allowed]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    fetch(`/api/agency/payments?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body: ListResponse) => {
        setRows(body.payments || []);
        setInvoiceLabels(body.invoiceLabels || {});
        setClientNames(body.clientNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load payments. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, statusFilter]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Deep linking — ?new=1&invoice=… pre-opens the drawer pre-scoped (the
  // invoice detail page's "Record payment" action); ?status= pre-sets the
  // filter. The palette's "Record Payment" lands here too.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('status');
    if (fromUrl && ['PENDING', 'CONFIRMED', 'FAILED', 'REVERSED'].includes(fromUrl)) {
      setStatusFilter(fromUrl as PaymentStatus);
    }
    if (params.get('new') === '1' && canManage) {
      setDrawerInvoice(params.get('invoice') || undefined);
      setDrawerOpen(true);
    }
  }, []);

  useEffect(() => {
    const openNew = () => {
      if (!canManage) return;
      setDrawerInvoice(undefined);
      setDrawerOpen(true);
    };
    window.addEventListener('open-new-payment', openNew);
    return () => window.removeEventListener('open-new-payment', openNew);
  }, [canManage]);

  const totals = useMemo(() => ({
    confirmed: rows.filter(p => p.status === 'CONFIRMED').reduce((s, p) => s + p.amount.amount, 0),
    pending: rows.filter(p => p.status === 'PENDING').reduce((s, p) => s + p.amount.amount, 0),
    reversed: rows.filter(p => p.status === 'REVERSED').reduce((s, p) => s + p.amount.amount, 0),
  }), [rows]);

  async function action(payment: Payment, verb: 'confirm' | 'fail' | 'reverse'): Promise<void> {
    if (!payment.id) return;
    if (verb === 'reverse') {
      const ok = await confirmModal({
        title: 'Reverse Payment',
        message: 'Reverse this payment? A compensating transaction returns the cash and the invoice balance goes back up (§103).',
        confirmText: 'Reverse Payment',
        variant: 'danger',
      });
      if (!ok) return;
    }
    // §108 — a confirmed payment must enter a tracked account; when the
    // payment never named one, pick it here.
    if (verb === 'confirm' && !payment.accountId) {
      if (accounts.filter(a => a.id).length === 0) {
        setNotice({ kind: 'error', text: 'No accounts exist yet — create one first (Accounts page): a confirmed payment must enter a tracked account (§108).' });
        return;
      }
      setConfirmAccount(accounts.filter(a => a.id)[0]!.id!);
      setConfirming(payment);
      return;
    }
    await post(payment, verb, {});
  }

  async function post(payment: Payment, verb: 'confirm' | 'fail' | 'reverse', body: Record<string, unknown>): Promise<void> {
    setBusyId(payment.id!);
    setNotice(null);
    try {
      const res = await fetch(`/api/agency/payments/${payment.id}/${verb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'error', text: payload.error || 'That action was rejected.' });
        return;
      }
      setNotice({
        kind: 'info',
        text: verb === 'confirm'
          ? `Payment confirmed — ₹${payload.invoice?.amountDue?.amount ?? 0} still due, invoice ${payload.invoice?.status ?? ''}.`
          : verb === 'fail'
            ? 'Payment marked FAILED — record a NEW payment when the money arrives (§102).'
            : 'Payment reversed — the cash was returned and the invoice balance recomputed (§103).',
      });
      load();
    } catch {
      setNotice({ kind: 'error', text: 'Network error — please try again.' });
    } finally {
      setBusyId(null);
    }
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <IndianRupee className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Payments are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: typeof statusFilter) => `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${statusFilter === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Payments</h1>
          <p className="text-[12.5px] text-neutral-500">Money received against invoices — partial payments, withholding and reversals, all reconciled into the ledger</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setDrawerInvoice(undefined); setDrawerOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> Record payment
          </button>
        )}
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
            notice.kind === 'error' ? 'border-red-500/25 bg-red-500/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'
          }`}
        >
          <p className={`text-[13px] ${notice.kind === 'error' ? 'text-red-300' : 'text-neutral-300'}`}>{notice.text}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 text-[12px] text-neutral-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(['', 'PENDING', 'CONFIRMED', 'REVERSED', 'FAILED'] as const).map(v => (
          <button key={v || 'all'} onClick={() => setStatusFilter(v)} className={tabCls(v)}>
            {v === '' ? 'All' : v === 'CONFIRMED' ? `Confirmed (${inr(totals.confirmed)})` : v === 'PENDING' ? `Pending (${inr(totals.pending)})` : v}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading payments">
          {[0, 1, 2].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 text-[13px] text-red-300">{error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] p-8 text-center">
          <IndianRupee className="w-6 h-6 mx-auto text-neutral-700" aria-hidden />
          <p className="mt-3 text-[13px] text-neutral-400">No payments recorded yet.</p>
          <p className="mt-1 text-[12px] text-neutral-600">Record the first one against an issued invoice — it starts PENDING and moves the money when confirmed.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]" aria-label="Payments">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Received</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Method</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Withheld</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                {canManage && <th scope="col" className="px-4 py-2.5 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/agency/invoices/${p.invoiceId}`} className="text-[12.5px] text-neutral-300 hover:text-white hover:underline transition-colors">
                      {invoiceLabels[p.invoiceId] || 'Invoice'}
                    </Link>
                    {p.reference && <div className="text-[10.5px] text-neutral-600 truncate max-w-[12rem]" title={p.reference}>{p.reference}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-300">{clientNames[p.clientId] || 'Client'}</td>
                  <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">{formatDate(p.receivedAt)}</td>
                  <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">
                    {METHOD_LABELS[p.method] || p.method}
                    {p.gateway && <span className="ml-1 text-[10px] text-neutral-600">({p.gateway})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-200 tabular-nums whitespace-nowrap">
                    {inr(p.amount.amount)}
                    {p.status === 'CONFIRMED' && p.transactionId && <div className="text-[10px] text-neutral-600">ledger ✓</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-neutral-500 tabular-nums whitespace-nowrap">
                    {p.withholdingAmount && p.withholdingAmount.amount > 0 ? inr(p.withholdingAmount.amount) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    {p.status === 'REVERSED' && <div className="text-[10px] text-neutral-600 mt-0.5">kept in history (§103)</div>}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {p.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => void action(p, 'confirm')}
                            disabled={busyId === p.id}
                            title="Create the ledger transaction + recompute the invoice (§114)"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white text-black text-[11px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors"
                          >
                            <Check className="w-3 h-3" aria-hidden /> Confirm
                          </button>
                          <button
                            onClick={() => void action(p, 'fail')}
                            disabled={busyId === p.id}
                            title="Mark FAILED — a new payment record is created when the money arrives (§102)"
                            className="ml-1.5 inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11px] text-neutral-400 hover:text-white disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3 h-3" aria-hidden /> Fail
                          </button>
                        </>
                      )}
                      {p.status === 'CONFIRMED' && (
                        <button
                          onClick={() => void action(p, 'reverse')}
                          disabled={busyId === p.id}
                          title="Compensating transaction returns the cash; the payment stays in history (§103)"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11px] text-neutral-400 hover:text-red-400 hover:border-red-400/30 disabled:opacity-50 transition-colors"
                        >
                          <Undo2 className="w-3 h-3" aria-hidden /> Reverse
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaymentDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={load}
        defaultInvoiceId={drawerInvoice}
      />

      {/* §108 — the account picker for confirming an account-less payment. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Choose account">
          <div className="absolute inset-0 bg-black/70" onClick={() => setConfirming(null)} />
          <div className="relative w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0a0a0a] p-5 space-y-4">
            <h2 className="text-[14px] font-semibold text-white">Confirm payment — {inr(confirming.amount.amount)}</h2>
            <p className="text-[12.5px] text-neutral-400">
              A confirmed payment must enter a tracked account (§108). Which account received this money?
            </p>
            <Select
              value={confirmAccount}
              onChange={e => setConfirmAccount(e.target.value)}
              aria-label="Account"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/25"
            >
              {accounts.filter(a => a.id).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
              ))}
            </Select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} className="px-3.5 py-2 rounded-lg text-[12.5px] text-neutral-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { const p = confirming; setConfirming(null); if (p) void post(p, 'confirm', { accountId: confirmAccount }); }}
                disabled={busyId === confirming.id}
                className="px-4 py-2 rounded-lg bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 disabled:opacity-50 transition-colors"
              >
                Confirm payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
