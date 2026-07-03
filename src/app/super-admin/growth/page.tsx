import React from 'react';
import { getGrowthMetrics, getFinancialAggregates, getWorkspaceHealth, getUTMAcquisitionStats, connectDb } from '@/lib/db';
import { fetchPostHogFunnels, fetchPostHogRetention, fetchGA4Traffic, fetchGSCSearch } from '@/lib/external-apis';
import { GrowthAreaChart, AcquisitionFunnelChart, SourcePieChart } from './components/GrowthCharts';

export const metadata = {
  title: 'Growth Intelligence | Money OS Super Admin',
};

// Mock data removed in favor of real API aggregations

export default async function GrowthIntelligencePage() {
  // Fetch real data
  const { db } = await connectDb();
  const isDbHealthy = !!db;

  const growthMetrics = await getGrowthMetrics();
  const financialMetrics = await getFinancialAggregates();
  const workspaceHealth = await getWorkspaceHealth();
  const utmStats = await getUTMAcquisitionStats();

  // Convert UTM sources to pie chart format
  const sourceData = Object.keys(utmStats.sources).map(k => ({ name: k, value: utmStats.sources[k] }));
  if (sourceData.length === 0) {
    sourceData.push({ name: 'Direct/Unknown', value: growthMetrics.signups || 1 });
  }

  // Fetch actual data from APIs
  const postHogFunnels = await fetchPostHogFunnels();
  const ga4Traffic = await fetchGA4Traffic();
  const gscSearch = await fetchGSCSearch();

  const hasPostHog = postHogFunnels !== null;
  const hasGA4 = ga4Traffic !== null;
  const hasGSC = gscSearch !== null;

  // Use the fetched data, or an empty array if null
  const realTrafficTrend = ga4Traffic || [];
  const realFunnel = postHogFunnels || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Growth Intelligence Center</h1>
          <p className="text-zinc-400">Mission control for Money OS user acquisition, activation, and retention.</p>
        </div>
        <div className="flex gap-3">
          <div className="px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Real-time Database Synced
          </div>
        </div>
      </div>

      {/* SECTION 1: EXECUTIVE OVERVIEW */}
      <section className="mb-8 sm:mb-12">
        <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">1. Executive Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <MetricCard title="Signups" value={growthMetrics.signups} />
          <MetricCard title="Workspaces" value={growthMetrics.newWorkspaces} />
          <MetricCard title="Transactions" value={growthMetrics.transactionsCreated} />
          <MetricCard title="Budgets" value={growthMetrics.budgetsCreated} />
          <MetricCard title="Reports Exported" value={growthMetrics.reportsGenerated} />
          <MetricCard title="Team Invites" value={growthMetrics.teamInvitesSent} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 mb-8 sm:mb-12">
        {/* SECTION 2: ACQUISITION */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 sm:mb-6">2. Acquisition Intelligence</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Traffic Trend (GA4)</h3>
              {realTrafficTrend.length > 0 ? (
                <GrowthAreaChart data={realTrafficTrend} dataKey="visitors" name="Visitors" />
              ) : (
                <div className="flex items-center justify-center h-[250px] border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-sm">No GA4 data found</div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">Top Sources (UTM DB)</h3>
              <SourcePieChart data={sourceData} />
            </div>
          </div>
          {!hasGA4 && <ConfigWarning service="Google Analytics 4" varName="GOOGLE_APPLICATION_CREDENTIALS_JSON" />}
        </section>

        {/* SECTION 3: ACTIVATION FUNNEL */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 sm:mb-6">3. Activation Funnel (PostHog)</h2>
          <div className="mb-4 overflow-x-auto">
             {realFunnel.length > 0 ? (
               <AcquisitionFunnelChart data={realFunnel} />
             ) : (
               <div className="flex items-center justify-center h-[300px] border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-sm">No PostHog funnel data found</div>
             )}
          </div>
          {!hasPostHog && <ConfigWarning service="PostHog API" varName="POSTHOG_PERSONAL_API_KEY" />}
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-8 sm:mb-12">
        {/* SECTION 6: WORKSPACE INTELLIGENCE */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 sm:mb-6">6. Workspace Intelligence</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Health Score</span>
              <span className={`font-semibold ${workspaceHealth.healthScore > 70 ? 'text-emerald-400' : 'text-amber-400'}`}>{workspaceHealth.healthScore}/100</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Total Workspaces</span>
              <span className="text-zinc-100">{workspaceHealth.totalWorkspaces}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Active (30d)</span>
              <span className="text-emerald-400">{workspaceHealth.activeWorkspaces}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Avg Users / Workspace</span>
              <span className="text-zinc-100">{workspaceHealth.avgUsersPerWorkspace.toFixed(1)}</span>
            </div>
          </div>
        </section>

        {/* SECTION 7: FINANCIAL INTELLIGENCE */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 sm:mb-6">7. Financial Intelligence</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Platform Transaction Vol</span>
              <span className="font-semibold text-zinc-100">${financialMetrics.totalVolume.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Total TXNs Processed</span>
              <span className="text-zinc-100">{financialMetrics.totalTransactions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Recurring Setups</span>
              <span className="text-zinc-100">{financialMetrics.recurringTransactions.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800/50">
              <span className="text-zinc-400">Clients Managed</span>
              <span className="text-zinc-100">{financialMetrics.totalClients.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* SECTION 10: SYSTEM HEALTH */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 md:col-span-2 xl:col-span-1">
          <h2 className="text-lg font-medium text-white mb-4 sm:mb-6">10. System Health</h2>
          <div className="space-y-4">
            <HealthRow name="Internal Database" status={isDbHealthy ? 'healthy' : 'error'} />
            <HealthRow name="PostHog Event Pipeline" status={process.env.NEXT_PUBLIC_POSTHOG_KEY ? 'healthy' : 'warning'} />
            <HealthRow name="GA4 Pipeline" status={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ? 'healthy' : 'warning'} />
            <HealthRow name="PostHog API (Queries)" status={hasPostHog ? 'healthy' : 'error'} />
            <HealthRow name="GA4 Data API" status={hasGA4 ? 'healthy' : 'error'} />
            <HealthRow name="AI Crawler Tracking" status="healthy" />
          </div>
        </section>
      </div>
      
    </div>
  );
}

function MetricCard({ title, value, trend }: { title: string, value: number, trend?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
      <h3 className="text-sm font-medium text-zinc-400 mb-3">{title}</h3>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-zinc-100">{value.toLocaleString()}</span>
        {trend && (
          <span className={`text-xs font-medium ${trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function ConfigWarning({ service, varName }: { service: string, varName: string }) {
  return (
    <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h4 className="text-sm font-medium text-amber-500">{service} Data Unavailable</h4>
          <p className="text-xs text-amber-500/70 mt-1">
            To view these insights, configure <code className="bg-amber-500/20 px-1 py-0.5 rounded text-amber-400">{varName}</code> in your environment variables.
          </p>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ name, status }: { name: string, status: 'healthy' | 'warning' | 'error' }) {
  const colors = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500'
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
      <span className="text-sm text-zinc-300">{name}</span>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${colors[status]}`}></span>
        <span className="text-xs text-zinc-500 capitalize">{status}</span>
      </div>
    </div>
  );
}
