"use client";

import React, { useState, useEffect } from 'react';
import { Search, Download } from 'lucide-react';

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAudits = async () => {
      try {
        const res = await fetch('/api/super-admin/audit');
        if (res.ok) {
          const data = await res.json();
          setAudits(data);
        }
      } catch (e) {
        console.error("Failed to fetch audits", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAudits();
  }, []);

  const filteredAudits = audits.filter(a => a.action.toLowerCase().includes(search.toLowerCase()) || a.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Global Audit Command Center</h1>
          <p className="text-[13px] text-neutral-400">Immutable log of all platform-level and tenant-level events.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by Action or Actor..." 
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
            {loading ? (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-[13px] text-neutral-500">Loading audit log...</td>
               </tr>
            ) : filteredAudits.length === 0 ? (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-[13px] text-neutral-500">No logs found.</td>
               </tr>
            ) : (
               filteredAudits.map(audit => (
                 <tr key={audit.id} className="hover:bg-white/[0.02] transition-colors group">
                   <td className="px-6 py-4 text-[12px] text-neutral-500 tabular-nums font-mono">{new Date(audit.timestamp).toISOString()}</td>
                   <td className="px-6 py-4">
                     <span className="inline-flex px-2 py-0.5 rounded bg-white/[0.05] border border-white/[0.05] text-[10px] font-bold font-mono tracking-widest text-neutral-300">
                       {audit.action}
                     </span>
                   </td>
                   <td className="px-6 py-4 text-[12px] font-mono text-indigo-400">{audit.username}</td>
                   <td className="px-6 py-4 text-[12px] font-mono text-emerald-400">{audit.tenantId || 'GLOBAL'}</td>
                   <td className="px-6 py-4 text-[13px] text-neutral-400">{audit.details}</td>
                 </tr>
               ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
