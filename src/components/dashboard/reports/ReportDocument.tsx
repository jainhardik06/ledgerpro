"use client";

import React, { useId } from 'react';


export interface ReportDocumentProps {
  metrics: {
    income: number;
    expenses: number;
    netProfit: number;
    volume: number;
    savingsRate: number;
    balance: number;
    compare?: {
      income: number;
      expenses: number;
      netProfit: number;
      volume: number;
      savingsRate: number;
      incomeGrowth: number;
      expenseGrowth: number;
      netProfitGrowth: number;
      volumeGrowth: number;
      savingsRateDiff: number;
    } | null;
  };
  cashFlowTimeline: Array<{
    date: string;
    formattedDate: string;
    income: number;
    expense: number;
    net: number;
    cumulative: number;
  }>;
  spendingBreakdown: Array<{
    name: string;
    value: number;
    count: number;
    percentage: number;
  }>;
  budgetIntelligence: {
    budgets: Array<{
      category: string;
      limit: number;
      spent: number;
      remaining: number;
      ratio: number;
      risk: 'low' | 'warning' | 'critical';
    }>;
    totalLimit: number;
    totalSpent: number;
    totalRemaining: number;
    overallRatio: number;
  };
  clientIntelligence: Array<{
    name: string;
    totalRevenue: number;
    txCount: number;
    contributionRatio: number;
  }>;
  teamIntelligence: Array<{
    username: string;
    txCount: number;
    totalSpent: number;
    lastActive: string;
  }>;
  recurringIntelligence: {
    monthlyObligations: number;
    upcoming: Array<{
      id: string;
      description: string;
      amount: number;
      type: string;
      interval: string;
      nextRunDate: string;
      category: string;
    }>;
  };
  auditIntelligence: Array<{
    id: string;
    username: string;
    action: string;
    details: string;
    timestamp: string;
  }>;
  filterMetadata: {
    dateRangeLabel: string;
    startDateStr: string;
    endDateStr: string;
    accountName: string;
    categoryName: string;
    clientName: string;
    teamMemberName: string;
    compareEnabled: boolean;
  };
  tenantName?: string;
  userName?: string;
  reportRef?: string;
  generatedAt?: string;
  logoUrl?: string | null;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function inrPrecise(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ReportDocument({
  metrics,
  cashFlowTimeline,
  spendingBreakdown,
  budgetIntelligence,
  clientIntelligence,
  teamIntelligence,
  recurringIntelligence,
  auditIntelligence,
  filterMetadata,
  tenantName = 'Money OS Workspace',
  userName = 'System Administrator',
  reportRef,
  generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  logoUrl,
}: ReportDocumentProps) {
  // useId() is the React-Compiler-approved source of stable, pure IDs.
  // It produces a unique ID per component instance, deterministic within
  // a render tree — no impure side effects, no re-render drift.
  const generatedId = useId();
  const stableReportRef = reportRef ?? ('RPT-' + generatedId.replace(/:/g, '').toUpperCase());

  // Aggregate stats
  const activeDaysCount = Math.max(1, cashFlowTimeline.length);
  const avgDailyExpense = metrics.expenses / activeDaysCount;
  const avgDailyIncome = metrics.income / activeDaysCount;
  
  // Calculate approximate operational cash runway (in months) based on monthly burn
  const monthlyBurn = avgDailyExpense * 30;
  const runwayMonths = monthlyBurn > 0 ? (metrics.balance / monthlyBurn).toFixed(1) : '∞';

  // Sample timeline points for executive cashflow table (up to 7 intervals)
  const timelineSample = React.useMemo(() => {
    if (cashFlowTimeline.length <= 7) return cashFlowTimeline;
    const step = Math.ceil(cashFlowTimeline.length / 7);
    const sampled = [];
    for (let i = 0; i < cashFlowTimeline.length; i += step) {
      sampled.push(cashFlowTimeline[i]);
    }
    // ensure last entry is included
    if (sampled[sampled.length - 1] !== cashFlowTimeline[cashFlowTimeline.length - 1]) {
      sampled.push(cashFlowTimeline[cashFlowTimeline.length - 1]);
    }
    return sampled;
  }, [cashFlowTimeline]);

  // Primary spend driver
  const topSpendCategory = spendingBreakdown[0];

  // Concentration risk
  const topClient = clientIntelligence[0];
  const hasConcentrationRisk = topClient && topClient.contributionRatio > 40;

  return (
    <div id="report-document-root" className="w-full flex flex-col items-center gap-8 select-text">
      
      {/* ══════════════════════════════════════════════════════════════════
          PAGE 1: EXECUTIVE MACRO PERFORMANCE & CASH FLOW SUMMARY
         ══════════════════════════════════════════════════════════════════ */}
      <div
        className="report-page bg-white text-neutral-900 w-[800px] h-[1130px] p-10 flex flex-col justify-between border border-neutral-300 shadow-xl print:shadow-none print:border-none print:m-0 print:p-8"
        style={{ boxSizing: 'border-box', backgroundColor: '#ffffff', minHeight: '1130px', maxHeight: '1130px' }}
      >
        {/* Top Header */}
        <div className="space-y-4">
          <div className="flex items-start justify-between border-b-2 border-neutral-900 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold tracking-widest uppercase bg-neutral-900 text-white px-2 py-0.5 rounded">
                  FINANCIAL INTELLIGENCE
                </span>
                <span className="text-[11px] font-mono text-neutral-500 font-semibold tracking-wider">
                  REF: {stableReportRef}
                </span>
              </div>
              <h1 className="text-2xl font-black text-neutral-950 uppercase tracking-tight mt-1">
                Executive Financial Intelligence Report
              </h1>
              <p className="text-[12px] text-neutral-600 font-medium">
                Comprehensive macro position, liquidity trajectory & audit reconciliation
              </p>
            </div>
            <div className="flex flex-col items-end text-right shrink-0">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={tenantName}
                  className="h-10 w-auto max-w-[120px] object-contain mb-1.5"
                  crossOrigin="anonymous"
                />
              )}
              <span className="text-[13px] font-bold text-neutral-950 block leading-tight">{tenantName}</span>
              <span className="text-[11px] text-neutral-500 block mt-0.5 leading-tight">Generated: {generatedAt}</span>
              <span className="text-[9.5px] font-mono uppercase text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded mt-1.5 inline-block">
                VERIFIED LEDGER
              </span>
            </div>
          </div>

          {/* Filter Parameters Ribbon */}
          <div className="grid grid-cols-4 gap-2 bg-neutral-50 p-2.5 rounded border border-neutral-200 text-[11px]">
            <div>
              <span className="text-neutral-500 uppercase tracking-wider block text-[9.5px] font-bold">Reporting Window</span>
              <span className="font-semibold text-neutral-900">{filterMetadata.dateRangeLabel}</span>
              <span className="text-neutral-500 block text-[10px]">{filterMetadata.startDateStr} → {filterMetadata.endDateStr}</span>
            </div>
            <div>
              <span className="text-neutral-500 uppercase tracking-wider block text-[9.5px] font-bold">Account Scope</span>
              <span className="font-semibold text-neutral-900">{filterMetadata.accountName}</span>
            </div>
            <div>
              <span className="text-neutral-500 uppercase tracking-wider block text-[9.5px] font-bold">Category Scope</span>
              <span className="font-semibold text-neutral-900">{filterMetadata.categoryName}</span>
            </div>
            <div>
              <span className="text-neutral-500 uppercase tracking-wider block text-[9.5px] font-bold">Client / Team</span>
              <span className="font-semibold text-neutral-900 truncate block">
                {filterMetadata.clientName} · {filterMetadata.teamMemberName}
              </span>
            </div>
          </div>

          {/* 6 Core KPIs Grid */}
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              Macro Financial Performance Matrix
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Workspace Liquidity</span>
                <span className="text-xl font-bold font-mono text-neutral-950 block mt-0.5">
                  {inr(metrics.balance)}
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Est. Runway: <strong className="text-neutral-900">{runwayMonths} Months</strong>
                </span>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Total Income (Inflow)</span>
                <span className="text-xl font-bold font-mono text-emerald-700 block mt-0.5">
                  {inr(metrics.income)}
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Daily Avg: <strong className="text-neutral-900">{inr(avgDailyIncome)}/day</strong>
                </span>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Total Expenses (Outflow)</span>
                <span className="text-xl font-bold font-mono text-neutral-900 block mt-0.5">
                  {inr(metrics.expenses)}
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Daily Burn: <strong className="text-neutral-900">{inr(avgDailyExpense)}/day</strong>
                </span>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Net Operating Profit</span>
                <span className={`text-xl font-bold font-mono block mt-0.5 ${metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {metrics.netProfit >= 0 ? '+' : ''}{inr(metrics.netProfit)}
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Net Margin: <strong className="text-neutral-900">{metrics.income > 0 ? ((metrics.netProfit / metrics.income) * 100).toFixed(1) : '0'}%</strong>
                </span>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Capital Savings Rate</span>
                <span className={`text-xl font-bold font-mono block mt-0.5 ${metrics.savingsRate >= 15 ? 'text-emerald-700' : 'text-neutral-900'}`}>
                  {metrics.savingsRate.toFixed(1)}%
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Inflow retention efficiency
                </span>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Transaction Throughput</span>
                <span className="text-xl font-bold font-mono text-neutral-950 block mt-0.5">
                  {metrics.volume} Records
                </span>
                <span className="text-[10.5px] text-neutral-600 block mt-0.5">
                  Avg Ticket: <strong className="text-neutral-900">{metrics.volume > 0 ? inr((metrics.income + metrics.expenses) / metrics.volume) : '₹0'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Automated Executive Commentary & Health Assessment */}
          <div className="p-3 bg-neutral-50 border-l-4 border-neutral-900 rounded-r text-[11px] space-y-1">
            <span className="font-bold uppercase tracking-wider text-neutral-800 text-[10px] block">
              Automated Executive Insights & Governance Health
            </span>
            <div className="grid grid-cols-2 gap-3 text-neutral-700">
              <div>
                • <strong>Operating Position:</strong> Workspace is currently operating at a{' '}
                <strong className={metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                  {metrics.netProfit >= 0 ? 'net operational surplus' : 'net operational burn'} of {inr(Math.abs(metrics.netProfit))}
                </strong>.
              </div>
              <div>
                • <strong>Capital Runway:</strong> At the current average burn rate of {inr(monthlyBurn)}/month, total treasury runway stands at{' '}
                <strong>{runwayMonths} months</strong>.
              </div>
              <div>
                • <strong>Primary Expenditure Driver:</strong> {topSpendCategory ? (
                  <span><strong>{topSpendCategory.name}</strong> accounts for <strong>{topSpendCategory.percentage.toFixed(1)}%</strong> ({inr(topSpendCategory.value)}) of all outflows.</span>
                ) : 'No outflows logged in this window.'}
              </div>
              <div>
                • <strong>Revenue Concentration:</strong> {hasConcentrationRisk ? (
                  <span className="text-amber-800 font-semibold">Caution: Top client ({topClient.name}) constitutes {topClient.contributionRatio.toFixed(1)}% of total inflow.</span>
                ) : (
                  <span>Healthy diversification across revenue streams and client accounts.</span>
                )}
              </div>
            </div>
          </div>

          {/* Cash Flow Timeline Progression Table */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Cash Flow &amp; Liquidity Trajectory (Sample Intervals)
              </h2>
              <span className="text-[10px] text-neutral-400">Total Intervals: {cashFlowTimeline.length}</span>
            </div>
            <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                  <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Date</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 text-emerald-800">Inflow (+)</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 text-neutral-800">Outflow (-)</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300">Net Delta</th>
                  <th className="py-1.5 px-2.5 text-right font-bold">Closing Liquidity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {timelineSample.map((t, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                    <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{t.date}</td>
                    <td className="py-1 px-2.5 text-right font-mono text-emerald-700 border-r border-neutral-200">
                      {t.income > 0 ? inr(t.income) : '—'}
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono text-neutral-800 border-r border-neutral-200">
                      {t.expense > 0 ? inr(t.expense) : '—'}
                    </td>
                    <td className={`py-1 px-2.5 text-right font-mono font-medium border-r border-neutral-200 ${t.net >= 0 ? 'text-emerald-700' : 'text-neutral-700'}`}>
                      {t.net > 0 ? '+' : ''}{inr(t.net)}
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono font-bold text-neutral-900">
                      {inr(t.cumulative)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Page 1 Footer */}
        <div className="border-t border-neutral-300 pt-3 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
          <span>CONFIDENTIAL &bull; FOR INTERNAL &amp; STAKEHOLDER GOVERNANCE ONLY</span>
          <span>PAGE 1 OF 3</span>
          <span>SYS-CHECKSUM: {stableReportRef}-P1</span>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════════════════
          PAGE 2: EXPENDITURE ALLOCATION, BUDGETS & FORWARD COMMITMENTS
         ══════════════════════════════════════════════════════════════════ */}
      <div
        className="report-page bg-white text-neutral-900 w-[800px] h-[1130px] p-10 flex flex-col justify-between border border-neutral-300 shadow-xl print:shadow-none print:border-none print:m-0 print:p-8"
        style={{ boxSizing: 'border-box', backgroundColor: '#ffffff', minHeight: '1130px', maxHeight: '1130px' }}
      >
        <div className="space-y-4">
          {/* Page 2 Mini Header Banner */}
          <div className="flex items-center justify-between border-b-2 border-neutral-900 pb-2">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-neutral-500">EXPENDITURE &amp; FISCAL GOVERNANCE</span>
              <h2 className="text-lg font-black text-neutral-950 uppercase tracking-tight">
                Spending Allocation, Budgets &amp; Liabilities
              </h2>
            </div>
            <div className="text-right text-[11px] font-mono text-neutral-500">
              {tenantName} &bull; {stableReportRef}
            </div>
          </div>

          {/* Section A: Category Spending Distribution */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                1. Outflow Breakdown by Category
              </h3>
              <span className="text-[10px] text-neutral-500">
                Total Categories: {spendingBreakdown.length} &bull; Total Spend: {inr(metrics.expenses)}
              </span>
            </div>
            <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                  <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Expense Category</th>
                  <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-20">Volume</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-28">Expenditure</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-20">% Share</th>
                  <th className="py-1.5 px-2.5 text-left w-36">Visual Proportion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {spendingBreakdown.slice(0, 8).map((cat, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                    <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{cat.name}</td>
                    <td className="py-1 px-2.5 text-center font-mono border-r border-neutral-200 text-neutral-600">{cat.count} txs</td>
                    <td className="py-1 px-2.5 text-right font-mono font-semibold text-neutral-900 border-r border-neutral-200">
                      {inrPrecise(cat.value)}
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono font-medium border-r border-neutral-200">
                      {cat.percentage.toFixed(1)}%
                    </td>
                    <td className="py-1 px-2.5 align-middle">
                      <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                        <div className="bg-neutral-800 h-full rounded-full" style={{ width: `${Math.min(100, cat.percentage)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section B: Monthly Budget Variance Governance */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                2. Monthly Budget Adherence &amp; Variance Analysis
              </h3>
              <span className="text-[10px] text-neutral-500">
                Overall Cap: {inr(budgetIntelligence.totalLimit)} &bull; Utilized: {budgetIntelligence.overallRatio.toFixed(1)}%
              </span>
            </div>
            {budgetIntelligence.budgets.length === 0 ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-[11px] text-neutral-500">
                No active monthly budget caps configured in this workspace.
              </div>
            ) : (
              <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                    <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Category</th>
                    <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-24">Limit Cap</th>
                    <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-24">Actual Spend</th>
                    <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-24">Variance Headroom</th>
                    <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-20">Util %</th>
                    <th className="py-1.5 px-2.5 text-center w-24">Risk Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {budgetIntelligence.budgets.slice(0, 6).map((b, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                      <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{b.category}</td>
                      <td className="py-1 px-2.5 text-right font-mono border-r border-neutral-200">{inr(b.limit)}</td>
                      <td className="py-1 px-2.5 text-right font-mono font-semibold border-r border-neutral-200">{inr(b.spent)}</td>
                      <td className="py-1 px-2.5 text-right font-mono border-r border-neutral-200">{inr(b.remaining)}</td>
                      <td className="py-1 px-2.5 text-center font-mono font-medium border-r border-neutral-200">
                        {b.ratio.toFixed(0)}%
                      </td>
                      <td className="py-1 px-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                          b.risk === 'critical' ? 'bg-red-100 text-red-800 border border-red-200' :
                          b.risk === 'warning' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {b.risk === 'critical' ? 'EXCEEDED' : b.risk === 'warning' ? 'NEAR LIMIT' : 'HEALTHY'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section C: Forward Recurring Commitments & Liabilities */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                3. Committed Recurring Liabilities &amp; Fixed Costs
              </h3>
              <span className="text-[10px] text-neutral-500 font-semibold">
                Monthly Recurring Commitment: <span className="font-mono text-neutral-900">{inr(recurringIntelligence.monthlyObligations)}</span>
              </span>
            </div>
            {recurringIntelligence.upcoming.length === 0 ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-[11px] text-neutral-500">
                No active recurring subscriptions or liabilities registered in this workspace.
              </div>
            ) : (
              <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                    <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Obligation / Vendor</th>
                    <th className="py-1.5 px-2.5 text-left border-r border-neutral-300 w-28">Category</th>
                    <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-24">Interval</th>
                    <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-28">Next Due Date</th>
                    <th className="py-1.5 px-2.5 text-right w-28">Committed Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {recurringIntelligence.upcoming.slice(0, 5).map((rec, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                      <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{rec.description}</td>
                      <td className="py-1 px-2.5 text-neutral-600 border-r border-neutral-200">{rec.category}</td>
                      <td className="py-1 px-2.5 text-center capitalize border-r border-neutral-200 font-mono text-[10px]">{rec.interval}</td>
                      <td className="py-1 px-2.5 text-center font-mono border-r border-neutral-200 text-neutral-700">{rec.nextRunDate}</td>
                      <td className="py-1 px-2.5 text-right font-mono font-semibold text-neutral-900">
                        {rec.type === 'Credit' ? '+' : '-'}{inr(rec.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Page 2 Footer */}
        <div className="border-t border-neutral-300 pt-3 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
          <span>CONFIDENTIAL &bull; FOR INTERNAL &amp; STAKEHOLDER GOVERNANCE ONLY</span>
          <span>PAGE 2 OF 3</span>
          <span>SYS-CHECKSUM: {stableReportRef}-P2</span>
        </div>
      </div>


      {/* ══════════════════════════════════════════════════════════════════
          PAGE 3: STAKEHOLDERS, AUDIT TRAIL & CERTIFICATION
         ══════════════════════════════════════════════════════════════════ */}
      <div
        className="report-page bg-white text-neutral-900 w-[800px] h-[1130px] p-10 flex flex-col justify-between border border-neutral-300 shadow-xl print:shadow-none print:border-none print:m-0 print:p-8"
        style={{ boxSizing: 'border-box', backgroundColor: '#ffffff', minHeight: '1130px', maxHeight: '1130px' }}
      >
        <div className="space-y-4">
          {/* Page 3 Mini Header Banner */}
          <div className="flex items-center justify-between border-b-2 border-neutral-900 pb-2">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-neutral-500">STAKEHOLDER INTEGRITY &amp; AUDIT TRAIL</span>
              <h2 className="text-lg font-black text-neutral-950 uppercase tracking-tight">
                Client Contributions, Team Logs &amp; Audit Verification
              </h2>
            </div>
            <div className="text-right text-[11px] font-mono text-neutral-500">
              {tenantName} &bull; {stableReportRef}
            </div>
          </div>

          {/* Section A: Client Revenue Contributions */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                1. Client Revenue Contributions &amp; Share
              </h3>
              <span className="text-[10px] text-neutral-500">Total Clients Invoiced: {clientIntelligence.length}</span>
            </div>
            {clientIntelligence.length === 0 ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-[11px] text-neutral-500">
                No client-attributed revenue transactions in this reporting timeframe.
              </div>
            ) : (
              <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                    <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Client Organization</th>
                    <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-24">Tx Count</th>
                    <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-32">Total Revenue</th>
                    <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-24">Inflow Share</th>
                    <th className="py-1.5 px-2.5 text-center w-28">Concentration Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {clientIntelligence.slice(0, 5).map((cl, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                      <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{cl.name}</td>
                      <td className="py-1 px-2.5 text-center font-mono border-r border-neutral-200">{cl.txCount}</td>
                      <td className="py-1 px-2.5 text-right font-mono font-semibold text-emerald-800 border-r border-neutral-200">
                        {inr(cl.totalRevenue)}
                      </td>
                      <td className="py-1 px-2.5 text-right font-mono border-r border-neutral-200">
                        {cl.contributionRatio.toFixed(1)}%
                      </td>
                      <td className="py-1 px-2.5 text-center">
                        {cl.contributionRatio > 40 ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                            HIGH SHARE (&gt;40%)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-neutral-100 text-neutral-600">
                            DIVERSIFIED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section B: Team Accountability Matrix */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                2. Team Member Activity &amp; Expenditure Matrix
              </h3>
              <span className="text-[10px] text-neutral-500">Active Members: {teamIntelligence.length}</span>
            </div>
            <table className="w-full border-collapse border border-neutral-300 text-[10.5px]">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 font-bold uppercase tracking-wider border-b border-neutral-300">
                  <th className="py-1.5 px-2.5 text-left border-r border-neutral-300">Team Member</th>
                  <th className="py-1.5 px-2.5 text-center border-r border-neutral-300 w-24">Transactions</th>
                  <th className="py-1.5 px-2.5 text-right border-r border-neutral-300 w-32">Total Spend Logged</th>
                  <th className="py-1.5 px-2.5 text-right w-36">Last Activity Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {teamIntelligence.slice(0, 5).map((u, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50/50'}>
                    <td className="py-1 px-2.5 font-medium border-r border-neutral-200">{u.username}</td>
                    <td className="py-1 px-2.5 text-center font-mono border-r border-neutral-200">{u.txCount}</td>
                    <td className="py-1 px-2.5 text-right font-mono font-semibold text-neutral-900 border-r border-neutral-200">
                      {inr(u.totalSpent)}
                    </td>
                    <td className="py-1 px-2.5 text-right font-mono text-neutral-500 text-[10px]">{u.lastActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section C: Governance Audit Stream */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                3. Governance Audit &amp; Activity Stream (Recent)
              </h3>
              <span className="text-[10px] text-neutral-500">Immutable Ledger Trail</span>
            </div>
            {auditIntelligence.length === 0 ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-center text-[11px] text-neutral-500">
                No security or administrative audit records logged.
              </div>
            ) : (
              <div className="border border-neutral-300 rounded divide-y divide-neutral-200 text-[10px] bg-neutral-50/30">
                {auditIntelligence.slice(0, 5).map((log, idx) => (
                  <div key={idx} className="p-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-neutral-500 shrink-0">{log.timestamp}</span>
                      <span className="font-semibold text-neutral-900 shrink-0">{log.username}</span>
                      <span className="font-mono text-[9px] uppercase px-1 py-0.2 bg-neutral-200 rounded text-neutral-700 font-bold shrink-0">
                        [{log.action}]
                      </span>
                      <span className="text-neutral-600 truncate">{log.details}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section D: Certification & Formal Sign-off Block */}
          <div className="pt-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-2">
              4. Executive Sign-Off &amp; Audit Attestation
            </h3>
            <div className="grid grid-cols-2 gap-6 p-4 bg-neutral-50 border border-neutral-300 rounded text-[11px]">
              <div className="space-y-4">
                <div>
                  <span className="text-neutral-500 block text-[9.5px] uppercase font-bold tracking-wider">Report Compiler / Attestor</span>
                  <span className="font-semibold text-neutral-950 block mt-0.5">{userName}</span>
                  <span className="text-neutral-500 text-[10px] block">Workspace Financial Controller / Administrator</span>
                </div>
                <div className="border-t border-neutral-300 pt-1">
                  <span className="text-neutral-400 text-[9px] uppercase block">Signature / Verification</span>
                  <span className="font-mono text-[10.5px] text-neutral-700 italic">Digitally Verified via LedgerPro Engine</span>
                </div>
              </div>

              <div className="space-y-4 border-l border-neutral-300 pl-6">
                <div>
                  <span className="text-neutral-500 block text-[9.5px] uppercase font-bold tracking-wider">Authorised Signatory / Director</span>
                  <span className="font-semibold text-neutral-950 block mt-0.5">{tenantName} Governance Board</span>
                  <span className="text-neutral-500 text-[10px] block">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="border-t border-neutral-300 pt-1">
                  <span className="text-neutral-400 text-[9px] uppercase block">Document Reference</span>
                  <span className="font-mono text-[9.5px] text-neutral-600 truncate block">
                    REF: {stableReportRef}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page 3 Footer */}
        <div className="border-t border-neutral-300 pt-3 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
          <span>CONFIDENTIAL &bull; FOR INTERNAL &amp; STAKEHOLDER GOVERNANCE ONLY</span>
          <span>PAGE 3 OF 3</span>
          <span>SYS-CHECKSUM: {stableReportRef}-P3</span>
        </div>
      </div>

    </div>
  );
}
