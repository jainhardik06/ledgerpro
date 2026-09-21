"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Plus, Search, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { Project, ProjectStatus } from '@/lib/agency/types/project';
import { PROJECT_STATUSES } from '@/lib/agency/types/project';
import { ProjectWizardDrawer } from '@/components/agency/projects/ProjectWizardDrawer';
import { Select } from '@/components/ui/Select';
import { SearchBar } from '@/components/ui/SearchBar';
import { ProjectStatusBadge } from '@/components/agency/projects/ProjectStatusBadge';

/**
 * Agency Projects list (Module 3, spec §69 / Step 3.6).
 *
 * Columns: Project | Client | Status | Model | Value | Budget | Margin | Owner
 *
 * Honesty rules (§68/§70): the Value/Budget/Margin columns show PLANNED
 * economics only (contractValue falling back to revenueBudget; budgetCost;
 * (revenueBudget−budgetCost)/revenueBudget). They are labeled as plans —
 * actuals/billed/collected arrive with Time Tracking and Invoicing
 * and will never be shown as fake zeros here.
 *
 * Creation (§71/§101): the 7-step wizard drawer. Admins only (§28-style
 * read/write split via agency.projects.manage).
 */
const STATUS_STYLE: Record<ProjectStatus, string> = {
  DRAFT: 'text-neutral-400',
  ACTIVE: 'text-emerald-400',
  ON_HOLD: 'text-amber-400',
  COMPLETED: 'text-sky-400',
  CANCELLED: 'text-neutral-500',
  ARCHIVED: 'text-neutral-600',
};

const MODEL_LABEL: Record<string, string> = {
  FIXED_FEE: 'Fixed Fee',
  TIME_AND_MATERIALS: 'T&M',
  MILESTONE: 'Milestone',
};

