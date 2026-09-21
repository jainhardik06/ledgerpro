"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Archive, RotateCcw, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { AgencyClient, ClientStatus } from '@/lib/agency/types/client';
import { CLIENT_STATUSES } from '@/lib/agency/types/client';
import { ClientFormDrawer, type ClientFormValues } from '@/components/agency/clients/ClientFormDrawer';
import { Select } from '@/components/ui/Select';
import { SearchBar } from '@/components/ui/SearchBar';

/**
 * Agency Clients list (Module 2, spec §20 + §29).
 *
 * Columns (Module 2 initial view — financial columns appear when their
 * modules exist, never as fake zeros):
 *   Client | Primary Contact | Projects | Status | Created | Actions
 *
 * Search (§19): debounced, server-side (?search=), tenant-scoped.
 * Duplicate creation (§18): the drawer handles the 409 DUPLICATE_WARNING
 * flow (Create Anyway / View Existing / Cancel).
 */
const STATUS_STYLE: Record<ClientStatus, string> = {
  PROSPECT: 'text-sky-400',
  ACTIVE: 'text-emerald-400',
  PAUSED: 'text-amber-400',
  INACTIVE: 'text-neutral-400',
  ARCHIVED: 'text-neutral-500',
};

interface ClientRow extends AgencyClient {
  projectCount?: number;
}

/** Module 3 (§93): per-client project summary from the list API. */
interface ProjectCounts {
  [clientId: string]: { count: number; activeCount: number; plannedValue: number };
}

