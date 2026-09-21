"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, RefreshCw, Users, FolderKanban, Clock, FileText, IndianRupee, Hourglass, ChevronRight, X } from 'lucide-react';

/**
 * Platform Console — Agency Intelligence (post-Phase-1 super-admin surface).
 *
 * Everything here is a READ of the one Phase 1 engine set (the API routes
 * assemble from the same queries the tenant dashboards use — no second
 * source of financial truth). Money fields carry their currency; a null
 * total renders as "Mixed currencies" rather than a converted number (the
 * §127 rule at platform scope).
 */

interface GroupedMoney { total: number | null; currency: string | null; byCurrency: Record<string, number>; }

interface TenantRow {
  tenantId: string; name: string; appMode: string; status: string; plan: string;
  clients: number; totalProjects: number; activeProjects: number;
  hoursLogged: number; billableHours: number; hours30d: number;
  hasRateSetup: boolean; hasTimeEntries: boolean; hasIssuedInvoices: boolean;
  invoiced: GroupedMoney; collected: GroupedMoney; outstanding: GroupedMoney;
}

interface AgencyAnalytics {
  adoption: { agencyTenants: number; activeTenants: number; agencySharePercent: number | null };
  activation: { withClients: number; withProjects: number; withRates: number; withTime: number; withInvoices: number };
  volume: {
    activeProjects: number; hours30d: number; billableHoursAllTime: number;
    invoiced: GroupedMoney; collected: GroupedMoney; outstanding: GroupedMoney;
  };
  tenants: TenantRow[];
}

interface TenantSnapshot {
  isAgency: boolean;
  tenant: { id: string; name: string; appMode: string; status: string; plan: string };
  timezone?: string;
  activeClients?: number;
  activeProjects?: number;
  contractedRevenue?: number;
  plannedMargin?: number | null;
  rateReadiness?: { projectsTotal: number; projectsReadyForTracking: number; projectsMissingRates: number; usersWithoutCostRate: number; usersTotal: number };
  hoursLast30d?: number;
  billableHoursLast30d?: number;
  receivables?: { outstanding: number; dueSoon: number; overdueAmount: number; overdueCount: number; currency: string | null };
  mixedCurrencies?: boolean;
  money?: { invoicedRevenue: number | null; collectedRevenue: number | null; invoicedCurrency: string | null; collectedCurrency: string | null; mixedInvoicedCurrencies: boolean; mixedCollectedCurrencies: boolean };
  profitability?: { projectCount: number; mixedCurrencies: boolean; contractValue: number | null; applicableRevenue: number | null; deliveryCost: number | null; grossProfit: number | null; marginPercent: number | null; currency: string | null };
}

/** Money cell: a real total with its currency, or the honest mixed state. */
function MoneyCell({ money }: { money: GroupedMoney | undefined }) {
  if (!money) return <span className="text-neutral-600">—</span>;
  if (money.total === null) {
    const parts = Object.entries(money.byCurrency).filter(([, v]) => v > 0)
      .map(([c, v]) => `${Math.round(v).toLocaleString('en-IN')} ${c}`);
    return <span className="text-neutral-500" title={parts.join(' · ')}>Mixed</span>;
  }
  return <span className="tabular-nums">{money.currency ? `${money.currency} ` : ''}{Math.round(money.total).toLocaleString('en-IN')}</span>;
}

function moneyText(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined) return 'Mixed currencies';
  return `${currency ? `${currency} ` : ''}${Math.round(value).toLocaleString('en-IN')}`;
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-3.5 h-3.5 text-neutral-500" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white tracking-tight tabular-nums">{value}</div>
      {sub && <p className="mt-1 text-[11.5px] text-neutral-500">{sub}</p>}
    </div>
  );
}

