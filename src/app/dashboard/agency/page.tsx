"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { RefreshCw, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { KpiCard } from '@/components/agency/dashboard/KpiCard';
import { AlertsPanel } from '@/components/agency/dashboard/AlertsPanel';
import { ProjectHealthTable } from '@/components/agency/dashboard/ProjectHealthTable';
import { AgencyHeader } from '@/components/agency/dashboard/AgencyHeader';
import { PrimaryKpiRow } from '@/components/agency/dashboard/PrimaryKpiRow';
import { DeliverySummary } from '@/components/agency/dashboard/DeliverySummary';
import { ReceivablesSummary } from '@/components/agency/dashboard/ReceivablesSummary';
import { UnbilledWorkPanel } from '@/components/agency/dashboard/UnbilledWorkPanel';
import { ProfitabilitySnapshot } from '@/components/agency/dashboard/ProfitabilitySnapshot';
import { TrendSection } from '@/components/agency/dashboard/TrendSection';
import { AgencySnapshotCard } from '@/components/agency/dashboard/AgencySnapshotCard';
import { EmptyAgencyState } from '@/components/agency/dashboard/EmptyAgencyState';
import type { AgencyDashboardMetrics } from '@/lib/agency/types/agency.dashboard-metrics';
import type {
  AgencyAlert, AgencySnapshotSummary, AgencyTrends,
  AgencyUnbilledSummary, MetricDelta, ProjectHealthRow,
} from '@/lib/agency/types/agency.dashboard';
import type { DateRange, ReportingPeriod } from '@/lib/agency/types/dates';
import type { ScreenState } from '@/lib/agency/types/screen-state';
import { STATE_COPY } from '@/lib/agency/types/screen-state';
import { tenantHasCapability } from '@/lib/agency/types/vertical';
import { captureEvent } from '@/lib/posthog';

/**
 * The API response view (Module 1.17) — the grouped shape
 * GET /api/agency/dashboard returns:
 *
 *   { period: { from, to, timezone },
 *     financial, delivery, profitability, receivables, projects, alerts }
 *
 * The page consumes this view; view models only, never raw documents.
 */
interface AgencyDashboardPayload {
  period: { from: string; to: string; timezone: string };
  dateRange: DateRange;
  financial: {
    contractedRevenue: AgencyDashboardMetrics['contractedRevenue'];
    invoicedRevenue: AgencyDashboardMetrics['billedRevenue'];
    collectedRevenue: AgencyDashboardMetrics['collectedRevenue'];
    unbilledRevenue: AgencyDashboardMetrics['unbilledRevenue'];
    /** Module 1.17 view contract: cash collection rate lives under financial
     *  (NOT receivables — reading it there crashed ReceivablesSummary). */
    cashCollectionRate: AgencyDashboardMetrics['cashCollectionRate'];
    unbilled: AgencyUnbilledSummary;
    deltas: {
      contractedRevenue: MetricDelta | null;
      billedRevenue: MetricDelta | null;
      collectedRevenue: MetricDelta | null;
      unbilledRevenue: MetricDelta | null;
    };
  };
  delivery: {
    totalHours: AgencyDashboardMetrics['totalHours'];
    billableHours: AgencyDashboardMetrics['billableHours'];
    nonBillableHours: AgencyDashboardMetrics['nonBillableHours'];
    billablePercent: AgencyDashboardMetrics['billablePercent'];
  };
  profitability: {
    deliveryCost: AgencyDashboardMetrics['deliveryCost'];
    grossProfit: AgencyDashboardMetrics['projectProfit'];
    grossMargin: AgencyDashboardMetrics['averageMargin'];
  };
  activity: {
    activeProjects: AgencyDashboardMetrics['activeProjects'];
    atRiskProjects: AgencyDashboardMetrics['atRiskProjects'];
    snapshot: AgencySnapshotSummary;
  };
  receivables: {
    outstanding: AgencyDashboardMetrics['outstandingReceivables'];
    dueSoon: AgencyDashboardMetrics['dueSoonReceivables'];
    overdue: AgencyDashboardMetrics['overdueReceivables'];
    overdueCount: AgencyDashboardMetrics['overdueInvoiceCount'];
  };
  projects: ProjectHealthRow[];
  alerts: AgencyAlert[];
  trends: AgencyTrends;
}

