"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import type { Invoice } from '@/lib/agency/types/invoice';
import { displayStatusFor, draftLabel } from '@/lib/agency/types/invoice';
import type { Project } from '@/lib/agency/types/project';

/**
 * Project Billing tab (Module 9 §69) — the billing side of one engagement:
 * this project's invoices, plus what is WAITING to be billed (the §70
 * eligible set, admin view). "New invoice" deep-links into the invoice
 * centre's wizard pre-scoped to this client + project.
 */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'text-neutral-400 bg-white/[0.05]',
  SENT: 'text-sky-300 bg-sky-400/10',
  PARTIALLY_PAID: 'text-amber-300 bg-amber-400/10',
  PAID: 'text-emerald-300 bg-emerald-400/10',
  OVERDUE: 'text-red-300 bg-red-400/10',
  VOID: 'text-neutral-500 bg-white/[0.03] line-through',
};

interface BillableSummary {
  time: Array<{ id: string; amount: { amount: number } }>;
  expenses: Array<{ id: string; amount: { amount: number } }>;
  milestones: Array<{ id: string; amount: { amount: number } }>;
  unvaluableMilestones: number;
}

export function ProjectBillingPanel({ project, canManage }: { project: Project; canManage: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billable, setBillable] = useState<BillableSummary | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agency/invoices?projectId=${project.id}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => { setInvoices(body.invoices || []); setError(null); })
      .catch(() => setError('We couldn\'t load this project\'s invoices.'))
      .finally(() => setLoading(false));
    // The §70 waiting set is an admin (invoicing) view.
    if (canManage) {
      fetch(`/api/agency/invoices/billable-sources?projectId=${project.id}`)
        .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
        .then(body => setBillable(body))
        .catch(() => setBillable(null));
    }
  }, [project.id, canManage]);

  useEffect(() => { load(); }, [load]);

  const today = todayLocal();
  const billed = invoices
    .filter(i => i.status !== 'VOID' && i.status !== 'DRAFT')
    .reduce((s, i) => s + i.total.amount, 0);
  const outstanding = invoices
    .filter(i => i.status !== 'VOID' && i.status !== 'DRAFT')
    .reduce((s, i) => s + i.amountDue.amount, 0);
  const waitingCount = billable
    ? billable.time.length + billable.expenses.length + billable.milestones.length
    : null;
  const waitingValue = billable
    ? [...billable.time, ...billable.expenses, ...billable.milestones].reduce((s, x) => s + x.amount.amount, 0)
    : null;

  return (
    <section className="space-y-3" aria-label="Project billing">
      {canManage && billable && (
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-neutral-400">
            <span className="text-neutral-500">Waiting to be billed (§70): </span>
            <strong className="text-neutral-200">{waitingCount} item{waitingCount === 1 ? '' : 's'}</strong>
            {waitingValue !== null && waitingCount !== null && waitingCount > 0 && <span> · {inr(waitingValue)}</span>}
            {billable.unvaluableMilestones > 0 && (
              <span className="text-amber-400/90"> · {billable.unvaluableMilestones} milestone{billable.unvaluableMilestones > 1 ? 's' : ''} cannot be valued (§97)</span>
            )}
          </div>
          <Link
            href={`/dashboard/agency/invoices?new=1&client=${project.clientId}&project=${project.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New invoice for this project
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          ['Billed (issued invoices)', invoices.length > 0 ? inr(billed) : '—'],
          ['Outstanding', invoices.some(i => i.status !== 'VOID' && i.status !== 'DRAFT') ? inr(outstanding) : '—'],
          ['Invoices', String(invoices.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/[0.06] bg-[#050505] p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 truncate">{label}</div>
            <div className="mt-1 text-[14px] font-semibold text-neutral-200 tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading project invoices">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-[13px] text-neutral-200">{error}</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-6 text-center">
          <FileText className="w-6 h-6 mx-auto text-neutral-700" aria-hidden />
          <p className="mt-2 text-[13px] text-neutral-500">
            No invoices for this project yet.{canManage && waitingCount && waitingCount > 0 ? ' There is billable work waiting.' : ''}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Project invoices">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Issued</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Total</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Balance</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => {
                const display = displayStatusFor(i, today);
                return (
                  <tr key={i.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link href={`/dashboard/agency/invoices/${i.id}`} className="text-white underline underline-offset-2 hover:text-neutral-300">
                        {i.invoiceNumber ?? draftLabel(i.id)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">{formatDate(i.issueDate)}</td>
                    <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">{formatDate(i.dueDate)}</td>
                    <td className="px-4 py-2.5 text-right text-white tabular-nums whitespace-nowrap">{inr(i.total.amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {i.status === 'VOID' ? <span className="text-neutral-600">—</span> : inr(i.amountDue.amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLE[display]}`}>{display}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
