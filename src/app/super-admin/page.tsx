"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, ArrowUpRight, ArrowDownRight, Database, Users, Building, ShieldCheck } from 'lucide-react';

export default function MissionControlPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // Simulate fetching complex platform metrics
    setTimeout(() => {
      setData({
        mrr: 124500,
        mrrGrowth: 14.2,
        activeOrgs: 842,
        orgGrowth: 8.5,
        totalUsers: 14205,
        userGrowth: 12.1,
        uptime: 99.99,
        liveEvents: [
          { type: 'signup', msg: 'New organization provisioned (Acme Corp)', time: '2m ago' },
          { type: 'payment', msg: '$499 Expansion MRR (Stark Industries)', time: '14m ago' },
          { type: 'alert', msg: 'Failed login spike detected in EU-West', time: '28m ago', isAlert: true },
          { type: 'signup', msg: 'New user joined (Wayne Ent.)', time: '1h ago' },
        ]
      });
      setLoading(false);
    }, 800);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-6 h-6 text-neutral-500 animate-spin" />
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Mission Control</h1>
          <p className="text-[14px] text-neutral-400 mt-1">Global platform overview and live metrics.</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[12px] font-medium text-emerald-500 uppercase tracking-widest">All Systems Operational</span>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* MRR */}
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Total MRR</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">{formatCurrency(data.mrr)}</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+{data.mrrGrowth}%</span>
            <span className="text-[12px] text-neutral-500">vs last month</span>
          </div>
        </div>

        {/* Organizations */}
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Active Orgs</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">{data.activeOrgs.toLocaleString()}</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+{data.orgGrowth}%</span>
            <span className="text-[12px] text-neutral-500">vs last month</span>
          </div>
        </div>

        {/* Users */}
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] shadow-sm flex flex-col">
          <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Global Users</div>
          <div className="text-3xl font-semibold tracking-tight text-white tabular-nums mb-3">{data.totalUsers.toLocaleString()}</div>
          <div className="flex items-center gap-1.5 mt-auto">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-500">+{data.userGrowth}%</span>
            <span className="text-[12px] text-neutral-500">vs last month</span>
          </div>
        </div>

        {/* Uptime */}
        <div className="p-5 rounded-xl border border-emerald-500/20 bg-[#0a0a0a] shadow-sm flex flex-col">
           <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Edge Uptime</div>
           <div className="text-3xl font-semibold tracking-tight text-emerald-400 tabular-nums mb-3">{data.uptime}%</div>
           <div className="flex items-center gap-1.5 mt-auto">
            <ShieldCheck className="w-4 h-4 text-neutral-500" />
            <span className="text-[12px] text-neutral-500">Maintained across 14 regions</span>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Live Event Stream */}
        <div className="lg:col-span-2">
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Live Platform Activity</h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden">
             {data.liveEvents.map((event: any, i: number) => (
               <div key={i} className={`px-5 py-4 border-b border-white/[0.05] last:border-0 flex items-start gap-4 hover:bg-white/[0.02] transition-colors ${event.isAlert ? 'bg-rose-500/5' : ''}`}>
                 <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${event.isAlert ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-neutral-600'}`} />
                 <div className="flex-1">
                   <p className={`text-[14px] font-medium ${event.isAlert ? 'text-rose-400' : 'text-neutral-200'}`}>{event.msg}</p>
                   <p className="text-[12px] text-neutral-500 mt-1">{event.time}</p>
                 </div>
               </div>
             ))}
             <div className="px-5 py-3 border-t border-white/[0.05] bg-white/[0.01]">
               <button className="text-[12px] font-medium text-neutral-400 hover:text-white transition-colors">View full audit log →</button>
             </div>
           </div>
        </div>

        {/* Right Column: Infrastructure Health */}
        <div>
          <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Infrastructure Health</h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 space-y-5">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-neutral-400" />
                  <span className="text-[13px] font-medium text-neutral-200">MongoDB Atlas Cluster</span>
                </div>
                <span className="text-[12px] font-mono text-emerald-400">14ms</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-neutral-400" />
                  <span className="text-[13px] font-medium text-neutral-200">Vercel Edge Network</span>
                </div>
                <span className="text-[12px] font-mono text-emerald-400">8ms</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building className="w-4 h-4 text-neutral-400" />
                  <span className="text-[13px] font-medium text-neutral-200">Tenant Provisioning Worker</span>
                </div>
                <span className="text-[12px] font-mono text-emerald-400">Idle</span>
              </div>

           </div>
        </div>
      </div>

    </div>
  );
}
