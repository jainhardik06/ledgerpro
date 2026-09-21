"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Tags, Plus, ChevronRight, Archive, ArchiveRestore } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { RateCardType, RateCardScope, RateCardStatus } from '@/lib/agency/types/rate';
import { RateCardFormDrawer } from '@/components/agency/rates/RateCardFormDrawer';
import { Select } from '@/components/ui/Select';
import { confirmModal, alertModal } from '@/components/ui/Dialog';

/**
 * Rate Cards list (Module 6, spec §84).
 *
 * Columns: Rate Card | Type | Scope | Currency | Entries | Status | Updated
 *
 * Two truths side by side (§56): COST cards (internal labor economics) and
 * BILLING cards (client-facing pricing) — the Type column keeps them
 * distinguishable at a glance.
 *
 * §99 COST-RATE PRIVACY: a viewer without agency.rates.cost.read sees cost
 * cards WITHOUT their entry counts — the server redacts (`costRedacted`) and
 * this page renders "Restricted", never a fake zero.
 *
 * Lifecycle (§75): cards archive, never delete. Archive/restore are row
 * actions for admins; everyone else is read-only (§98).
 */
interface CardRow {
  id: string;
  name: string;
  type: RateCardType;
  scope: RateCardScope;
  clientId?: string;
  currency: string;
  status: RateCardStatus;
  updatedAt?: string | Date;
  entryCount: number;
  costRedacted?: boolean;
}

