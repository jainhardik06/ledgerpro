import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, FileText } from 'lucide-react';

interface SystemLog {
  id: string;
  username: string;
  action: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
}

export default function TenantLogsViewer({ onBack, darkMode }: any) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(l => 
    l.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.details.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen flex flex-col p-4 md:p-8 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className={`p-2 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-900/40 hover:bg-slate-800' : 'border-slate-200 bg-white hover:bg-slate-100'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-black flex items-center gap-2"><FileText className="w-6 h-6 text-indigo-500" /> Activity Logs</h1>
        </div>

        <div className={`rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} p-6`}>
          <div className="flex justify-between items-center mb-6">
            <div className={`flex items-center px-3 py-2 rounded-xl border w-72 ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <Search className="w-4 h-4 text-slate-400 mr-2" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                className="bg-transparent outline-none text-sm w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button onClick={fetchLogs} className={`p-2 rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-slate-100 hover:bg-slate-200'}`}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/80 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/60' : 'border-slate-100'}`}>
                    <td className="px-4 py-3 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">{log.username}</td>
                    <td className="px-4 py-3 text-xs">{log.ipAddress || 'Unknown'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-md text-xs font-bold ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>{log.action}</span></td>
                    <td className="px-4 py-3 text-xs">{log.details}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
