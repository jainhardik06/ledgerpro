"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, Search, Shield, Info, Download, Globe } from 'lucide-react';
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

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Action', 'Actor', 'IP Address', 'Details'];
    const rows = filteredLogs.map(l => [
      new Date(l.timestamp).toLocaleString(),
      l.action,
      l.username || 'system',
      l.ipAddress || 'unknown',
      `"${(l.details || '').toString().replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `moneyos_audit_log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    (l.action || '').toLowerCase().includes(search.toLowerCase()) || 
    (l.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.ipAddress || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.details || '').toString().toLowerCase().includes(search.toLowerCase())
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
          <button 
            onClick={handleExportCSV}
            className="h-9 px-3 border border-white/[0.1] rounded-md text-[13px] font-medium text-white hover:bg-white/[0.02] flex items-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/5">Timestamp</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">Action</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">Actor</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">IP Address</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
             {filteredLogs.length === 0 ? (
                <tr>
                 <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                        <Activity className="w-5 h-5 text-neutral-500" />
                      </div>
                      <p className="text-[14px] text-white font-medium mb-1">No events recorded</p>
                      <p className="text-[13px] text-neutral-500 max-w-sm">System and user activity will appear here over time.</p>
                    </div>
                 </td>
               </tr>
             ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-3.5 text-[12px] text-neutral-500 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold font-mono tracking-wider uppercase ${
                        (log.action || '').startsWith('FAILED') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        (log.action || '').startsWith('DELETE') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-white/5 text-white border-white/10'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] font-medium text-neutral-200">
                      {log.username || 'system'}
                    </td>
                    <td className="px-6 py-3.5 text-[12px] text-neutral-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-neutral-600" />
                        <span>{log.ipAddress || 'local'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-neutral-400 max-w-md break-words font-mono">
                      {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
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
