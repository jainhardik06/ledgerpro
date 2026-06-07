"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, Search, Shield, Info, Download } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';

export default function AuditPage() {
  const { user } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user?.role !== 'TENANT_ADMIN') {
      setLoading(false);
      return;
    }
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) setLogs((await res.json()).logs);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchLogs();
  }, [user]);

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  if (user?.role !== 'TENANT_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Shield className="w-12 h-12 text-neutral-700 mb-4" />
        <h2 className="text-[18px] font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-[14px] text-neutral-400">Only workspace administrators can view audit logs.</p>
      </div>
    );
  }

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(search.toLowerCase()) || 
    l.actorId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Audit Log</h1>
          <p className="text-[13px] text-neutral-400">Comprehensive chronological record of system activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search events..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
          <button className="h-9 px-3 border border-white/[0.1] rounded-md text-[13px] font-medium text-white hover:bg-white/[0.02] flex items-center gap-2">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/4">Timestamp</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Action</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Actor</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
             {filteredLogs.length === 0 ? (
                <tr>
                 <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                        <Activity className="w-5 h-5 text-neutral-500" />
                      </div>
                      <p className="text-[14px] text-white font-medium mb-1">No events recorded</p>
                      <p className="text-[13px] text-neutral-500 max-w-sm mb-4">System and user activity will appear here over time.</p>
                    </div>
                 </td>
               </tr>
             ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-3 text-[12px] text-neutral-500 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded border border-white/[0.05] bg-white/[0.02] text-[11px] font-medium text-white uppercase tracking-widest">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[13px] font-medium text-neutral-400">
                      {log.actorId}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {log.details ? (
                         <div className="group/tooltip relative inline-block cursor-help">
                           <Info className="w-4 h-4 text-neutral-500 hover:text-white transition-colors" />
                           <div className="absolute right-0 top-6 w-64 p-3 bg-[#111] border border-white/[0.1] rounded-md shadow-xl text-[11px] font-mono text-neutral-300 hidden group-hover/tooltip:block z-50 text-left whitespace-pre-wrap break-all">
                             {JSON.stringify(log.details, null, 2)}
                           </div>
                         </div>
                      ) : <span className="text-[12px] text-neutral-600">-</span>}
                    </td>
                  </tr>
                ))
             )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
