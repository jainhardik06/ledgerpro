"use client";

import React, { useState } from 'react';
import { RefreshCw, Plus, ChevronDown, CalendarRange } from 'lucide-react';
import { formatBusinessDate, type ReportingPeriod, type DateRange } from '@/lib/agency/types/dates';
import { describeDateRange } from '@/lib/agency/types/dates';

/**
 * Agency Command Center header (Module 1.3).
 *
 *   Agency Command Center
 *   [Date Range] [Refresh] [+ Quick Action]
 *
 * The date-range selection is the SINGLE period driver: it changes the API
 * request, and the server resolves one window for every metric. The header
 * always shows the resolved window so the period is stated, never ambiguous.
 */

const PERIOD_LABELS: Record<ReportingPeriod, string> = {
  THIS_MONTH: 'This Month',
  LAST_MONTH: 'Last Month',
  THIS_QUARTER: 'This Quarter',
  THIS_YEAR: 'This Year',
  CUSTOM: 'Custom',
};

interface AgencyHeaderProps {
  period: ReportingPeriod;
  dateRange: DateRange;
  /** Tenant timezone (Module 1.16) — displayed with the period statement. */
  timezone: string;
  loading: boolean;
  onPeriodChange: (period: ReportingPeriod) => void;
  onRefresh: () => void;
}

export function AgencyHeader({ period, dateRange, timezone, loading, onPeriodChange, onRefresh }: AgencyHeaderProps) {
  const [rangeOpen, setRangeOpen] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold tracking-tight text-white truncate">Agency Command Center</h1>
        {/* The period statement — every metric below represents exactly this window.
            Timezone shown per Module 1.16 (tenant tz, e.g. Asia/Kolkata). */}
        <p className="mt-0.5 text-[12px] text-neutral-500 flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {describeDateRange(dateRange)} · {timezone}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Date range selector */}
        <div className="relative">
          <button
            aria-label="Select reporting period"
            aria-expanded={rangeOpen}
            onClick={() => setRangeOpen(o => !o)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-[12.5px] text-neutral-300 hover:bg-white/[0.05] transition-colors"
          >
            <span>{PERIOD_LABELS[period]}</span>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500" aria-hidden />
          </button>

          {rangeOpen && (
            <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-white/[0.08] bg-[#0a0a0a] shadow-xl p-1">
              {(Object.keys(PERIOD_LABELS) as ReportingPeriod[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setRangeOpen(false); onPeriodChange(p); }}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                    p === period ? 'text-white bg-white/[0.08]' : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
              {/* Custom range opens the future custom-picker; until the date
                  inputs land, selecting Custom prompts for the next step. */}
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          aria-label="Refresh dashboard"
          onClick={onRefresh}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:text-white hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>

        {/* Quick action (Module 1.15) — opens the Command Palette, the core
            Money OS quick-action surface; agency actions live there. */}
        <button
          type="button"
          aria-label="Open quick actions"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">Quick Action</span>
        </button>
      </div>
    </div>
  );
}
