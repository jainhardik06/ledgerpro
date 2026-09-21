"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import type { AgencyTrends, AgencyTrendPoint } from '@/lib/agency/types/agency.dashboard';

/**
 * Trend Section (Module 1.13 — hierarchy slot 6, replacing the placeholder).
 *
 * Three charts, each a pure display of the domain trend series:
 *   1. Revenue vs Collection            — two lines
 *   2. Project Margin Trend             — Month → Margin %
 *   3. Cash/Receivable Trend            — Invoiced / Collected / Outstanding
 *
 * Built on the existing Recharts foundation (GrowthCharts conventions:
 * ResponsiveContainer + debounced resize, minimal axes, dark tooltip).
 * All values come from the analytics service (types AgencyTrends) — this
 * component never computes a point, never fabricates a series, and renders
 * the awaiting-source state when `sourceReady` is false (empty series never
 * draws a fake flat line).
 */

interface TrendSectionProps {
  trends: AgencyTrends;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  itemStyle: { color: '#e4e4e7' },
} as const;

const AXIS_PROPS = {
  stroke: '#52525b',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** Format money values compactly for axes (minor units → "8.6L"-style compact). */
const moneyTick = (val: number) =>
  val === 0 ? '0' : Math.abs(val) >= 100000 ? `${(val / 100000).toFixed(1)}L` : `${Math.round(val / 1000)}K`;

const percentTick = (val: number) => `${Math.round(val * 100)}%`;

/**
 * Module 1.24 — screen-reader chart summary: one sentence describing the
 * series (first → last value) so charts are not graphics-only. The figure
 * carries role="img" with an aria-label; this summary is its content.
 */
function chartSummary(label: string, points: AgencyTrendPoint[], series: Array<{ name: string; get: (p: AgencyTrendPoint) => number | null }>): string {
  if (points.length === 0) return `${label}: no data yet.`;
  const parts = series.map(s => {
    const first = s.get(points[0]);
    const last = s.get(points[points.length - 1]);
    const fmt = (v: number | null) => (v === null ? 'not available' : Math.abs(v) >= 1000 ? `${(v / 100000).toFixed(2)}L` : String(v));
    return `${s.name}: ${fmt(first)} in ${points[0].month} to ${fmt(last)} in ${points[points.length - 1].month}`;
  });
  return `${label} across ${points[0].month} to ${points[points.length - 1].month}. ${parts.join('. ')}.`;
}

export function TrendSection({ trends }: TrendSectionProps) {
  if (!trends.sourceReady || trends.points.length === 0) {
    // Awaiting-source state (Module 1.13 / Step 0.14): no fabricated lines.
    return (
      <Card className="bg-[#050505]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[14px]">Trends</CardTitle>
          <CardDescription>Cash and margin trajectory</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-[13px] text-neutral-600">
            Trend charts arrive with the first invoiced and paid work.
          </p>
        </CardContent>
      </Card>
    );
  }

  const points: AgencyTrendPoint[] = [...trends.points];

  return (
    <div className="space-y-3">
      {/* 1. Revenue vs Collection */}
      <Card className="bg-[#050505]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[14px]">Revenue vs Collection</CardTitle>
          <CardDescription>Money earned against money received, by month</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Module 1.24 — chart summary for screen readers */}
          <figure role="img" aria-label={chartSummary('Revenue versus Collection trend', points, [
            { name: 'Revenue', get: p => p.revenue },
            { name: 'Collection', get: p => p.collected },
          ])}>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
                <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="month" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} tickFormatter={moneyTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="collected" name="Collection" stroke="#10b981" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {chartSummary('Revenue versus Collection trend', points, [
                { name: 'Revenue', get: p => p.revenue },
                { name: 'Collection', get: p => p.collected },
              ])}
            </figcaption>
          </figure>
        </CardContent>
      </Card>

      {/* 2. Project Margin Trend */}
      <Card className="bg-[#050505]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[14px]">Project Margin Trend</CardTitle>
          <CardDescription>Month → margin %</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <figure role="img" aria-label={chartSummary('Project margin trend', points, [
            { name: 'Margin', get: p => p.margin },
          ])}>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
                <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="month" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} tickFormatter={percentTick} domain={[0, 1]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => (value === null || value === undefined ? '—' : `${Math.round(Number(value) * 100)}%`)} />
                  <Line type="monotone" dataKey="margin" name="Margin" stroke="#8b5cf6" dot={false} strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {chartSummary('Project margin trend', points, [
                { name: 'Margin', get: p => p.margin },
              ])}
            </figcaption>
          </figure>
        </CardContent>
      </Card>

      {/* 3. Cash/Receivable Trend */}
      <Card className="bg-[#050505]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[14px]">Cash / Receivable Trend</CardTitle>
          <CardDescription>Invoiced, collected, and outstanding, by month</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <figure role="img" aria-label={chartSummary('Cash and receivable trend', points, [
            { name: 'Invoiced', get: p => p.invoiced },
            { name: 'Collected', get: p => p.collected },
            { name: 'Outstanding', get: p => p.outstanding },
          ])}>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
                <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                  <XAxis dataKey="month" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} tickFormatter={moneyTick} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="invoiced" name="Invoiced" stroke="#3b82f6" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {chartSummary('Cash and receivable trend', points, [
                { name: 'Invoiced', get: p => p.invoiced },
                { name: 'Collected', get: p => p.collected },
                { name: 'Outstanding', get: p => p.outstanding },
              ])}
            </figcaption>
          </figure>
        </CardContent>
      </Card>
    </div>
  );
}
