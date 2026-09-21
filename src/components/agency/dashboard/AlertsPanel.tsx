"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import type { AgencyAlert } from '@/lib/agency/types/agency.dashboard';
import { STATE_COPY } from '@/lib/agency/types/screen-state';

/**
 * Immediate Risks panel (Module 1.2 hierarchy slot 2; Module 1.6 behavior).
 *
 * MODULE 1.6 CONTRACT:
 *   Title            "Needs Attention" — directly below the KPI row.
 *   Max 5 items      the most urgent items only; the domain supplies them
 *                    pre-prioritized (severity rank), the panel slices.
 *   Actionable       every alert carries an entity reference; its row links
 *                    to the entity's page (Module 15 Step 15.12 — the
 *                    Projects and Invoices modules both exist, so the Module 1
 *                    disabled placeholder is gone). An alert with an entity
 *                    label but no projectId/invoiceId renders as plain text
 *                    (never invented navigation).
 *   Deterministic    alerts come from the domain contract only (PRD §51 —
 *                    no AI). No alerts → EMPTY state, never fabricated ones.
 *
 * Module 15 (§21): the rows are the STORED alerts (severity-ranked top rows
 * from the alert store) — the dashboard never evaluates.
 */

/** Module 1.6 hard cap — the panel shows no more than five urgent items. */
const MAX_ALERTS = 5;

const SEVERITY_ICON = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertCircle,
} as const;

const SEVERITY_CLASS = {
  INFO: 'text-sky-400',
  WARNING: 'text-amber-400',
  CRITICAL: 'text-rose-400',
} as const;

/** Severity rank for display order (CRITICAL first). */
const SEVERITY_RANK: Record<AgencyAlert['severity'], number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

interface AlertsPanelProps {
  alerts: readonly AgencyAlert[];
}

/** The alert's click-through destination (Step 15.12 — real entity pages). */
function alertHref(alert: AgencyAlert): string | undefined {
  if (alert.projectId !== undefined) return `/dashboard/agency/projects/${alert.projectId}`;
  if (alert.invoiceId !== undefined) return `/dashboard/agency/invoices/${alert.invoiceId}`;
  return undefined;
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  // The domain supplies the urgent set; the panel orders by severity and
  // hard-caps at 5 (Module 1.6).
  const urgent = [...alerts]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, MAX_ALERTS);

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px]">
          Needs Attention
          {urgent.length > 0 && (
            <span
              className="ml-2 inline-flex items-center rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-400"
              aria-label={`${urgent.length} items need attention`}
            >
              {urgent.length}
            </span>
          )}
        </CardTitle>
        <CardDescription>What needs attention right now — top {MAX_ALERTS} items</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {urgent.length === 0 ? (
          <p className="text-[13px] text-neutral-500">{STATE_COPY.EMPTY_ALERTS}</p>
        ) : (
          <ul className="space-y-2" aria-label="Urgent items">
            {urgent.map(alert => {
              const Icon = SEVERITY_ICON[alert.severity];
              const href = alertHref(alert);
              const hasEntity = Boolean(alert.entityLabel);
              return (
                <li key={alert.id} className="rounded-lg bg-white/[0.02] p-3">
                  <div className="flex items-start gap-2.5">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${SEVERITY_CLASS[alert.severity]}`} aria-hidden />
                    <span className="text-[13px] text-neutral-300 min-w-0 flex-1">
                      {/* Module 1.24 — severity announced as TEXT, not icon/color alone */}
                      <span className="sr-only">{alert.severity === 'CRITICAL' ? 'Critical: ' : alert.severity === 'WARNING' ? 'Warning: ' : ''}</span>
                      {alert.message}
                      {hasEntity && href && (
                        // Module 15 Step 15.12 — the entity page exists; the
                        // row click-through is live.
                        <Link
                          href={href}
                          className="ml-2 inline-flex items-center gap-0.5 text-[12px] text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                          {alert.entityLabel}
                          <ChevronRight className="w-3 h-3" aria-hidden />
                        </Link>
                      )}
                      {hasEntity && !href && (
                        // Defensive: an entity label with no resolvable
                        // destination renders as text, never a fake link.
                        <span className="ml-2 text-[12px] text-neutral-500">
                          {alert.entityLabel}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Module 15 (§23) — the Alert Center exists; the panel deep-links
            there for the full filterable list and acknowledge/resolve. */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Link
            href="/dashboard/agency/alerts"
            className="inline-flex items-center gap-1 text-[13px] text-neutral-300 hover:text-white transition-colors"
          >
            View Alert Center
            <ChevronRight className="w-3.5 h-3.5" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