export default function AgencyClientsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  // §28 — TENANT_ADMIN manages clients; USER is read-only.
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [projectCounts, setProjectCounts] = useState<ProjectCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ClientStatus>('ALL');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyClient | null>(null);

  const PAGE_SIZE = 25;

  // §19 — debounced search (350ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A new search or filter restarts from the first page.
  useEffect(() => { setPage(1); }, [debounced, statusFilter]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced.trim()) p.set('search', debounced.trim());
    if (statusFilter !== 'ALL') p.set('status', statusFilter);
    p.set('page', String(page));
    // Ask for one extra row so the UI can tell whether a next page exists
    // without a separate count query.
    p.set('limit', String(PAGE_SIZE + 1));
    return p.toString();
  }, [debounced, statusFilter, page]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    fetch(`/api/agency/clients?${query}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load clients'))))
      .then(body => {
        const all: ClientRow[] = body.clients || [];
        setHasMore(all.length > PAGE_SIZE);
        setRows(all.slice(0, PAGE_SIZE));
        setProjectCounts(body.projectCounts || null);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load your clients. Try again.'))
      .finally(() => setLoading(false));
  }, [query, sessionLoading, allowed]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // §117 — the Command Palette's "Create Client" lands here: navigate +
  // dispatch, same pattern as the core transaction/budget quick actions.
  // §28 — USERs are read-only; the drawer never opens for them.
  useEffect(() => {
    const openDrawer = () => {
      if (canManage) {
        setEditing(null);
        setDrawerOpen(true);
      }
    };
    window.addEventListener('open-new-agency-client', openDrawer);
    return () => window.removeEventListener('open-new-agency-client', openDrawer);
  }, [canManage]);

  async function handleSave(values: ClientFormValues, allowDuplicate: boolean, id?: string): Promise<{ ok: boolean; duplicate?: { name: string; id: string }[] }> {
    const res = await fetch(id ? `/api/agency/clients/${id}` : '/api/agency/clients', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, allowDuplicate }),
    });
    if (res.status === 409) {
      const body = await res.json();
      return { ok: false, duplicate: (body.existing || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) };
    }
    if (!res.ok) return { ok: false };
    return { ok: true };
  }

  async function handleLifecycle(id: string, action: 'archive' | 'restore') {
    const res = await fetch(`/api/agency/clients/${id}/${action}`, { method: 'POST' });
    if (res.ok) load();
  }

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Building2 className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Clients are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Clients</h1>
          <p className="text-[12.5px] text-neutral-500">The commercial relationships your projects, invoices and revenue attach to</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setEditing(null); setDrawerOpen(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New Client
          </button>
        )}
      </div>

      {/* Search + status filter (§19/§20) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <SearchBar
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or legal name…"
          aria-label="Search clients"
        />
        <Select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'ALL' | ClientStatus)}
          aria-label="Filter by status"
          className="h-9"
          wrapperClassName="w-full sm:w-48 shrink-0"
        >
          <option value="ALL">All statuses</option>
          {CLIENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {/* Loading — skeleton, no numbers */}
      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading clients">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <p className="text-[13px] text-neutral-200">{error}</p>
          <button onClick={load} className="mt-2 text-[12.5px] text-neutral-400 underline underline-offset-4">Retry</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-8 text-center">
          <Building2 className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No clients yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            Clients are the top-level commercial relationship — projects, invoices and payments all attach to them.
          </p>
          {canManage && (
            <button
              onClick={() => { setEditing(null); setDrawerOpen(true); }}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Create your first client
            </button>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-[13px]" aria-label="Clients">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-3 font-medium">Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Primary Contact</th>
                <th scope="col" className="px-4 py-3 font-medium">Projects</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/agency/clients/${c.id}`} className="text-white hover:underline underline-offset-2">{c.name}</Link>
                    {c.legalName && <div className="text-[11.5px] text-neutral-500 truncate max-w-[220px]">{c.legalName}</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {c.primaryContact?.name || c.email || <span className="text-neutral-600">—</span>}
                    {c.primaryContact?.email && <div className="text-[11.5px] text-neutral-500 truncate max-w-[200px]">{c.primaryContact.email}</div>}
                  </td>
                  {/* Module 3 (§93) — live project count (non-archived);
                      absent counts render "—", never a fake zero */}
                  <td className="px-4 py-3 text-neutral-300">
                    {projectCounts ? String(projectCounts[c.id]?.count ?? 0) : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className={`px-4 py-3 font-medium ${STATUS_STYLE[c.status] ?? 'text-neutral-300'}`}>{c.status}</td>
                  <td className="px-4 py-3 text-neutral-500 text-[12px]">
                    {new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage ? (
                    <div className="inline-flex items-center gap-1">
                      {c.status !== 'ARCHIVED' ? (
                        <button onClick={() => handleLifecycle(c.id, 'archive')} title="Archive client" aria-label={`Archive ${c.name}`} className="p-1.5 rounded text-neutral-500 hover:text-amber-400 hover:bg-white/[0.04] transition-colors">
                          <Archive className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      ) : (
                        <button onClick={() => handleLifecycle(c.id, 'restore')} title="Restore client" aria-label={`Restore ${c.name}`} className="p-1.5 rounded text-neutral-500 hover:text-emerald-400 hover:bg-white/[0.04] transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}
                      <button onClick={() => { setEditing(c); setDrawerOpen(true); }} title="Edit client" aria-label={`Edit ${c.name}`} className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-white/[0.04] transition-colors text-[12px] font-medium">
                        Edit
                      </button>
                    </div>
                    ) : <span className="text-neutral-600 text-[12px]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards — DOM order matches desktop priority */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {rows.map(c => (
              <Link key={c.id} href={`/dashboard/agency/clients/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0">
                  <div className="text-[13.5px] text-white truncate">{c.name}</div>
                  <div className="text-[11.5px] text-neutral-500 truncate">{c.primaryContact?.email || c.email || c.primaryContact?.name || '—'}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  <ChevronRight className="w-4 h-4 text-neutral-600" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pagination (§33) — hasMore detected via the limit+1 probe row */}
      {!loading && !error && rows.length > 0 && (page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-neutral-500">Page {page}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit drawer (§23–§25) — progressive disclosure inside.
          Keyed so a new open resets all form state from `editing`. */}
      {drawerOpen && (
        <ClientFormDrawer
          key={editing?.id ?? 'new-client'}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          editing={editing}
          onSave={handleSave}
          onSaved={() => { setDrawerOpen(false); load(); }}
        />
      )}
    </div>
  );
}
