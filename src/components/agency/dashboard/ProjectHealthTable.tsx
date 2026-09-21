"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/Table';
import type { ProjectHealthRow, ProjectHealthStatus } from '@/lib/agency/types/agency.dashboard';
import { sortProjectsByHealth } from '@/lib/agency/domain/project-health';
import { formatMoney } from '@/lib/agency/types/money';
import { formatPercentage } from '@/lib/agency/types/money';

/**
 * Project Portfolio Health table (Module 1.2 hierarchy slot 3; Module 1.7 columns/sort).
 *
 * Columns: Project | Client | Value | Cost | Billed | Collected | Margin | Burn | Health.
 * Responsive: progressive disclosure per Money OS table conventions — Client,
 * Collected, and Billed collapse out on mobile (client name nests into the
 * Project cell; key financials stay visible).
 *
 * Default sort (Module 1.7): problems before successes —
 *   Over Budget → At Risk → Watch → Healthy → Completed.
 * Rows arrive pre-sorted from the query service; the table re-applies the
 * same deterministic ordering defensively so the visual contract holds
 * regardless of payload order.
 */

const STATUS_BADGE: Record<ProjectHealthStatus, { label: string; className: string; dot: string }> = {
  HEALTHY: { label: 'Healthy', className: 'text-emerald-400 bg-emerald-500/10', dot: 'bg-emerald-400' },
  WATCH: { label: 'Watch', className: 'text-amber-400 bg-amber-500/10', dot: 'bg-amber-400' },
  AT_RISK: { label: 'At Risk', className: 'text-rose-400 bg-rose-500/10', dot: 'bg-rose-400' },
  OVER_BUDGET: { label: 'Over Budget', className: 'text-rose-500 bg-rose-500/15', dot: 'bg-rose-500' },
  COMPLETED: { label: 'Completed', className: 'text-neutral-400 bg-white/[0.05]', dot: 'bg-neutral-400' },
};

interface ProjectHealthTableProps {
  projects: readonly ProjectHealthRow[];
}

export function ProjectHealthTable({ projects }: ProjectHealthTableProps) {
  // Module 1.7 default sort — the dashboard puts problems before successes.
  const sorted = sortProjectsByHealth(projects);

  return (
    <Card className="bg-[#050505]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[14px]">Project Portfolio Health</CardTitle>
        <CardDescription>Where exactly is the problem — worst first</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Module 1.24 — screen-reader summary: the table's shape and worst
            first ordering, without reading every cell. */}
        <p className="sr-only">
          {`Project portfolio health, ${sorted.length} projects, sorted worst first. Statuses: ${
            sorted.map(p => `${p.name} ${STATUS_BADGE[p.status].label}`).join('; ') || 'none'
          }.`}
        </p>
        <Table aria-label="Project portfolio health, worst first">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Project</TableHead>
              <TableHead scope="col" className="hidden sm:table-cell">Client</TableHead>
              <TableHead scope="col" className="text-right">Value</TableHead>
              <TableHead scope="col" className="text-right">Cost</TableHead>
              <TableHead scope="col" className="text-right hidden md:table-cell">Billed</TableHead>
              <TableHead scope="col" className="text-right hidden md:table-cell">Collected</TableHead>
              <TableHead scope="col" className="text-right">Margin</TableHead>
              <TableHead scope="col" className="text-right hidden lg:table-cell">Burn</TableHead>
              <TableHead scope="col">Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(p => {
              const badge = STATUS_BADGE[p.status];
              return (
                <TableRow key={p.projectId}>
                  <TableCell className="font-medium text-neutral-200">
                    <div className="min-w-0 truncate">{p.name}</div>
                    {/* Mobile disclosure: client nested into primary row */}
                    <div className="sm:hidden text-[11px] text-neutral-600 truncate">{p.clientName}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-neutral-400">
                    <div className="min-w-0 truncate max-w-[140px]">{p.clientName}</div>
                  </TableCell>
                  <TableCell className="text-right text-neutral-300 tabular-nums">
                    {formatMoney({ amount: p.contractValue, currency: 'INR' })}
                  </TableCell>
                  <TableCell className="text-right text-neutral-300 tabular-nums">
                    {formatMoney({ amount: p.cost, currency: 'INR' })}
                  </TableCell>
                  <TableCell className="text-right text-neutral-300 tabular-nums hidden md:table-cell">
                    {formatMoney({ amount: p.billed, currency: 'INR' })}
                  </TableCell>
                  <TableCell className="text-right text-neutral-300 tabular-nums hidden md:table-cell">
                    {formatMoney({ amount: p.collected, currency: 'INR' })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={p.margin !== null && p.margin < 0 ? 'text-rose-400' : 'text-neutral-300'}>
                      {formatPercentage(p.margin)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-neutral-300 tabular-nums hidden lg:table-cell">
                    {formatPercentage(p.budgetBurn)}
                  </TableCell>
                  <TableCell>
                    {/* Module 1.24 — non-color-only status: dot + TEXT label */}
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${badge.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} aria-hidden />
                      {badge.label}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
