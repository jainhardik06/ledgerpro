"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Building2 } from 'lucide-react';
import type { AgencySnapshotSummary } from '@/lib/agency/types/agency.dashboard';
import type { AgencyDashboardMetrics } from '@/lib/agency/types/agency.dashboard-metrics';

/**
 * Agency Snapshot (Module 1.14) — a compact SUMMARY, not another analytics
 * module: no formulas, no derived values. Every number is read straight off
 * the dashboard contract (metrics + snapshot counts) and displayed.
 *
 *   Active Projects       12
 *   Active Clients         9
 *   Team Members          16
 *   Billable Utilization  71%
 *   Average Margin        38%
 */

interface AgencySnapshotCardProps {
  snapshot: AgencySnapshotSummary;
  grossMargin: AgencyDashboardMetrics['averageMargin'];
}

export function AgencySnapshotCard({ snapshot, grossMargin }: AgencySnapshotCardProps) {
  // Awaiting-source flags per line: roster, time, and the actual margin
  // (planned margin carries its own readiness on the snapshot, §92).
  const marginReady = grossMargin.sourceReady && grossMargin.value !== null;

  const lines: Array<{ label: string; display: string; ready: boolean; note?: string }> = [
    // Module 3 (Step 3.8) — live from the project store; the snapshot line
    // carries its own readiness (a failed query renders pending, not zero).
    { label: 'Active Projects', display: String(snapshot.activeProjects), ready: snapshot.activeProjectsReady, note: 'Waiting for projects' },
    // Module 2 (Step 2.7) — live from the client store; its own readiness
    // flag, no longer gated on the projects sprint.
    { label: 'Active Clients', display: String(snapshot.activeClients), ready: snapshot.activeClientsReady, note: 'Waiting for clients' },
    { label: 'Team Members', display: String(snapshot.teamMembers), ready: true },
    {
      label: 'Billable Utilization',
      display: snapshot.billableUtilization !== null ? `${Math.round(snapshot.billableUtilization * 100)}%` : '—',
      ready: snapshot.billableUtilization !== null,
      note: 'Waiting for time tracking',
    },
    {
      // Module 3 (§92) — the PLANNED portfolio margin. Distinct metric from
      // the actual Average Margin line below: planned ≠ delivered, and the
      // two never share a basis (Module 1.5 separation rule).
      label: 'Planned Margin',
      display: snapshot.plannedMargin !== null ? `${snapshot.plannedMargin.toFixed(1)}%` : '—',
      ready: snapshot.plannedMarginReady && snapshot.plannedMargin !== null,
      note: snapshot.plannedMarginReady ? 'No project carries both budgets yet' : 'Waiting for projects',
    },
    {
      // Module 6 (§124) — readiness for the future Time Tracking module:
      // §126-composite-ready projects out of deliverable-scope (ACTIVE ∪
      // ON_HOLD). Counts only — a user without cost-rate permission learns
      // nothing sensitive from this line (§99).
      label: 'Ready for Tracking',
      display: `${snapshot.projectsReadyForTracking}/${snapshot.projectsDeliverableTotal}`,
      ready: snapshot.rateReadinessReady,
      note: snapshot.rateReadinessReady
        ? (snapshot.projectsDeliverableTotal === 0 ? 'No deliverable projects yet' : undefined)
        : 'Waiting for rate data',
    },
    {
      // Module 6 (§123/§124) — the configuration gap the agency must close
      // before time entries become financially meaningful.
      label: 'Missing Rate Config',
      display: String(snapshot.projectsMissingRates),
      ready: snapshot.rateReadinessReady,
      note: snapshot.rateReadinessReady
        ? (snapshot.projectsMissingRates > 0 ? 'Projects with unpriced members' : 'All priced')
        : 'Waiting for rate data',
    },
    {
      // Module 6 (§123) — active users with no cost rate: their future time
      // would carry UNKNOWN cost (§96), never a silent zero.
      label: 'Users Without Cost Rate',
      display: String(snapshot.usersWithoutCostRate),
      ready: snapshot.rateReadinessReady,
      note: snapshot.rateReadinessReady
        ? (snapshot.usersWithoutCostRate > 0 ? 'Assign cost cards before tracking' : 'All priced')
        : 'Waiting for rate data',
    },
    {
      // Module 13 (§118) — the ACTUAL portfolio margin from the ONE
      // profitability engine (same service the reports use, §70). Scale is
      // 0–100 like every dashboard percentage (§83: one decimal).
      label: 'Average Margin',
      display: marginReady ? `${(grossMargin.value as number).toFixed(1)}%` : '—',
      ready: marginReady,
      note: 'Waiting for profitability data',
    },
  ];

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-neutral-500" aria-hidden />
          Agency Snapshot
        </CardTitle>
        <CardDescription>The workspace at a glance</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          {lines.map(line => (
            <div key={line.label}>
              <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 truncate">{line.label}</div>
              <div
                className={`mt-1 text-[16px] font-semibold tabular-nums tracking-tight ${
                  line.ready ? 'text-neutral-200' : 'text-neutral-600'
                }`}
              >
                {line.ready ? line.display : '—'}
              </div>
              {/* Module 1.22 — pending source: name it, never zero */}
              {!line.ready && (
                <div className="mt-0.5 text-[10.5px] text-neutral-500 truncate">{line.note || 'Not available yet'}</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
