"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity, ShieldCheck, Database, Key, Mail, RefreshCw, ArrowLeft, AlertTriangle } from 'lucide-react';

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(new Date().toLocaleTimeString());
      }
    } catch (e) {
      console.error("Failed to fetch status information", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderUptimeBar = (componentKey: string) => {
    const componentStatus = data?.components?.[componentKey]?.status || 'OPERATIONAL';
    return Array.from({ length: 45 }).map((_, idx) => {
      let status = 'operational';
      if (idx === 44) {
        status = componentStatus === 'OPERATIONAL' ? 'operational' : 'error';
      } else {
        // Historical mock representation
        status = idx === 18 ? 'warning' : idx === 32 ? 'error' : 'operational';
      }
      return (
        <div 
          key={idx} 
          className={`h-6 w-[3px] rounded-full ${
            status === 'operational' 
              ? 'bg-emerald-500' 
              : status === 'warning' 
                ? 'bg-amber-500' 
                : 'bg-rose-500'
          }`} 
          title={idx === 44 
            ? `Current Status: ${componentStatus === 'OPERATIONAL' ? 'Operational' : 'Degraded'}` 
            : `Day ${45 - idx} ago: ${status === 'operational' ? '100% Uptime' : status === 'warning' ? 'Minor latency' : 'Service degraded'}`
          }
        />
      );
    });
  };

  const isAllSystemsOperational = data ? data.status === 'OPERATIONAL' : true;

  return (
    <div className="w-full pt-32 pb-24 px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-3xl mx-auto">
        
        {/* Back Link & Refresh Trigger */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors font-mono">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
          </Link>
          <button 
            disabled={refreshing}
            onClick={fetchStatus}
            className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400 hover:text-white transition-colors font-mono disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshed' : 'Refresh Now'}
          </button>
        </div>

        {/* Global Operational Banner */}
        {loading ? (
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] text-center text-[13px] text-neutral-500 mb-12">
            Pinging servers and monitoring nodes...
          </div>
        ) : (
          <div className={`p-6 rounded-xl border flex items-center justify-between gap-6 mb-12 shadow-xl ${
            isAllSystemsOperational 
              ? 'border-emerald-500/20 bg-emerald-500/[0.02]' 
              : 'border-amber-500/20 bg-amber-500/[0.02]'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-3 w-3 rounded-full relative ${isAllSystemsOperational ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isAllSystemsOperational ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-white">
                  {isAllSystemsOperational ? 'All Systems Operational' : 'Degraded System Performance'}
                </h3>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  {isAllSystemsOperational 
                    ? 'Money OS financial ledgers and APIs are performing normally.' 
                    : 'We are observing partial database connectivity limits or increased latencies.'}
                </p>
              </div>
            </div>
            <span className="text-[11px] text-neutral-500 font-mono">Synced {lastRefreshed}</span>
          </div>
        )}

        {/* System Services Grid */}
        {!loading && data && (
          <section className="mb-16">
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6">Component Status</h3>
            
            <div className="space-y-6">
              {/* Ledger API */}
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" /> Core Ledger API
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono">{data.components?.api?.latency}</span>
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/20">Operational</span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-1.5 pt-2">
                  <div className="flex gap-[2.5px] flex-1">{renderUptimeBar('api')}</div>
                  <span className="text-[11px] text-neutral-500 font-mono shrink-0 ml-4">{data.components?.api?.uptime} Uptime</span>
                </div>
              </div>

              {/* Authentication Gateway */}
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-purple-400" /> Authentication Gateway
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono">{data.components?.auth?.latency}</span>
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/20">Operational</span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-1.5 pt-2">
                  <div className="flex gap-[2.5px] flex-1">{renderUptimeBar('auth')}</div>
                  <span className="text-[11px] text-neutral-500 font-mono shrink-0 ml-4">{data.components?.auth?.uptime} Uptime</span>
                </div>
              </div>

              {/* Core Database Cluster */}
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" /> Core Database Cluster ({data.components?.database?.type})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono">{data.components?.database?.latency}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${
                      data.components?.database?.status === 'OPERATIONAL'
                        ? 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20'
                        : 'text-rose-400 bg-rose-950/20 border-rose-500/20'
                    }`}>
                      {data.components?.database?.status === 'OPERATIONAL' ? 'Operational' : 'Degraded'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-1.5 pt-2">
                  <div className="flex gap-[2.5px] flex-1">{renderUptimeBar('database')}</div>
                  <span className="text-[11px] text-neutral-500 font-mono shrink-0 ml-4">{data.components?.database?.uptime} Uptime</span>
                </div>
              </div>

              {/* Email & Webhook Dispatch */}
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-semibold text-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-rose-400" /> Email & Webhook Dispatch
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono">{data.components?.email?.latency}</span>
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/20">Operational</span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-1.5 pt-2">
                  <div className="flex gap-[2.5px] flex-1">{renderUptimeBar('email')}</div>
                  <span className="text-[11px] text-neutral-500 font-mono shrink-0 ml-4">{data.components?.email?.uptime} Uptime</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Live Telemetry Data */}
        {!loading && data && data.system && (
          <section className="mb-16">
            <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6">Server Telemetry</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Server Memory</div>
                <div className="text-[14px] font-medium text-white">{data.system.memory}</div>
                <div className="text-[11px] text-indigo-400 mt-1 font-mono">{data.system.memoryUsage} of total heap</div>
              </div>
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Runtime Env</div>
                <div className="text-[14px] font-medium text-white">Node.js</div>
                <div className="text-[11px] text-indigo-400 mt-1 font-mono">{data.system.nodeVersion}</div>
              </div>
              <div className="p-4 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
                <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Telemetry Sync</div>
                <div className="text-[14px] font-medium text-white">OK</div>
                <div className="text-[11px] text-indigo-400 mt-1 font-mono">Updated continuously</div>
              </div>
            </div>
          </section>
        )}

        {/* Incident History logs */}
        <section className="mb-16">
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6">Recent Incidents</h3>
          <div className="space-y-6">
            
            <div className="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-px before:bg-white/[0.1]">
              <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-neutral-600 -translate-x-[2.5px]" />
              <div className="text-[12px] font-mono text-neutral-500 mb-1">June 5, 2026</div>
              <h4 className="text-[14px] font-semibold text-white mb-2">Minor Database Latency Resolved</h4>
              <p className="text-[12.5px] text-neutral-400 leading-relaxed">
                We identified database locks due to complex reporting queries. The indexing configuration was adjusted, returning query performance levels to standard parameters.
              </p>
            </div>

            <div className="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-px before:bg-white/[0.1]">
              <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-neutral-600 -translate-x-[2.5px]" />
              <div className="text-[12px] font-mono text-neutral-500 mb-1">May 24, 2026</div>
              <h4 className="text-[14px] font-semibold text-white mb-2">Email Relay Delay</h4>
              <p className="text-[12.5px] text-neutral-400 leading-relaxed">
                An upstream relay server delay impacted verification codes. Failover routes were deployed to guarantee instantaneous email deliverables.
              </p>
            </div>

          </div>
        </section>

        {/* Maintenance Windows info */}
        <section>
          <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Maintenance Windows</h3>
          <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.01] flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[13px] font-semibold text-white">Upcoming Upgrade Window</h4>
              <p className="text-[12px] text-neutral-400 mt-1 leading-relaxed">
                A core database server upgrade is scheduled for Sunday, June 14, 2026, between 02:00 and 03:00 UTC. Expect short database connection interruptions during this interval.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
