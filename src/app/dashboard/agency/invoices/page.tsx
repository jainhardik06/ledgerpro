"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, Clock3, AlertTriangle, Download } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Invoice, InvoiceStatus } from '@/lib/agency/types/invoice';
import { displayStatusFor, draftLabel } from '@/lib/agency/types/invoice';
import { InvoiceWizard } from '@/components/agency/invoices/InvoiceWizard';

/**
 * Invoices (Module 9 §85) — the invoice centre. Readable by the whole agency
 * workspace (receivables are shared context); composition stays admin-only
 * (§67/§81 — the New Invoice affordance and the wizard are admin surfaces).
 *
 * §80 — OVERDUE is DERIVED here for display (today vs dueDate + money owed),
 * never a stored mutation. §75 — drafts show their honest draft label, never
 * a fake number.
 */
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  DRAFT: 'text-neutral-400 bg-white/[0.05]',
  SENT: 'text-sky-300 bg-sky-400/10',
  PARTIALLY_PAID: 'text-amber-300 bg-amber-400/10',
  PAID: 'text-emerald-300 bg-emerald-400/10',
  OVERDUE: 'text-red-300 bg-red-400/10',
  VOID: 'text-neutral-500 bg-white/[0.03] line-through',
};

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

export default function InvoicesPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<Invoice[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | InvoiceStatus | 'OVERDUE'>('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPreset, setWizardPreset] = useState<{ clientId?: string; projectId?: string } | undefined>();

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter && statusFilter !== 'OVERDUE') p.set('status', statusFilter);
    fetch(`/api/agency/invoices?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.invoices || []);
        setClientNames(body.clientNames || {});
        setProjectNames(body.projectNames || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load invoices. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, statusFilter]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // §117/§118 deep linking — ?new=1&client=&project= (the project Billing
  // tab) pre-opens the wizard pre-scoped; ?status= pre-sets the filter.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('status');
    if (fromUrl && ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'].includes(fromUrl)) {
      setStatusFilter(fromUrl as InvoiceStatus);
    }
    if (params.get('new') === '1' && canManage) {
      setWizardPreset({
        ...(params.get('client') && { clientId: params.get('client')! }),
        ...(params.get('project') && { projectId: params.get('project')! }),
      });
      setWizardOpen(true);
    }
  }, []);

  // The palette's / Command Centre's "Create Invoice" lands here.
  useEffect(() => {
    const openNew = (e: Event) => {
      if (!canManage) return;
      const detail = (e as CustomEvent<{ clientId?: string; projectId?: string }>).detail;
      setWizardPreset(detail);
      setWizardOpen(true);
    };
    window.addEventListener('open-new-invoice', openNew);
    return () => window.removeEventListener('open-new-invoice', openNew);
  }, [canManage]);

  const today = todayLocal();
  // §80 — the display status is derived, and the OVERDUE filter selects on it.
  const visible = useMemo(() => {
    const annotated = rows.map(i => ({ invoice: i, display: displayStatusFor(i, today) }));
    if (statusFilter === '') return annotated;
    if (statusFilter === 'OVERDUE') return annotated.filter(a => a.display === 'OVERDUE');
    return annotated.filter(a => a.invoice.status === statusFilter);
  }, [rows, statusFilter, today]);

  const totals = useMemo(() => ({
    outstanding: visible.reduce((s, a) => s + (a.invoice.status === 'VOID' ? 0 : a.invoice.amountDue.amount), 0),
    overdue: visible.reduce((s, a) => s + (a.display === 'OVERDUE' ? a.invoice.amountDue.amount : 0), 0),
  }), [visible]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <FileText className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Invoicing is an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const tabCls = (v: typeof statusFilter) => `px-2.5 py-1 rounded text-[11.5px] font-medium transition-colors ${statusFilter === v ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-neutral-300'}`;

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Invoices</h1>
          <p className="text-[12.5px] text-neutral-500">Approved work converted into money owed — drafts, issued invoices and what&apos;s still collectable</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setWizardPreset(undefined); setWizardOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New invoice
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status filter">
          {(['', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'] as const).map(v => (
            <button key={v || 'all'} onClick={() => setStatusFilter(v)} className={tabCls(v)}>
              {v === '' ? 'All' : v === 'PARTIALLY_PAID' ? 'Partially paid' : v.charAt(0) + v.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        {visible.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-[12px] text-neutral-500 tabular-nums">
            <span>outstanding <strong className="text-white">{inr(totals.outstanding)}</strong></span>
            {totals.overdue > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-3 h-3" aria-hidden /> overdue <strong>{inr(totals.overdue)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading invoices">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
          <FileText className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No invoices here yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            {statusFilter === ''
              ? 'Turn approved time, expenses and milestones into a client invoice.'
              : 'Nothing matches this filter right now.'}
          </p>
          {canManage && statusFilter === '' && (
            <button
              onClick={() => { setWizardPreset(undefined); setWizardOpen(true); }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Create your first invoice
            </button>
          )}
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Invoices">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Client / Project</th>
                <th scope="col" className="px-4 py-3 font-medium">Issued</th>
                <th scope="col" className="px-4 py-3 font-medium">Due</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Total</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Balance due</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ invoice: r, display }) => (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/dashboard/agency/invoices/${r.id}`} className="text-white underline underline-offset-2 hover:text-neutral-300">
                      {r.invoiceNumber ?? draftLabel(r.id)}
                    </Link>
                    {r.status === 'DRAFT' && <div className="text-[10.5px] text-neutral-600">no number until issued (§74)</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {clientNames[r.clientId] || 'Client'}
                    {r.projectId && <div className="text-[11.5px] text-neutral-600 truncate max-w-[14rem]">{projectNames[r.projectId] || 'Project'}</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">{formatDate(r.issueDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-1 text-neutral-400">
                      {display === 'OVERDUE' && <Clock3 className="w-3 h-3 text-red-400" aria-hidden />}
                      {formatDate(r.dueDate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white tabular-nums whitespace-nowrap">{inr(r.total.amount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                    {r.status === 'VOID'
                      ? <span className="text-neutral-600">—</span>
                      : <span className={display === 'OVERDUE' ? 'text-red-300' : r.amountDue.amount === 0 ? 'text-emerald-300' : 'text-neutral-200'}>{inr(r.amountDue.amount)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLE[display]}`}>{display}</span>
                    {display !== r.status && <div className="mt-0.5 text-[10.5px] text-neutral-600">stored: {r.status} (§80)</div>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/dashboard/agency/invoices/${r.id}/print`}
                      target="_blank"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/[0.08] text-[11.5px] text-neutral-300 hover:text-emerald-300 hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] transition-colors"
                      title="Download or Print PDF"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" /> PDF
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        preset={wizardPreset}
        onChanged={load}
      />
    </div>
  );
}
