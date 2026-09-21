"use client";

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Building2, Archive, RotateCcw } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import type { AgencyClient, ClientStatus } from '@/lib/agency/types/client';
import { canTransitionClientStatus } from '@/lib/agency/types/client';
import type { Transaction } from '@/lib/db';
import type { Project } from '@/lib/agency/types/project';
import { ProjectStatusBadge } from '@/components/agency/projects/ProjectStatusBadge';

/**
 * Client detail page (Module 2, spec §21–§22 + §26).
 *
 * Header: status, primary contact, billing summary.
 * Sections: Overview / Projects / Transactions / Notes / Activity.
 *
 * Honesty rule (§22): metrics whose module doesn't exist yet are marked
 * "Coming with Billing" / "Coming with Payments" — never a fake zero.
 * Module 3 (§94): project count and planned project value are LIVE; the
 * value is PLANNED (contractValue ?? revenueBudget), labeled as such.
 */

const STATUS_STYLE: Record<ClientStatus, string> = {
  PROSPECT: 'text-sky-400',
  ACTIVE: 'text-emerald-400',
  PAUSED: 'text-amber-400',
  INACTIVE: 'text-neutral-400',
  ARCHIVED: 'text-neutral-500',
};

/** Project display helpers (Module 3 §94 projects table). */
const PROJECT_STATUS_STYLE: Record<string, string> = {
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

interface ClientDetailResponse {
  success: boolean;
  client: AgencyClient;
  activity: Array<{ action: string; details: string; username: string; timestamp: string | Date }>;
  transactions: Transaction[];
  /** Module 3 (§94) — the client's projects + planned summary. */
  projects?: Project[];
  projectSummary?: { count: number; activeCount: number; plannedValue: number };
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(amount: number, currency?: string): string {
  const code = currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : undefined;
  try {
    return new Intl.NumberFormat('en-IN', code ? { style: 'currency', currency: code } : undefined).format(amount);
  } catch {
    return `${code ? code + ' ' : ''}${amount.toLocaleString('en-IN')}`;
  }
}

export default function ClientDetailPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');
  // §28 — TENANT_ADMIN manages clients; USER is read-only.
  const canManage = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';
  const params = useParams<{ id: string }>();
  const clientId = params?.id;

  const [data, setData] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (sessionLoading || !allowed || !clientId) return;
    setLoading(true);
    fetch(`/api/agency/clients/${clientId}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('not found'))))
      .then((body: ClientDetailResponse) => {
        setData(body);
        setError(null);
      })
      .catch(() => setError('We couldn\'t load this client. It may not exist or you may not have access.'))
      .finally(() => setLoading(false));
  }, [sessionLoading, allowed, clientId]);

  useEffect(() => {
    if (!sessionLoading && allowed) load();
  }, [load, sessionLoading, allowed]);

  async function handleLifecycle(action: 'archive' | 'restore') {
    if (!clientId) return;
    const res = await fetch(`/api/agency/clients/${clientId}/${action}`, { method: 'POST' });
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

  if (sessionLoading || loading) {
    return (
      <div className="p-4 sm:p-6 space-y-4" aria-busy="true" aria-label="Loading client">
        <div className="h-20 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-32 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div role="alert" className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 max-w-lg">
          <h1 className="text-[15px] font-semibold text-white">Client not found</h1>
          <p className="mt-2 text-[13px] text-neutral-400">{error || 'This client doesn\'t exist in your workspace.'}</p>
          <Link href="/dashboard/agency/clients" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-300 underline underline-offset-4">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to clients
          </Link>
        </div>
      </div>
    );
  }

  const { client, activity, transactions, projects = [], projectSummary } = data;
  const currency = client.commercialDefaults?.currency || client.billingProfile?.currency;
  const clientStatus = client.status;

  // Transaction aggregates — real core data (not a future module)
  const totalBilledCore = transactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      {/* Back */}
      <Link href="/dashboard/agency/clients" className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-500 hover:text-neutral-300 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Clients
      </Link>

      {/* Header (§21): name, status, primary contact, billing summary */}
      <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[18px] font-semibold text-white tracking-tight">{client.name}</h1>
              {clientStatus && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border border-white/[0.08] ${STATUS_STYLE[clientStatus]}`}>{clientStatus}</span>}
            </div>
            {client.legalName && <p className="mt-0.5 text-[12.5px] text-neutral-500">{client.legalName}</p>}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px]">
              <div>
                <span className="text-neutral-500">Primary contact: </span>
                <span className="text-neutral-200">
                  {client.primaryContact?.name || client.email || '—'}
                  {client.primaryContact?.email ? ` · ${client.primaryContact.email}` : ''}
                </span>
              </div>
              {client.phone && (
                <div><span className="text-neutral-500">Phone: </span><span className="text-neutral-200">{client.phone}</span></div>
              )}
              {client.website && (
                <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noreferrer" className="text-neutral-200 underline underline-offset-2">{client.website}</a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && clientStatus && canTransitionClientStatus(clientStatus, 'ARCHIVED') && (
              <button onClick={() => handleLifecycle('archive')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-amber-400 hover:border-amber-400/30 transition-colors">
                <Archive className="w-3.5 h-3.5" aria-hidden /> Archive
              </button>
            )}
            {canManage && clientStatus === 'ARCHIVED' && (
              <button onClick={() => handleLifecycle('restore')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.08] text-[12.5px] text-neutral-300 hover:text-emerald-400 hover:border-emerald-400/30 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" aria-hidden /> Restore
              </button>
            )}
          </div>
        </div>

        {/* Billing summary line (§21) */}
        <div className="mt-4 pt-4 border-t border-white/[0.05] flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
          {currency && <span className="text-neutral-500">Currency: <span className="text-neutral-300">{currency}</span></span>}
          {client.commercialDefaults?.billingModel && <span className="text-neutral-500">Billing model: <span className="text-neutral-300">{client.commercialDefaults.billingModel}</span></span>}
          {client.commercialDefaults?.paymentTerms && <span className="text-neutral-500">Payment terms: <span className="text-neutral-300">{client.commercialDefaults.paymentTerms}</span></span>}
          {client.billingProfile?.city && <span className="text-neutral-500">Location: <span className="text-neutral-300">{[client.billingProfile.city, client.billingProfile.state, client.billingProfile.country].filter(Boolean).join(', ')}</span></span>}
        </div>
      </div>

      {/* Overview (§22) — honest metrics: real ones from core data, future ones labeled */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="text-[14px] font-semibold text-white mb-2.5">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Module 3 (§94) — live: status-ACTIVE projects for this client */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Active Projects</div>
            <div className="mt-2 text-[20px] font-semibold text-white">
              {projectSummary ? String(projectSummary.activeCount) : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Total Billed</div>
            <div className="mt-2 text-[15px] font-semibold text-neutral-500">Coming with Billing</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Total Collected</div>
            <div className="mt-2 text-[15px] font-semibold text-neutral-500">Coming with Payments</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Outstanding</div>
            <div className="mt-2 text-[15px] font-semibold text-neutral-500">Coming with Billing</div>
          </div>
          {/* Module 3 (§94) — live but PLANNED (§67 truth label): the sum of
              contractValue ?? revenueBudget over this client's projects */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Total Project Value (planned)</div>
            <div className="mt-2 text-[15px] font-semibold text-white">
              {projectSummary ? formatMoney(projectSummary.plannedValue, currency) : '—'}
            </div>
          </div>
          {/* Real core data — manual transactions credited to this client */}
          <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">Transactions (core, recent 10)</div>
            <div className="mt-2 text-[15px] font-semibold text-white">
              {transactions.length > 0 ? formatMoney(totalBilledCore, currency) : <span className="text-neutral-500">No transactions linked yet</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Projects (§21/§94) — live since Module 3 */}
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="text-[14px] font-semibold text-white mb-2.5">Projects</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] overflow-hidden overflow-x-auto">
          {projects.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-neutral-500">No projects for this client yet — create one from the Projects page.</p>
          ) : (
            <table className="w-full text-[13px]" aria-label="Client projects">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Project</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Model</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">Value (planned)</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/agency/projects/${p.id}`} className="text-neutral-200 hover:underline underline-offset-2">{p.name}</Link>
                      {p.code && <div className="text-[11.5px] text-neutral-500">{p.code}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <ProjectStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400">{MODEL_LABEL[p.billingModel] || p.billingModel}</td>
                    <td className="px-4 py-2.5 text-right text-neutral-300">
                      {(p.contractValue ?? p.revenueBudget) !== undefined
                        ? formatMoney((p.contractValue ?? p.revenueBudget) as number, p.currency)
                        : <span className="text-neutral-600">Not set</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Transactions (§21) — real core data */}
      <section aria-labelledby="transactions-heading">
        <h2 id="transactions-heading" className="text-[14px] font-semibold text-white mb-2.5">Transactions</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] overflow-hidden overflow-x-auto">
          {transactions.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-neutral-500">No transactions reference this client yet.</p>
          ) : (
            <table className="w-full text-[13px]" aria-label="Client transactions">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.id || i} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2.5 text-neutral-400 text-[12px]">{formatDate(t.date)}</td>
                    <td className="px-4 py-2.5 text-neutral-200">{t.description}</td>
                    <td className={`px-4 py-2.5 ${t.type === 'Credit' ? 'text-emerald-400' : 'text-red-400'}`}>{t.type}</td>
                    <td className="px-4 py-2.5 text-right text-white">{formatMoney(t.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Notes (§21) */}
      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="text-[14px] font-semibold text-white mb-2.5">Notes</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
          {client.notes ? (
            <p className="text-[13px] text-neutral-300 whitespace-pre-wrap">{client.notes}</p>
          ) : (
            <p className="text-[13px] text-neutral-500">No notes on this client.</p>
          )}
        </div>
      </section>

      {/* Activity (§26) */}
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-[14px] font-semibold text-white mb-2.5">Activity</h2>
        <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
          {activity.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No activity recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 pl-4 border-l border-white/[0.08]">
              {activity.map((a, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-neutral-600" aria-hidden />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12.5px] font-medium text-neutral-200">{a.action}</span>
                    <span className="text-[11.5px] text-neutral-500">by {a.username}</span>
                    <span className="text-[11.5px] text-neutral-600">· {formatDate(a.timestamp)}</span>
                  </div>
                  {a.details && <p className="mt-0.5 text-[12px] text-neutral-500">{a.details}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