export default function AgencyProjectsPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  // §28 pattern — admins manage projects; USER is read-only.
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

  const [rows, setRows] = useState<Project[]>([]);
  const [clientLabels, setClientLabels] = useState<Record<string, string>>({});
  const [managerLabels, setManagerLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProjectStatus>('ALL');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 25;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, statusFilter]);

  // §117/§118 deep linking — entering with ?status=ACTIVE (e.g. the palette's
  // "Open Active Projects") pre-sets the filter. Read once on mount; the
  // filter state is the source of truth afterwards.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('status');
    if (fromUrl && PROJECT_STATUSES.includes(fromUrl as ProjectStatus)) {
      setStatusFilter(fromUrl as ProjectStatus);
    }
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced.trim()) p.set('search', debounced.trim());
    if (statusFilter !== 'ALL') p.set('status', statusFilter);
    p.set('page', String(page));
    p.set('limit', String(PAGE_SIZE + 1));
    return p.toString();
  }, [debounced, statusFilter, page]);

  const load = useCallback(() => {
    if (sessionLoading || !allowed) return;
    setLoading(true);
    fetch(`/api/agency/projects?${query}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed to load projects'))))
      .then(body => {
        const all: Project[] = body.projects || [];
        setHasMore(all.length > PAGE_SIZE);
        setRows(all.slice(0, PAGE_SIZE));
        setClientLabels(body.clientLabels || {});
        setManagerLabels(body.managerLabels || {});
        setError(null);
      })
      .catch(() => setError('We couldn\'t load your projects. Try again.'))
      .finally(() => setLoading(false));
  }, [query, sessionLoading, allowed]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  // §117 — the Command Palette's "Create Project" lands here: navigate +
  // dispatch, same pattern as Create Client. USERs never see the wizard.
  // "Search Projects" focuses the search input the same way.
  useEffect(() => {
    const openWizard = () => {
      if (canManage) setWizardOpen(true);
    };
    const focusSearch = () => searchInputRef.current?.focus();
    window.addEventListener('open-new-agency-project', openWizard);
    window.addEventListener('focus-agency-projects-search', focusSearch);
    return () => {
      window.removeEventListener('open-new-agency-project', openWizard);
      window.removeEventListener('focus-agency-projects-search', focusSearch);
    };
  }, [canManage]);

  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Briefcase className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">Projects are an Agency workspace feature.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4">Go to the standard dashboard</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-white tracking-tight">Projects</h1>
          <p className="text-[12.5px] text-neutral-500">The delivery units your time, costs and revenue attach to</p>
        </div>
        {canManage && (
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden /> New Project
          </button>
        )}
      </div>

      {/* Search + status filter (§69) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <SearchBar
          ref={searchInputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by project name, code, or client…"
          aria-label="Search projects"
        />
        <Select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'ALL' | ProjectStatus)}
          aria-label="Filter by status"
          className="h-9"
          wrapperClassName="w-full sm:w-48 shrink-0"
        >
          <option value="ALL">All statuses</option>
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s === 'ON_HOLD' ? 'PAUSED (ON HOLD)' : s}</option>)}
        </Select>
      </div>

      {/* Loading — skeleton, no numbers */}
      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading projects">
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
          <Briefcase className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
          <h2 className="mt-3 text-[14px] font-semibold text-white">No projects yet</h2>
          <p className="mt-1.5 text-[12.5px] text-neutral-500 max-w-sm mx-auto">
            Projects are where delivery happens — budgets, timelines and teams live here, and time, invoices and revenue will attach to them.
          </p>
          {canManage && (
            <button
              onClick={() => setWizardOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Create your first project
            </button>
          )}
        </div>
      )}

      {/* List */}
      {!loading && !error && rows.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-[13px]" aria-label="Projects">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th scope="col" className="px-4 py-3 font-medium">Project</th>
                <th scope="col" className="px-4 py-3 font-medium">Client</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Model</th>
                <th scope="col" className="px-4 py-3 font-medium">Value (planned)</th>
                <th scope="col" className="px-4 py-3 font-medium">Budget (planned)</th>
                <th scope="col" className="px-4 py-3 font-medium">Margin (planned)</th>
                <th scope="col" className="px-4 py-3 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/agency/projects/${p.id}`} className="text-white hover:underline underline-offset-2">{p.name}</Link>
                    {p.code && <div className="text-[11.5px] text-neutral-500">{p.code}</div>}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{clientLabels[p.clientId] || <span className="text-neutral-600">—</span>}</td>
                  <td className="px-4 py-3">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{MODEL_LABEL[p.billingModel] || p.billingModel}</td>
                  {/* §70 — PLANNED value only; actual/billed/collected arrive
                      with their modules, never as fake zeros. */}
                  <td className="px-4 py-3 text-neutral-300">
                    {(p.contractValue ?? p.revenueBudget) !== undefined
                      ? <span>{p.currency} {((p.contractValue ?? p.revenueBudget) as number).toLocaleString('en-IN')}</span>
                      : <span className="text-neutral-600">Not set</span>}
                  </td>
                  {/* §70 — planned budget cost and planned margin. The margin
                      needs both baselines; without them it is honestly unset. */}
                  <td className="px-4 py-3 text-neutral-300">
                    {p.budgetCost !== undefined
                      ? <span>{p.currency} {p.budgetCost.toLocaleString('en-IN')}</span>
                      : <span className="text-neutral-600">Not set</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {p.budgetCost !== undefined && p.revenueBudget
                      ? <span>{(((p.revenueBudget - p.budgetCost) / p.revenueBudget) * 100).toFixed(1)}%</span>
                      : <span className="text-neutral-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {p.projectManagerId ? (managerLabels[p.projectManagerId] || <span className="text-neutral-600">—</span>) : <span className="text-neutral-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards — DOM order matches desktop priority */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {rows.map(p => (
              <Link key={p.id} href={`/dashboard/agency/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                <div className="min-w-0">
                  <div className="text-[13.5px] text-white truncate">{p.name}</div>
                  <div className="text-[11.5px] text-neutral-500 truncate">
                    {clientLabels[p.clientId] || '—'}
                    {' · '}
                    {MODEL_LABEL[p.billingModel] || p.billingModel}
                    {(p.contractValue ?? p.revenueBudget) !== undefined && (
                      <> · {p.currency} {((p.contractValue ?? p.revenueBudget) as number).toLocaleString('en-IN')}</>
                    )}
                    {p.budgetCost !== undefined && p.revenueBudget && (
                      <> · {(((p.revenueBudget - p.budgetCost) / p.revenueBudget) * 100).toFixed(1)}% margin</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ProjectStatusBadge status={p.status} />
                  <ChevronRight className="w-4 h-4 text-neutral-600" aria-hidden />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pagination — hasMore detected via the limit+1 probe row */}
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

      {/* Creation wizard (§71/§101) — 7 steps, creates a DRAFT (§74) */}
      {wizardOpen && (
        <ProjectWizardDrawer
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreated={() => { setWizardOpen(false); load(); }}
        />
      )}
    </div>
  );
}