const TYPE_STYLE: Record<RateCardType, string> = {
  COST: 'text-amber-400',
  BILLING: 'text-sky-400',
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function RateCardsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  // §98 — manage is admin-only; USERs get the read-only list (billing cards
  // and redacted cost cards).
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<CardRow[]>([]);
  const [clientLabels, setClientLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'ALL' | RateCardType>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | RateCardScope>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RateCardStatus>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (typeFilter !== 'ALL') p.set('type', typeFilter);
    if (scopeFilter !== 'ALL') p.set('scope', scopeFilter);
    if (statusFilter !== 'ALL') p.set('status', statusFilter);
    fetch(`/api/agency/rate-cards?${p.toString()}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        setRows(body.cards || []);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load your rate cards. Try again.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, typeFilter, scopeFilter, statusFilter]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // Client labels for CLIENT-scoped cards (§60) — one lightweight fetch.
  useEffect(() => {
    if (sessionLoading || !allowed) return;
    fetch('/api/agency/clients?limit=100')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(body => {
        const labels: Record<string, string> = {};
        for (const c of body.clients || []) labels[c.id] = c.name;
        setClientLabels(labels);
      })
      .catch(() => setClientLabels({}));
  }, [sessionLoading, allowed]);

  // §117 — the Command Palette's "Create Rate Card" lands here: navigate +
  // dispatch, same pattern as Create Client/Project. USERs never see it.
  useEffect(() => {
    const openCreate = () => {
      if (canManage) setCreateOpen(true);
    };
    window.addEventListener('open-new-rate-card', openCreate);
    return () => window.removeEventListener('open-new-rate-card', openCreate);
  }, [canManage]);

  // §75 — archive (ACTIVE → ARCHIVED) / restore (ARCHIVED → ACTIVE).
  async function toggleArchive(card: CardRow) {
    const action = card.status === 'ACTIVE' ? 'archive' : 'restore';
    const ok = await confirmModal({
      title: action === 'archive' ? 'Archive Rate Card' : 'Restore Rate Card',
      message: action === 'archive'
        ? `Archive "${card.name}"? It stops receiving new entries and assignments; history keeps reading it.`
        : `Restore "${card.name}" to ACTIVE?`,
      confirmText: action === 'archive' ? 'Archive' : 'Restore',
      variant: action === 'archive' ? 'warning' : 'default',
    });
    if (!ok) return;
    setBusyId(card.id);
    try {
      const res = await fetch(`/api/agency/rate-cards/${card.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await alertModal({
          title: 'Action Failed',
          message: body.error || 'That didn\'t work. Try again.',
          variant: 'error',
        });
      }
      load();
    } catch {
      await alertModal({
        title: 'Action Failed',
        message: 'That didn\'t work. Try again.',
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Tags className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Rate cards are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  const selectCls = 'px-3 py-2 rounded-lg bg-[#0a0a0a] border border-white/[0.06] text-[13px] text-white focus:outline-none focus:border-white/20';

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Rate Cards</h1>
          <p className="text-[12.5px] text-neutral-500">What your labor costs, and what your clients are charged — two truths, never merged</p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New Rate Card
          </button>
        )}
      </div>

      {/* Filters (§84): type / scope / status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <Select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'ALL' | RateCardType)}
          aria-label="Filter by type"
          className="h-9"
          wrapperClassName="w-full sm:w-44 shrink-0"
        >
          <option value="ALL">All types</option>
          <option value="COST">Cost</option>
          <option value="BILLING">Billing</option>
        </Select>
        <Select
          value={scopeFilter}
          onChange={e => setScopeFilter(e.target.value as 'ALL' | RateCardScope)}
          aria-label="Filter by scope"
          className="h-9"
          wrapperClassName="w-full sm:w-44 shrink-0"
        >
          <option value="ALL">All scopes</option>
          <option value="ORGANIZATION">Organization</option>
          <option value="CLIENT">Client</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'ALL' | RateCardStatus)}
          aria-label="Filter by status"
          className="h-9"
          wrapperClassName="w-full sm:w-44 shrink-0"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading rate cards">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
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
          <Tags className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No rate cards yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            A cost card sets what an hour of your team costs you; a billing card sets what a client pays for it. Every project&apos;s economics resolves through these.
          </p>
          {canManage && (
            <button
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Create your first rate card
            </button>
          )}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-[13px]" aria-label="Rate cards">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-3 font-medium">Rate Card</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium">Scope</th>
                <th scope="col" className="px-4 py-3 font-medium">Currency</th>
                <th scope="col" className="px-4 py-3 font-medium">Entries</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Updated</th>
                {canManage && <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/agency/rate-cards/${c.id}`} className="text-white hover:underline underline-offset-2">{c.name}</Link>
                    {c.scope === 'CLIENT' && (
                      <div className="text-[11.5px] text-neutral-500">{clientLabels[c.clientId ?? ''] || 'Client'}</div>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-medium ${TYPE_STYLE[c.type]}`}>{c.type === 'COST' ? 'Cost' : 'Billing'}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.scope === 'ORGANIZATION' ? 'Organization' : 'Client'}</td>
                  <td className="px-4 py-3 text-neutral-300">{c.currency}</td>
                  {/* §99 — redacted for non-cost-readers: "Restricted", never a fake zero. */}
                  <td className="px-4 py-3 text-neutral-300">
                    {c.costRedacted ? <span className="text-neutral-600" title="Cost rates are visible to admins only">Restricted</span> : c.entryCount}
                  </td>
                  <td className={`px-4 py-3 font-medium ${c.status === 'ACTIVE' ? 'text-emerald-400' : 'text-neutral-600'}`}>{c.status === 'ACTIVE' ? 'Active' : 'Archived'}</td>
                  <td className="px-4 py-3 text-neutral-400">{formatDate(c.updatedAt)}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void toggleArchive(c)}
                        disabled={busyId === c.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
                      >
                        {c.status === 'ACTIVE'
                          ? <><Archive className="w-3.5 h-3.5" aria-hidden /> Archive</>
                          : <><ArchiveRestore className="w-3.5 h-3.5" aria-hidden /> Restore</>}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards — DOM order matches desktop priority */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {rows.map(c => (
              <Link key={c.id} href={`/dashboard/agency/rate-cards/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0">
                  <div className="text-[13.5px] text-white truncate">{c.name}</div>
                  <div className="text-[11.5px] text-neutral-500 truncate">
                    <span className={TYPE_STYLE[c.type]}>{c.type === 'COST' ? 'Cost' : 'Billing'}</span>
                    {' · '}
                    {c.scope === 'ORGANIZATION' ? 'Organization' : (clientLabels[c.clientId ?? ''] || 'Client')}
                    {' · '}
                    {c.currency}
                    {!c.costRedacted && <> · {c.entryCount} entries</>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-medium ${c.status === 'ACTIVE' ? 'text-emerald-400' : 'text-neutral-600'}`}>{c.status === 'ACTIVE' ? 'Active' : 'Archived'}</span>
                  <ChevronRight className="w-4 h-4 text-neutral-600" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Creation drawer (§83/§86) */}
      {createOpen && (
        <RateCardFormDrawer
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
    </div>
  );
}
