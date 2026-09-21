"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Send, Receipt } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import type { Expense } from '@/lib/agency/types/expense';
import type { Money } from '@/lib/agency/types/money';
import { ExpenseDrawer } from '@/components/agency/expenses/ExpenseDrawer';
import { alertModal } from '@/components/ui/Dialog';

/**
 * Project Expenses tab (Module 8, §138) — the spend side of one project's
 * workspace. Everyone on the project records expenses here (the drawer's
 * project is preselected and fixed); the server scopes a USER to their own
 * rows (§33) and cost-redacts them (§99), so the Amount column honestly
 * stays blank rather than showing a fabricated number.
 */
type ExpenseRow = Omit<Expense, 'amount' | 'markupPercent'> & {
  amount?: Money;
  markupPercent?: number;
};

interface Props {
  projectId: string;
}

export function ProjectExpensesPanel({ projectId }: Props) {
  const { user } = useDashboardContext();
  const isAdmin = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/agency/expenses?projectId=${encodeURIComponent(projectId)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.expenses || []);
        setUserLabels(body.userLabels || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load this project\'s expenses. Try again.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function submitOne(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/agency/expenses/${id}/submit`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal(body.error || "That didn't work. Try again.", { title: 'Submission Failed', variant: 'error' });
      }
      load();
    } catch {
      await alertModal("That didn't work. Try again.", { title: 'Submission Failed', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const totals = useMemo(() => ({
    cost: rows.reduce((s, r) => s + (r.amount?.amount ?? 0), 0),
    charge: rows.reduce((s, r) => s + (r.clientChargeAmount?.amount ?? 0), 0),
    unbilled: rows
      .filter(r => r.billable && r.status === 'APPROVED' && r.billingStatus === 'UNBILLED')
      .reduce((s, r) => s + (r.clientChargeAmount?.amount ?? 0), 0),
  }), [rows]);

  function inr(n: number): string {
    return `₹${n.toLocaleString('en-IN')}`;
  }

  return (
    <section className="space-y-3" aria-label="Project expenses">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAdmin && rows.length > 0 && (
          <span className="text-[12px] text-neutral-500 tabular-nums">
            cost <strong className="text-white">{inr(totals.cost)}</strong>
            {totals.charge > 0 && <> · charge <strong className="text-white">{inr(totals.charge)}</strong></>}
            {totals.unbilled > 0 && <> · <span className="text-amber-300">unbilled {inr(totals.unbilled)}</span></>}
          </span>
        )}
        <button
          onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden /> Record expense
        </button>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading project expenses">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
          <Receipt className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h3 className="mt-3 text-[14px] font-semibold text-white">No expenses on this project yet</h3>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            Vendor spend, tools and travel recharged to this client land here once recorded.
          </p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Project expenses">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Vendor</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Client charge</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const editable = (r.status === 'DRAFT' || r.status === 'REJECTED') && (isAdmin || r.createdBy === user?.id);
                return (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors align-top">
                    <td className="px-4 py-2.5 text-neutral-400 whitespace-nowrap">{r.expenseDate}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-white">{r.vendorName}</span>
                      <div className="text-[11.5px] text-neutral-500 truncate max-w-[16rem]">{r.description}</div>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400">
                      {r.expenseType === 'PASS_THROUGH' ? 'PASS-THRU' : r.expenseType}
                      {r.billable && r.markupPercent !== undefined && <span className="ml-1 text-[11px] text-neutral-600">+{r.markupPercent}%</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-white tabular-nums whitespace-nowrap">
                      {r.amount ? inr(r.amount.amount) : <span className="text-neutral-600" title="Cost visible to admins only (§99)">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {r.billable
                        ? <span className="text-emerald-300">{r.clientChargeAmount ? inr(r.clientChargeAmount.amount) : '—'}</span>
                        : <span className="text-neutral-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11.5px] text-neutral-300">{r.status}</span>
                      {r.billingStatus === 'INVOICED' && <span className="ml-1 text-[11px] text-violet-300">· INVOICED</span>}
                      {!isAdmin && <div className="text-[10.5px] text-neutral-600">{userLabels[r.createdBy] ? `by ${userLabels[r.createdBy]}` : ''}</div>}
                      {r.rejectionReason && <div className="mt-0.5 text-[11px] text-red-400/80">Rejected: {r.rejectionReason}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {editable && (
                        <>
                          <button
                            onClick={() => { setEditing(r); setDrawerOpen(true); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors mr-1"
                          >
                            <Pencil className="w-3 h-3" aria-hidden /> Edit
                          </button>
                          <button
                            onClick={() => void submitOne(r.id)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
                          >
                            <Send className="w-3 h-3" aria-hidden /> Submit
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ExpenseDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); setEditing(null); load(); }}
        editing={editing}
        defaultProjectId={projectId}
      />
    </section>
  );
}
