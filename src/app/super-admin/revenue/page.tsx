"use client";

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Users, Activity } from 'lucide-react';

export default function RevenuePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await fetch('/api/super-admin/revenue');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch revenue", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRevenue();
  }, []);

  if (loading) {
     return <div className="p-6 text-neutral-500 text-[13px]">Loading revenue intelligence...</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500 bg-[#000000]">
      
      {/* Header Section */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Revenue Intelligence</h1>
          <p className="text-[13px] text-neutral-400">Platform-wide MRR, net retention, and growth cohorts.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        
        {/* MRR Hero */}
        <div className="p-8 rounded-xl border border-white/[0.05] bg-[#0a0a0a] relative overflow-hidden flex flex-col justify-center items-center text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-50" />
          
          <div className="relative z-10 flex flex-col items-center">
            <span className="text-[13px] font-medium uppercase tracking-widest text-neutral-400 mb-2">Total Monthly Recurring Revenue</span>
            <div className="text-6xl font-bold tracking-tighter text-white tabular-nums">${data?.mrr?.toLocaleString() || 0}</div>
            <div className="flex items-center gap-2 mt-4 text-[14px]">
              <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded font-medium"><TrendingUp className="w-4 h-4" /> +14.2%</span>
              <span className="text-neutral-500">vs last month</span>
            </div>
          </div>
        </div>

        {/* Core Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col">
            <span className="text-[12px] font-medium uppercase tracking-widest text-neutral-500 mb-4">Net Retention</span>
            <div className="text-3xl font-semibold text-white tracking-tight tabular-nums mb-1">{data?.netRetention || 0}%</div>
            <p className="text-[12px] text-neutral-400">Expansion outpaces churn by +4.2%</p>
          </div>
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col">
            <span className="text-[12px] font-medium uppercase tracking-widest text-neutral-500 mb-4">Avg Rev Per Account</span>
            <div className="text-3xl font-semibold text-white tracking-tight tabular-nums mb-1">${data?.arpa?.toLocaleString() || 0}</div>
            <p className="text-[12px] text-neutral-400">Across all paid tiers</p>
          </div>
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col">
            <span className="text-[12px] font-medium uppercase tracking-widest text-neutral-500 mb-4">Logo Churn Rate</span>
            <div className="text-3xl font-semibold text-white tracking-tight tabular-nums mb-1">{data?.churnRate || 0}%</div>
            <p className="text-[12px] text-emerald-500">Below industry standard of 2.5%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
             <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-6">Plan Distribution</h2>
             <div className="space-y-4">
               {data?.planDistribution && Object.keys(data.planDistribution).map((plan) => (
                 <div key={plan}>
                   <div className="flex justify-between text-[13px] text-neutral-300 mb-2">
                     <span>{plan}</span>
                     <span className="font-mono">{data.planDistribution[plan]}</span>
                   </div>
                   <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(data.planDistribution[plan] / (Object.values(data.planDistribution) as number[]).reduce((a, b) => a + b, 0)) * 100}%` }} />
                   </div>
                 </div>
               ))}
             </div>
           </div>
        </div>

      </div>

    </div>
  );
}
