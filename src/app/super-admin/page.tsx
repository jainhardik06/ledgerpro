"use client";

import React, { useState, useEffect } from 'react';
import { Shield, Activity, Users, Globe2, Building2, TrendingUp, AlertTriangle } from 'lucide-react';

export default function SuperAdminOverview() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/super-admin/analytics');
        if (res.ok) {
          const data = await res.json();
          setAnalytics(data);
        }
      } catch (e) {
        console.error("Failed to fetch analytics", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500 bg-[#000000]">
      
      {/* Header Section */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Mission Control</h1>
          <p className="text-[13px] text-neutral-400">Platform-wide operational telemetry and analytics.</p>
        </div>
        <div className="flex items-center gap-4">
           {loading ? (
             <div className="flex items-center gap-2 text-[12px] font-mono font-medium px-3 py-1.5 rounded-full border border-white/[0.05] bg-white/[0.02] text-neutral-500">
               <div className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse" />
               Checking...
             </div>
           ) : (analytics?.failedLogins ?? 0) > 0 ? (
             <div className="flex items-center gap-2 text-[12px] font-mono font-medium px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-500">
               <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
               {analytics.failedLogins} Anomal{analytics.failedLogins === 1 ? 'y' : 'ies'} Detected
             </div>
           ) : (
             <div className="flex items-center gap-2 text-[12px] font-mono font-medium px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               All Systems Nominal
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        
        {/* Top KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:border-white/[0.1] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors" />
            <div className="flex items-center gap-2 mb-4 text-neutral-400">
              <Building2 className="w-4 h-4" />
              <span className="text-[12px] font-medium uppercase tracking-widest">Active Orgs</span>
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-tight text-white mb-1 tabular-nums">{loading ? '--' : analytics?.totalTenants?.toLocaleString() || 0}</div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:border-white/[0.1] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
            <div className="flex items-center gap-2 mb-4 text-neutral-400">
              <Users className="w-4 h-4" />
              <span className="text-[12px] font-medium uppercase tracking-widest">Total Users</span>
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-tight text-white mb-1 tabular-nums">{loading ? '--' : analytics?.totalUsers?.toLocaleString() || 0}</div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:border-white/[0.1] transition-colors relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-colors" />
            <div className="flex items-center gap-2 mb-4 text-neutral-400">
              <TrendingUp className="w-4 h-4" />
              <span className="text-[12px] font-medium uppercase tracking-widest">Transactions</span>
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-tight text-white mb-1 tabular-nums">{loading ? '--' : analytics?.totalTransactions?.toLocaleString() || 0}</div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:border-white/[0.1] transition-colors relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl group-hover:bg-rose-500/10 transition-colors" />
             <div className="flex items-center gap-2 mb-4 text-neutral-400">
               <AlertTriangle className="w-4 h-4" />
               <span className="text-[12px] font-medium uppercase tracking-widest">Anomalies</span>
             </div>
             <div>
               <div className="text-3xl font-semibold tracking-tight text-white mb-1 tabular-nums">{loading ? '--' : analytics?.failedLogins?.toLocaleString() || 0}</div>
               <div className="text-[12px] text-rose-500 font-medium">Failed logins</div>
             </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div>
          <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4 mt-2">Live Platform Activity</h2>
          <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden">
             
             {loading ? (
                <div className="p-4 text-[13px] text-neutral-500">Loading live activity...</div>
             ) : analytics?.recentLogs?.length === 0 ? (
                <div className="p-4 text-[13px] text-neutral-500">No recent activity detected.</div>
             ) : analytics?.recentLogs?.map((event: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-4 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-4">
                     <span className="text-[11px] font-mono text-neutral-500 group-hover:text-neutral-400 transition-colors tabular-nums">{new Date(event.timestamp).toLocaleTimeString()}</span>
                     <span className={`text-[10px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded border ${event.action === 'FAILED_LOGIN' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' : 'border-white/[0.05] bg-white/[0.02] text-neutral-300'}`}>
                       {event.action}
                     </span>
                     <span className="text-[13px] text-white font-medium truncate max-w-sm">{event.details}</span>
                  </div>
                  <span className="text-[12px] font-mono text-neutral-500">{event.username}</span>
                </div>
             ))}

          </div>
        </div>

      </div>

    </div>
  );
}
