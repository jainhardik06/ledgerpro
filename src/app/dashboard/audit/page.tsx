"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Activity, Search, Shield, Info, Download, Globe } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { Drawer } from '@/components/ui/Drawer';

export default function AuditPage() {
  const { user } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Audit Log</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Comprehensive chronological record of system activity.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none min-w-0">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search events..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full sm:w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
          <button 
            onClick={handleExportCSV}
            className="h-9 px-3 shrink-0 border border-white/[0.1] rounded-md text-[13px] font-medium text-white hover:bg-white/[0.02] flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-full sm:w-1/5">Timestamp</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">Action</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">Actor</th>
              <th className="hidden md:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/6">IP Address</th>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right sm:text-left shrink-0">Details</th>
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
                  <tr 
                    key={log.id || idx} 
                    onClick={() => { setSelectedLog(log); setIsDrawerOpen(true); }}
                    className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                  >
                    <td className="px-4 sm:px-6 py-3.5 text-[12px] text-neutral-500 font-mono align-middle max-w-[200px] sm:max-w-none">
                       <div className="flex flex-col min-w-0 gap-1 sm:block">
                         <span className="truncate block sm:inline">{new Date(log.timestamp).toLocaleString()}</span>
                         <div className="sm:hidden flex items-center gap-1.5 min-w-0 mt-0.5">
                           <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold font-mono tracking-wider uppercase shrink-0 ${
                             (log.action || '').startsWith('FAILED') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                             (log.action || '').startsWith('DELETE') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                             'bg-white/5 text-white border-white/10'
                           }`}>
                             {log.action}
                           </span>
                           <span className="text-neutral-400 font-medium truncate">{log.username || 'system'}</span>
                         </div>
                       </div>
                    </td>
                    <td className="hidden sm:table-cell px-6 py-3.5 align-middle">
                      <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold font-mono tracking-wider uppercase ${
                        (log.action || '').startsWith('FAILED') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        (log.action || '').startsWith('DELETE') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-white/5 text-white border-white/10'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-6 py-3.5 text-[13px] font-medium text-neutral-200 align-middle">
                      {log.username || 'system'}
                    </td>
                    <td className="hidden md:table-cell px-6 py-3.5 text-[12px] text-neutral-500 font-mono align-middle">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Globe className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        <span className="truncate">{log.ipAddress || 'local'}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 text-[13px] text-neutral-400 max-w-[140px] sm:max-w-md break-words font-mono text-right sm:text-left align-middle shrink-0">
                      <div className="truncate sm:whitespace-normal">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </div>
                    </td>
                  </tr>
                ))
             )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title="Audit Event Details">
        {selectedLog && (
          <div className="flex flex-col h-full">
            <div className="space-y-6 flex-1">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-widest">Timestamp</label>
                <div className="text-[13px] text-white font-mono">{new Date(selectedLog.timestamp).toLocaleString()}</div>
              </div>
              
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-widest">Action</label>
                <div>
                  <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold font-mono tracking-wider uppercase ${
                    (selectedLog.action || '').startsWith('FAILED') ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                    (selectedLog.action || '').startsWith('DELETE') ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-white/5 text-white border-white/10'
                  }`}>
                    {selectedLog.action}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-widest">Actor</label>
                <div className="text-[13px] text-white">{selectedLog.username || 'system'}</div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-widest">IP Address</label>
                <div className="text-[13px] text-white font-mono">{selectedLog.ipAddress || 'local'}</div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-widest">Details</label>
                <div className="text-[13px] text-neutral-300 bg-white/[0.02] p-3 rounded-md border border-white/[0.05] font-mono whitespace-pre-wrap break-words">
                  {typeof selectedLog.details === 'string' ? selectedLog.details : JSON.stringify(selectedLog.details, null, 2)}
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-white/[0.05] shrink-0">
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="w-full h-10 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
