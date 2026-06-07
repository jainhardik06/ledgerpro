"use client";

import React, { useState } from 'react';
import { FileText, Search, Filter, Download } from 'lucide-react';

export default function AuditPage() {
  const [search, setSearch] = useState('');

  // Mock data
  const audits = [
    { id: 'aud_9x8', action: 'TENANT_PROVISIONED', actor: 'SYSTEM', target: 't_9f8a7d', details: 'Automated workspace creation.', time: '2026-10-24 14:02:45 UTC' },
    { id: 'aud_7y6', action: 'PLAN_UPGRADED', actor: 'usr_1a2b', target: 't_3b2c1d', details: 'Upgraded from Pro to Team tier.', time: '2026-10-24 13:15:10 UTC' },
    { id: 'aud_5z4', action: 'ADMIN_IMPERSONATION_STARTED', actor: 'superadmin_1', target: 'usr_7g8h', details: 'Support ticket #8442 investigation.', time: '2026-10-24 10:44:02 UTC' },
    { id: 'aud_3w2', action: 'TENANT_SUSPENDED', actor: 'superadmin_2', target: 't_5e4f6g', details: 'TOS Violation: Section 4.1.', time: '2026-10-23 18:22:00 UTC' },
    { id: 'aud_1v0', action: 'FEATURE_FLAG_TOGGLED', actor: 'superadmin_1', target: 'ff_new_reports', details: 'Enabled for all Enterprise tenants.', time: '2026-10-23 09:00:00 UTC' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Global Audit Command Center</h1>
          <p className="text-[13px] text-neutral-400">Immutable log of all sensitive platform-level and tenant-level mutations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by ID, Actor, or Target..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
          <button className="h-9 px-3 border border-white/[0.1] bg-[#0a0a0a] rounded-md flex items-center gap-2 text-[13px] font-medium text-white hover:bg-white/[0.05] transition-colors">
            <Download className="w-4 h-4 text-neutral-400" /> Export CSV
          </button>
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Timestamp (UTC)</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/4">Action / Event</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Actor</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Target ID</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Context / Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {audits.map(audit => (
              <tr key={audit.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4 text-[12px] text-neutral-500 tabular-nums font-mono">{audit.time}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.05] text-[10px] font-bold font-mono tracking-widest text-neutral-300">
                    {audit.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-[12px] font-mono text-indigo-400">{audit.actor}</td>
                <td className="px-6 py-4 text-[12px] font-mono text-emerald-400">{audit.target}</td>
                <td className="px-6 py-4 text-[13px] text-neutral-400">{audit.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
