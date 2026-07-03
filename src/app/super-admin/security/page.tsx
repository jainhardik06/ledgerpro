"use client";

import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, MapPin, Search } from 'lucide-react';

export default function SecurityPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSecurity = async () => {
      try {
        const res = await fetch('/api/super-admin/security');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch security metrics", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSecurity();
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Security Operations Center</h1>
          <p className="text-[13px] text-neutral-400">Monitor platform-wide threats, failed logins, and authentication anomalies.</p>
        </div>
      </div>

      <div className="p-6 shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-white/[0.05]">
         {/* Live Threat Map Mock */}
         <div className="col-span-1 md:col-span-2 rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 flex flex-col justify-center items-center relative overflow-hidden h-48">
            <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-center bg-no-repeat bg-contain" />
            <div className="absolute top-1/2 left-1/3 w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            
            <div className="relative z-10 flex flex-col items-center">
              <ShieldAlert className="w-6 h-6 text-rose-500 mb-2" />
              <div className="text-[13px] font-medium text-white">Security Systems Online</div>
              <div className="text-[11px] font-mono text-neutral-400 mt-1">DB: {data?.health?.status || 'Unknown'} | Latency: {data?.health?.ping || 0}ms</div>
            </div>
         </div>

         {/* Stats */}
         <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 flex flex-col justify-between h-48">
           <div>
             <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Threat Level</div>
             {(() => {
               const count = data?.failedLogins?.length || 0;
               const level = count === 0 ? { label: 'NOMINAL', color: 'text-emerald-500' }
                 : count < 10 ? { label: 'GUARDED', color: 'text-amber-500' }
                 : { label: 'ELEVATED', color: 'text-rose-500' };
               return <div className={`text-2xl font-semibold tracking-tight ${level.color}`}>{loading ? '--' : level.label}</div>;
             })()}
           </div>
           <div>
             <div className="flex justify-between text-[12px] text-neutral-400 mb-1">
               <span>Failed Logins (last 100 events)</span>
               <span className="font-mono text-white">{data?.failedLogins?.length || 0}</span>
             </div>
             <div className="flex justify-between text-[12px] text-neutral-400">
               <span>Unique Source IPs</span>
               <span className="font-mono text-white">{new Set((data?.failedLogins || []).map((l: any) => l.ipAddress).filter(Boolean)).size}</span>
             </div>
           </div>
         </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/4">Event</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Target Identity</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Source IP</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {loading ? (
               <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">Loading security logs...</td>
               </tr>
            ) : data?.failedLogins?.length === 0 ? (
               <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">No failed logins detected.</td>
               </tr>
            ) : (
              data?.failedLogins?.map((log: any) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold font-mono tracking-widest border-rose-500/20 bg-rose-500/10 text-rose-400">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[13px] font-medium text-white">{log.username}</td>
                  <td className="px-6 py-4 text-[12px] font-mono text-neutral-400">{log.ipAddress || 'Unknown'}</td>
                  <td className="px-6 py-4 text-[13px] text-neutral-500 tabular-nums text-right">{new Date(log.timestamp).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
