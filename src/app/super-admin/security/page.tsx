"use client";

import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, MapPin, Search } from 'lucide-react';

export default function SecurityPage() {
  const [search, setSearch] = useState('');

  // Mock data
  const logs = [
    { id: 'log_1', event: 'FAILED_LOGIN', user: 'admin@acmecorp.com', ip: '192.168.1.100', location: 'Frankfurt, DE', time: '2 mins ago', severity: 'HIGH' },
    { id: 'log_2', event: 'FAILED_LOGIN', user: 'admin@acmecorp.com', ip: '192.168.1.100', location: 'Frankfurt, DE', time: '3 mins ago', severity: 'HIGH' },
    { id: 'log_3', event: 'FAILED_LOGIN', user: 'admin@acmecorp.com', ip: '192.168.1.100', location: 'Frankfurt, DE', time: '5 mins ago', severity: 'HIGH' },
    { id: 'log_4', event: 'PASSWORD_RESET_REQUESTED', user: 'tony@stark.com', ip: '10.0.0.45', location: 'New York, US', time: '1 hour ago', severity: 'LOW' },
    { id: 'log_5', event: 'UNAUTHORIZED_ACCESS_ATTEMPT', user: 'unknown', ip: '45.22.11.9', location: 'Moscow, RU', time: '2 hours ago', severity: 'CRITICAL' },
  ];

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
            <div className="absolute top-1/3 left-1/4 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            
            <div className="relative z-10 flex flex-col items-center">
              <ShieldAlert className="w-6 h-6 text-rose-500 mb-2" />
              <div className="text-[13px] font-medium text-white">Active Brute-Force Attempt Detected</div>
              <div className="text-[11px] font-mono text-rose-400 mt-1">Target: admin@acmecorp.com | Source: DE</div>
            </div>
         </div>

         {/* Stats */}
         <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 flex flex-col justify-between h-48">
           <div>
             <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-1">Threat Level</div>
             <div className="text-2xl font-semibold tracking-tight text-rose-500">ELEVATED</div>
           </div>
           <div>
             <div className="flex justify-between text-[12px] text-neutral-400 mb-1">
               <span>Failed Logins (24h)</span>
               <span className="font-mono text-white">1,402</span>
             </div>
             <div className="flex justify-between text-[12px] text-neutral-400">
               <span>Blocked IPs</span>
               <span className="font-mono text-white">45</span>
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
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Location</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold font-mono tracking-widest ${
                    log.severity === 'CRITICAL' ? 'border-rose-500/20 bg-rose-500/10 text-rose-400' :
                    log.severity === 'HIGH' ? 'border-amber-500/20 bg-amber-500/10 text-amber-400' :
                    'border-white/[0.05] bg-transparent text-neutral-400'
                  }`}>
                    {log.event}
                  </span>
                </td>
                <td className="px-6 py-4 text-[13px] font-medium text-white">{log.user}</td>
                <td className="px-6 py-4 text-[12px] font-mono text-neutral-400">{log.ip}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-[12px] text-neutral-400">
                    <MapPin className="w-3.5 h-3.5" /> {log.location}
                  </div>
                </td>
                <td className="px-6 py-4 text-[13px] text-neutral-500 tabular-nums text-right">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