/** The per-tenant privileged snapshot drawer (support read, one engine set). */
function SnapshotDrawer({ tenantId, onClose }: { tenantId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<TenantSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setData(null); setError(null); return; }
    setLoading(true); setError(null); setData(null);
    fetch(`/api/super-admin/tenants/${tenantId}/agency`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setData)
      .catch(() => setError('Failed to load the agency snapshot.'))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (tenantId) window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [tenantId, onClose]);

  if (!tenantId) return null;

  const impersonate = async () => {
    try {
      const res = await fetch('/api/super-admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) router.push('/dashboard');
    } catch { /* the button stays — the operator can retry */ }
  };

  const line = (label: string, value: string, muted = false) => (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[12.5px] text-neutral-500">{label}</span>
      <span className={`text-[13px] tabular-nums ${muted ? 'text-neutral-500' : 'text-neutral-200'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Tenant agency snapshot">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/[0.08] flex flex-col animate-in slide-in-from-right duration-200">
        <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-white/[0.06]">
          <span className="text-[14px] font-semibold text-white truncate">Agency snapshot</span>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && <p className="text-[13px] text-neutral-500">Loading snapshot…</p>}
          {error && <p role="alert" className="text-[13px] text-red-400">{error}</p>}
          {data && !data.isAgency && (
            <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
              <p className="text-[13px] text-neutral-300">{data.tenant.name} has not activated the Agency vertical (appMode: {data.tenant.appMode}).</p>
              <p className="mt-1.5 text-[12px] text-neutral-500">No agency numbers exist for this workspace — that is the honest answer, not a missing report.</p>
            </div>
          )}
          {data?.isAgency && (
            <>
              <div>
                <h3 className="text-[13.5px] font-semibold text-white mb-1">{data.tenant.name}</h3>
                <p className="text-[11.5px] text-neutral-500">{data.tenant.plan} · {data.tenant.status} · {data.timezone}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
                <div className="text-[10.5px] font-medium uppercase tracking-widest text-neutral-500 mb-2">Delivery</div>
                {line('Active clients', data.activeClients !== undefined ? String(data.activeClients) : '—')}
                {line('Active projects', data.activeProjects !== undefined ? String(data.activeProjects) : '—')}
                {line('Contracted revenue', data.contractedRevenue !== undefined ? moneyText(data.contractedRevenue, null) : '—')}
                {line('Hours (last 30d)', data.hoursLast30d !== undefined ? `${data.hoursLast30d.toFixed(1)}h` : '—')}
                {data.billableHoursLast30d !== undefined && line('Billable (last 30d)', `${data.billableHoursLast30d.toFixed(1)}h`)}
                {data.plannedMargin !== undefined && data.plannedMargin !== null && line('Planned margin', `${data.plannedMargin.toFixed(1)}%`)}
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
                <div className="text-[10.5px] font-medium uppercase tracking-widest text-neutral-500 mb-2">Money</div>
                {data.money && line('Invoiced (all time)', moneyText(data.money.invoicedRevenue, data.money.invoicedCurrency), data.money.mixedInvoicedCurrencies)}
                {data.money && line('Collected (all time)', moneyText(data.money.collectedRevenue, data.money.collectedCurrency), data.money.mixedCollectedCurrencies)}
                {data.receivables
                  ? line('Outstanding', moneyText(data.receivables.outstanding, data.receivables.currency))
                  : data.mixedCurrencies && line('Outstanding', 'Mixed currencies', true)}
                {data.receivables && line('Overdue', `${moneyText(data.receivables.overdueAmount, data.receivables.currency)} (${data.receivables.overdueCount})`)}
              </div>
              {data.profitability && (
                <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
                  <div className="text-[10.5px] font-medium uppercase tracking-widest text-neutral-500 mb-2">Profitability (engine)</div>
                  {line('Projects evaluated', String(data.profitability.projectCount))}
                  {line('Applicable revenue', moneyText(data.profitability.applicableRevenue, data.profitability.currency), data.profitability.mixedCurrencies)}
                  {line('Delivery cost', moneyText(data.profitability.deliveryCost, data.profitability.currency), data.profitability.mixedCurrencies)}
                  {line('Gross profit', moneyText(data.profitability.grossProfit, data.profitability.currency), data.profitability.mixedCurrencies)}
                  {line('Margin', data.profitability.marginPercent !== null ? `${data.profitability.marginPercent.toFixed(1)}%` : '—')}
                </div>
              )}
              {data.rateReadiness && (
                <div className="rounded-xl border border-white/[0.06] bg-[#050505] p-4">
                  <div className="text-[10.5px] font-medium uppercase tracking-widest text-neutral-500 mb-2">Rate readiness</div>
                  {line('Ready for tracking', `${data.rateReadiness.projectsReadyForTracking} / ${data.rateReadiness.projectsTotal}`)}
                  {line('Projects missing rates', String(data.rateReadiness.projectsMissingRates))}
                  {line('Users without cost rate', `${data.rateReadiness.usersWithoutCostRate} / ${data.rateReadiness.usersTotal}`)}
                </div>
              )}
              <button
                onClick={() => void impersonate()}
                className="w-full px-3 py-2 rounded bg-white text-black text-[12.5px] font-semibold hover:bg-neutral-200 transition-colors"
              >
                Impersonate this workspace
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgencyAnalyticsPage() {
  const [data, setData] = useState<AgencyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotFor, setSnapshotFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetch('/api/super-admin/agency')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setData)
      .catch(() => setError('Failed to load agency analytics.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="p-6 text-neutral-500 text-[13px]">Loading agency intelligence…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <p role="alert" className="text-[13px] text-red-400">{error || 'No data.'}</p>
        <button onClick={load} className="mt-3 px-3 py-1.5 rounded border border-white/[0.1] text-[12.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">Retry</button>
      </div>
    );
  }

  const funnel = [
    { label: 'Created a client', count: data.activation.withClients },
    { label: 'Created a project', count: data.activation.withProjects },
    { label: 'Configured rates', count: data.activation.withRates },
    { label: 'Logged time', count: data.activation.withTime },
    { label: 'Issued an invoice', count: data.activation.withInvoices },
  ];
  const funnelMax = Math.max(1, data.adoption.agencyTenants);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">

      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Agency Intelligence</h1>
          <p className="text-[13px] text-neutral-400">Platform-wide adoption, activation, and money volume of the Agency vertical — read from the same engines each tenant dashboard uses.</p>
        </div>
        <button onClick={load} aria-label="Refresh analytics" className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors shrink-0">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard icon={Briefcase} label="Agency tenants" value={String(data.adoption.agencyTenants)}
            sub={data.adoption.agencySharePercent !== null ? `${data.adoption.agencySharePercent.toFixed(1)}% of ${data.adoption.activeTenants} active` : undefined} />
          <KpiCard icon={FolderKanban} label="Active projects" value={String(data.volume.activeProjects)} sub="Across all agency tenants" />
          <KpiCard icon={Clock} label="Hours (30d)" value={data.volume.hours30d.toFixed(1)} sub={`${data.volume.billableHoursAllTime.toFixed(0)}h billable all-time`} />
          <KpiCard icon={FileText} label="Invoiced" value={moneyText(data.volume.invoiced.total, data.volume.invoiced.currency)} sub="Issued invoices, all tenants" />
          <KpiCard icon={IndianRupee} label="Collected" value={moneyText(data.volume.collected.total, data.volume.collected.currency)} sub="Confirmed − reversed payments" />
          <KpiCard icon={Hourglass} label="Outstanding" value={moneyText(data.volume.outstanding.total, data.volume.outstanding.currency)} sub="Open invoice balances" />
        </div>

        {/* §80 activation funnel */}
        <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
          <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-1">Activation Funnel</h2>
          <p className="text-[12px] text-neutral-500 mb-5">Active agency tenants reaching each Phase 1 milestone (§80 — adoption is measured by real financial behavior).</p>
          <div className="space-y-4 max-w-2xl">
            {funnel.map(stage => (
              <div key={stage.label}>
                <div className="flex justify-between text-[13px] text-neutral-300 mb-2">
                  <span>{stage.label}</span>
                  <span className="font-mono text-neutral-400">{stage.count} / {data.adoption.agencyTenants}</span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (stage.count / funnelMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-tenant table */}
        <div>
          <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-3">Agencies</h2>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden overflow-x-auto">
            <table className="hidden md:table w-full text-[13px]" aria-label="Agency tenants">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th scope="col" className="px-4 py-3 font-medium">Tenant</th>
                  <th scope="col" className="px-4 py-3 font-medium">Mode</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Clients</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Active projects</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Hours (30d)</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Invoiced</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Collected</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Outstanding</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map(t => (
                  <tr key={t.tenantId} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-white">{t.name}</span>
                      <div className="text-[11px] text-neutral-600">{t.plan} · {t.status}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={t.appMode === 'Agency' ? 'text-emerald-300' : 'text-neutral-500'}>{t.appMode === 'Agency' ? 'Agency' : 'Standard'}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{t.clients}</td>
                    <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{t.activeProjects}</td>
                    <td className="px-4 py-3 text-right text-neutral-300 tabular-nums">{t.hours30d.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-neutral-300"><MoneyCell money={t.invoiced} /></td>
                    <td className="px-4 py-3 text-right text-neutral-300"><MoneyCell money={t.collected} /></td>
                    <td className="px-4 py-3 text-right text-neutral-300"><MoneyCell money={t.outstanding} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setSnapshotFor(t.tenantId)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/[0.08] text-[11.5px] text-neutral-300 hover:bg-white/[0.04] transition-colors">
                        <Users className="w-3 h-3" aria-hidden /> Snapshot
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {data.tenants.map(t => (
                <button key={t.tenantId} onClick={() => setSnapshotFor(t.tenantId)} className="w-full text-left flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-white truncate">{t.name}</div>
                    <div className="text-[11.5px] text-neutral-500 truncate">
                      {t.appMode === 'Agency' ? 'Agency' : 'Standard'} · {t.activeProjects} active · {t.hours30d.toFixed(1)}h (30d)
                      {t.invoiced.total !== null && ` · ${moneyText(t.invoiced.total, t.invoiced.currency)} invoiced`}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      <SnapshotDrawer tenantId={snapshotFor} onClose={() => setSnapshotFor(null)} />
    </div>
  );
}