/**
 * Agency Command Center (Module 1.2).
 *
 * A decision-making screen. Section order (Module 1.23 — the DOM order IS
 * the mobile order; alerts before the table, never the reverse):
 *   1. KPI cards            — "Are we okay?"
 *   2. Critical alerts      — "What needs attention?"
 *   3. Project health table — "Where exactly is the problem?"
 *   4. Receivables
 *   5. Unbilled work
 *   6. Profitability + snapshot
 *   7. Delivery activity
 *   8. Trends (awaiting-source until source entities exist)
 *
 * Contract rules:
 *   - Single fetch of /api/agency/dashboard; NO client-side aggregation.
 *   - Six-state machine (Step 0.14) + partial-data notes (Module 1.22) —
 *     zero never masquerades as failure or as unwired capability.
 *   - Only rendered when the workspace has the AGENCY_DASHBOARD capability.
 */

export default function AgencyCommandCenterPage() {
  const { tenant, user, loading: sessionLoading } = useDashboardContext();
  const [state, setState] = useState<ScreenState>({ status: 'LOADING' });
  const [data, setData] = useState<AgencyDashboardPayload | null>(null);
  const [period, setPeriod] = useState<ReportingPeriod>('THIS_MONTH');
  const [refetching, setRefetching] = useState(false);

  // Module 1.25 — client-side performance measurement. The target (< 1s
  // initial response) is MEASURED, never assumed: we record TTFB (headers
  // received) and total API duration per fetch, then the render duration on
  // commit. Telemetry is fire-and-forget — it must never break the screen.
  const perfRef = useRef<{
    ttfbMs: number;
    apiMs: number;
    renderStart: number;
    period: ReportingPeriod;
  } | null>(null);

  const allowed = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  // Module 1.3 — the period is the single filter driver: it goes to the API,
  // the server resolves ONE window, every metric represents that window.
  const loadDashboard = useCallback(async (selectedPeriod: ReportingPeriod) => {
    setRefetching(true);
    setData(null);
    setState({ status: 'LOADING' });
    try {
      const fetchStart = performance.now();
      const res = await fetch(`/api/agency/dashboard?period=${selectedPeriod}`);
      const ttfbMs = performance.now() - fetchStart; // headers received
      if (res.status === 400) {
        // Invalid custom range etc. — keep the dashboard, surface the error.
        setState({ status: 'ERROR', message: STATE_COPY.ERROR_SUMMARY, canRetry: true });
        return;
      }
      if (res.status === 401) {
        setState({ status: 'UNAUTHORIZED', reason: 'AUTH' });
        return;
      }
      if (res.status === 403) {
        // Module 1.18 — a non-agency tenant gets an application response
        // (code NOT_AGENCY_TENANT); a permission denial is CAPABILITY.
        const body = await res.json().catch(() => null);
        if (body?.code === 'NOT_AGENCY_TENANT') {
          setState({ status: 'UNAUTHORIZED', reason: 'TENANT' });
          return;
        }
        setState({ status: 'UNAUTHORIZED', reason: 'CAPABILITY' });
        return;
      }
      if (!res.ok) {
        setState({ status: 'ERROR', message: STATE_COPY.ERROR_SUMMARY, canRetry: true });
        return;
      }
      const body = await res.json();
      if (!body?.data) {
        setState({ status: 'ERROR', message: STATE_COPY.ERROR_SUMMARY, canRetry: true });
        return;
      }
      const payload = body.data as AgencyDashboardPayload;
      const apiMs = performance.now() - fetchStart; // fetch + parse complete
      // Hand off to the render-commit effect below; renderMs is measured
      // there, then the whole set is reported once.
      perfRef.current = { ttfbMs, apiMs, renderStart: performance.now(), period: selectedPeriod };
      // The API view (Module 1.17) is grouped; the page reads both the
      // grouped view and keeps working from the same single payload.
      setData(payload);
      setState(
        payload.projects.length === 0
          ? { status: 'EMPTY', message: STATE_COPY.EMPTY_AGENCY }
          : { status: 'SUCCESS' }
      );
    } catch {
      setState({ status: 'ERROR', message: STATE_COPY.ERROR_SUMMARY, canRetry: true });
    } finally {
      setRefetching(false);
    }
  }, []);

  const handlePeriodChange = useCallback((p: ReportingPeriod) => {
    setPeriod(p);
    loadDashboard(p);
  }, [loadDashboard]);

  const handleRefresh = useCallback(() => {
    loadDashboard(period);
  }, [loadDashboard, period]);

  // Module 1.15 — pending quick actions from the Command Palette. Their
  // destination modules do not exist yet; the palette routes here and
  // dispatches 'agency-action-pending'. Show an honest notice — no fake flow.
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ actionName: string }>).detail;
      if (detail?.actionName) setPendingAction(detail.actionName);
    };
    window.addEventListener('agency-action-pending', handler);
    return () => window.removeEventListener('agency-action-pending', handler);
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!allowed) {
      setState({ status: 'UNAUTHORIZED', reason: 'CAPABILITY' });
      return;
    }
    loadDashboard(period);
  }, [allowed, sessionLoading, loadDashboard, period]);

  // Module 1.25 — report the measured client-side phases once the payload
  // has COMMITTED to the DOM (render duration). Server phases (auth/query/
  // total) are already on the Server-Timing header + server telemetry; this
  // closes the loop with TTFB, full API duration, and render duration from
  // the browser. Fire-and-forget: telemetry never blocks the screen.
  useEffect(() => {
    const perf = perfRef.current;
    if (!perf || !data) return;
    perfRef.current = null;
    const renderMs = performance.now() - perf.renderStart;
    try {
      captureEvent('agency_dashboard_performance', {
        period: perf.period,
        ttfbMs: Math.round(perf.ttfbMs),
        apiMs: Math.round(perf.apiMs),
        renderMs: Math.round(renderMs),
      });
    } catch {
      // Telemetry must never break rendering — swallow report failures.
    }
  }, [data]);

  // ---- Unauthorized gate (capability model — no raw appMode checks) ----
  if (!sessionLoading && !allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Building2 className="w-8 h-8 mx-auto text-neutral-700" aria-hidden />
        <h1 className="mt-4 text-[16px] font-semibold text-white">Agency workspace required</h1>
        <p className="mt-2 text-[13px] text-neutral-500">{STATE_COPY.UNAUTHORIZED_CAPABILITY}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-[13px] text-neutral-300 underline underline-offset-4 hover:text-white">
          Go to the standard dashboard
        </Link>
      </div>
    );
  }

  // ---- Loading skeleton (no numbers, no zeros) ----
  if (state.status === 'LOADING') {
    return (
      <div className="p-4 sm:p-6 space-y-4" aria-busy="true" aria-label="Loading agency dashboard">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[86px] rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
        <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.03] animate-pulse" />
      </div>
    );
  }

  // ---- Error / unauthorized states (never financial zeros) ----
  if (state.status === 'ERROR' || state.status === 'UNAUTHORIZED') {
    const copy = state.status === 'UNAUTHORIZED'
      ? state.reason === 'AUTH' ? STATE_COPY.UNAUTHORIZED_AUTH : STATE_COPY.UNAUTHORIZED_TENANT
      : (state.message || STATE_COPY.ERROR_SUMMARY);
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <h1 className="text-[16px] font-semibold text-white">
          {state.status === 'UNAUTHORIZED' ? 'Access needed' : "We couldn't load your agency summary"}
        </h1>
        <p className="mt-2 text-[13px] text-neutral-500">{copy}</p>
        {state.status === 'ERROR' && state.canRetry && (
          <button
            onClick={() => handleRefresh()}
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden /> {STATE_COPY.RETRY}
          </button>
        )}
      </div>
    );
  }

  // ---- Success / Empty / Partial: render the hierarchy ----
  const d = data!;
  const f = d.financial, del = d.delivery, p = d.profitability, r = d.receivables, act = d.activity;

  return (
    <div className="p-4 sm:p-6 space-y-5 w-full">
      {/* Header (Module 1.3 + 1.16): title, period statement incl. timezone,
          range, refresh, quick action */}
      <AgencyHeader
        period={period}
        dateRange={d.dateRange}
        timezone={d.period.timezone}
        loading={refetching}
        onPeriodChange={handlePeriodChange}
        onRefresh={handleRefresh}
      />

      {/* EMPTY onboarding (Module 1.21) — a brand-new agency tenant gets a
          welcome panel, not a broken-looking dashboard. Module 2/3: the
          primary action is LIVE for admins (§28); USERs stay read-only. */}
      {state.status === 'EMPTY' && (
        <EmptyAgencyState actionReady={user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN'} />
      )}

      {/* Module 1.15 — pending quick action notice (destination module unbuilt) */}
      {pendingAction && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-200">{pendingAction}</p>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              Arriving with its module in Phase 1 — the destination does not exist yet.
            </p>
          </div>
          <button
            onClick={() => setPendingAction(null)}
            aria-label="Dismiss"
            className="shrink-0 text-[12px] text-neutral-500 hover:text-white transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. KPI cards — the four strategic metrics (Module 1.4).
          MOBILE ORDER (Module 1.23): the DOM below IS the mobile order —
          KPI cards → critical alerts → project health → receivables →
          unbilled → profitability → delivery → trends. Never an enormous
          table above critical warnings. Desktop shares this order; the
          responsive grids / progressive disclosure inside each section
          follow the existing Money OS patterns. */}
      <section aria-label="Executive financial snapshot">
        <PrimaryKpiRow
          contractedRevenue={f.contractedRevenue}
          billedRevenue={f.invoicedRevenue}
          collectedRevenue={f.collectedRevenue}
          unbilledRevenue={f.unbilledRevenue}
          deltas={f.deltas}
        />
      </section>

      {/* 2. Critical alerts — "What needs attention?" — BEFORE the table on
          mobile (Module 1.23): warnings outrank the portfolio table. */}
      <section aria-label="Immediate risks">
        <AlertsPanel alerts={d.alerts} />
      </section>

      {/* 3. Project Portfolio Health — "Where exactly is the problem?" */}
      <section aria-label="Project portfolio health">
        {d.projects.length > 0 ? (
          <ProjectHealthTable projects={d.projects} />
        ) : (
          <Card className="bg-[#050505]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[14px]">Project Portfolio Health</CardTitle>
              <CardDescription>Where exactly is the problem</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-[13px] text-neutral-500">{STATE_COPY.EMPTY_PROJECTS}</p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* 4. Receivables — outstanding / due soon / overdue */}
      <section aria-label="Receivables">
        <ReceivablesSummary
          outstanding={r.outstanding}
          dueSoon={r.dueSoon}
          overdue={r.overdue}
          cashCollectionRate={f.cashCollectionRate}
        />
      </section>

      {/* 5. Unbilled Work — visually prominent (Module 1.11) */}
      <section aria-label="Unbilled work">
        <UnbilledWorkPanel
          unbilled={f.unbilled}
          sourceReady={f.unbilledRevenue.sourceReady}
        />
      </section>

      {/* 6. Profitability + Agency Snapshot (Module 1.12 / 1.14) */}
      <section aria-label="Profitability">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ProfitabilitySnapshot
            revenue={f.contractedRevenue}
            deliveryCost={p.deliveryCost}
            grossProfit={p.grossProfit}
            grossMargin={p.grossMargin}
          />
          <AgencySnapshotCard
            snapshot={act.snapshot}
            grossMargin={p.grossMargin}
          />
        </div>
      </section>

      {/* 7. Delivery Activity — hours and billable rate (Module 1.9) */}
      <section aria-label="Delivery activity">
        <DeliverySummary
          totalHours={del.totalHours}
          billableHours={del.billableHours}
          nonBillableHours={del.nonBillableHours}
          billablePercent={del.billablePercent}
        />
      </section>

      {/* 8. Trends — Revenue vs Collection, Margin, Cash/Receivable (Module 1.13) */}
      <section aria-label="Trends">
        <TrendSection trends={d.trends} />
      </section>
    </div>
  );
}
