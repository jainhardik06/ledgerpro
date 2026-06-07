import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, Plus, Users, Building, LogOut, Moon, Sun, 
  BarChart3, ShieldAlert, Settings, Activity, Power, Lock, Unlock, PlaySquare
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  status: string;
  plan: string;
  limits: { maxUsers: number };
  createdAt: string;
}

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string;
  status: string;
}

interface Analytics {
  totalTenants: number;
  totalUsers: number;
  totalTransactions: number;
  failedLogins: number;
}

interface SecurityLog {
  id: string;
  username: string;
  action: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export default function SuperAdminDashboard({ user, onLogout, darkMode, setDarkMode }: any) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'tenants' | 'users' | 'security'>('analytics');
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [globalUsers, setGlobalUsers] = useState<User[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ totalTenants: 0, totalUsers: 0, totalTransactions: 0, failedLogins: 0 });
  const [failedLogins, setFailedLogins] = useState<SecurityLog[]>([]);
  const [health, setHealth] = useState<any>({});
  
  const [loading, setLoading] = useState(false);
  
  // Modals
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [toasts, setToasts] = useState<any[]>([]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/tenants');
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
      }
    } catch (err) {
      showToast('Error fetching tenants', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/analytics');
      if (res.ok) setAnalytics(await res.json());
    } catch (err) {}
    finally { setLoading(false); }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/users');
      if (res.ok) setGlobalUsers(await res.json());
    } catch (err) {}
    finally { setLoading(false); }
  };

  const fetchSecurity = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/super-admin/security');
      if (res.ok) {
        const data = await res.json();
        setFailedLogins(data.failedLogins || []);
        setHealth(data.health || {});
      }
    } catch (err) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
    if (activeTab === 'tenants') fetchTenants();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'security') fetchSecurity();
  }, [activeTab]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName || !adminUsername || !adminPassword) return showToast('Required fields missing', 'error');
    try {
      const res = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tenantName, adminUsername, adminPassword })
      });
      if (res.ok) {
        showToast('Tenant created!', 'success');
        setIsTenantModalOpen(false);
        fetchTenants();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err) {
      showToast('Error', 'error');
    }
  };

  const handleToggleTenantStatus = async (t: Tenant) => {
    const newStatus = t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/super-admin/tenants/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Tenant ${newStatus}`, 'success');
        fetchTenants();
      }
    } catch (err) {}
  };

  const handleToggleUserStatus = async (u: User) => {
    const newStatus = u.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      const res = await fetch('/api/super-admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, status: newStatus })
      });
      if (res.ok) {
        showToast(`User ${newStatus}`, 'success');
        fetchUsers();
      }
    } catch (err) {}
  };

  const handleImpersonate = async (userId: string) => {
    try {
      const res = await fetch('/api/super-admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        window.location.reload(); // Reload to trigger impersonation session
      } else {
        showToast('Impersonation failed', 'error');
      }
    } catch (err) {}
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-sm ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' : 'bg-rose-500/15 border-rose-500/35 text-rose-400'}`}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <aside className={`w-full md:w-64 border-r flex flex-col ${darkMode ? 'bg-slate-950/80 border-slate-900' : 'bg-white/80 border-slate-200'}`}>
        <div className="p-4 border-b border-inherit flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-xl">
            <Building className="w-5 h-5 text-indigo-500" />
            <span>SaaS Admin</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'analytics' ? (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600') : 'hover:bg-slate-500/10 text-slate-500'}`}>
            <BarChart3 className="w-4 h-4" /> Global Analytics
          </button>
          <button onClick={() => setActiveTab('tenants')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'tenants' ? (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600') : 'hover:bg-slate-500/10 text-slate-500'}`}>
            <Building className="w-4 h-4" /> Organizations
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'users' ? (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600') : 'hover:bg-slate-500/10 text-slate-500'}`}>
            <Users className="w-4 h-4" /> Global Users
          </button>
          <button onClick={() => setActiveTab('security')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'security' ? (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600') : 'hover:bg-slate-500/10 text-slate-500'}`}>
            <ShieldAlert className="w-4 h-4" /> Security Center
          </button>
        </div>

        <div className="p-4 border-t border-inherit space-y-2">
          <button onClick={() => setDarkMode(!darkMode)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-500/10 text-sm font-semibold text-slate-500">
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} Toggle Theme
          </button>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-rose-500/10 text-sm font-semibold text-rose-500">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto p-6 md:p-8">
        
        {loading && <div className="absolute top-4 right-4"><RefreshCw className="w-5 h-5 animate-spin text-indigo-500" /></div>}

        {activeTab === 'analytics' && (
          <div className="space-y-6 max-w-5xl">
            <h1 className="text-2xl font-bold">Global SaaS Analytics</h1>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Total Tenants</p>
                <h3 className="text-3xl font-black text-indigo-500">{analytics.totalTenants}</h3>
              </div>
              <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Total Users</p>
                <h3 className="text-3xl font-black text-emerald-500">{analytics.totalUsers}</h3>
              </div>
              <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Transactions</p>
                <h3 className="text-3xl font-black text-blue-500">{analytics.totalTransactions}</h3>
              </div>
              <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <p className="text-xs font-semibold uppercase text-slate-500 mb-1">Failed Logins</p>
                <h3 className="text-3xl font-black text-rose-500">{analytics.failedLogins}</h3>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="space-y-6 max-w-6xl">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Organization Management</h1>
              <button onClick={() => setIsTenantModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-lg hover:bg-indigo-500 transition">
                <Plus className="w-4 h-4" /> Add Tenant
              </button>
            </div>
            
            <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/80 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
                  <tr>
                    <th className="px-6 py-4">Tenant Name</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4">Created At</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/60 hover:bg-slate-800/40' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className="px-6 py-4 font-bold">{t.name} <br/><span className="font-mono text-xs text-slate-500">{t.id}</span></td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${t.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-xs">{t.plan}</td>
                      <td className="px-6 py-4">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => handleToggleTenantStatus(t)} className={`p-1.5 rounded-lg border ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`} title={t.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}>
                          <Power className={`w-4 h-4 ${t.status === 'ACTIVE' ? 'text-rose-500' : 'text-emerald-500'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 max-w-6xl">
            <h1 className="text-2xl font-bold">Global User Directory</h1>
            
            <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/80 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
                  <tr>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Tenant ID</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {globalUsers.map(u => (
                    <tr key={u.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/60 hover:bg-slate-800/40' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className="px-6 py-4 font-bold">{u.username}</td>
                      <td className="px-6 py-4 text-xs font-semibold">{u.role}</td>
                      <td className="px-6 py-4 font-mono text-xs">{u.tenantId}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                        <button onClick={() => handleImpersonate(u.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg hover:bg-indigo-500 hover:text-white transition font-semibold text-xs">
                          <PlaySquare className="w-3.5 h-3.5" /> Impersonate
                        </button>
                        <button onClick={() => handleToggleUserStatus(u)} className={`p-1.5 rounded-lg border ${darkMode ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-200 hover:bg-slate-100'}`} title={u.status === 'ACTIVE' ? 'Lock User' : 'Unlock User'}>
                          {u.status === 'ACTIVE' ? <Lock className="w-4 h-4 text-rose-500" /> : <Unlock className="w-4 h-4 text-emerald-500" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6 max-w-6xl">
            <h1 className="text-2xl font-bold">Security Center</h1>
            
            <div className={`p-5 rounded-2xl border flex items-center justify-between ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <div>
                <h3 className="font-bold">System Health</h3>
                <p className="text-sm text-slate-500">Database Connection Status</p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${health.status?.includes('Online') ? 'text-emerald-500' : 'text-amber-500'}`}>{health.status || 'Checking...'}</p>
                <p className="text-xs text-slate-500">Ping: {health.ping}ms</p>
              </div>
            </div>

            <h2 className="text-xl font-bold mt-8 mb-4">Failed Logins & Suspicious Activity</h2>
            <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
              <table className="w-full text-sm text-left">
                <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/80 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Username</th>
                    <th className="px-6 py-4">IP Address</th>
                    <th className="px-6 py-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {failedLogins.map(log => (
                    <tr key={log.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/60 hover:bg-slate-800/40' : 'border-slate-100 hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-6 py-4 font-bold">{log.username}</td>
                      <td className="px-6 py-4 font-mono text-xs">{log.ipAddress || 'unknown'}</td>
                      <td className="px-6 py-4 text-rose-500">{log.details}</td>
                    </tr>
                  ))}
                  {failedLogins.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No failed logins recorded recently.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Tenant Modal */}
      {isTenantModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-bold mb-4">Provision New Tenant</h2>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Organization Name</label>
                <input type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} className={`w-full p-3 rounded-lg border outline-none ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-white border-slate-300 focus:border-indigo-500'}`} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Initial Admin Username</label>
                <input type="text" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} className={`w-full p-3 rounded-lg border outline-none ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-white border-slate-300 focus:border-indigo-500'}`} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Initial Admin Password</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className={`w-full p-3 rounded-lg border outline-none ${darkMode ? 'bg-slate-950 border-slate-800 focus:border-indigo-500' : 'bg-white border-slate-300 focus:border-indigo-500'}`} required />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsTenantModalOpen(false)} className={`px-4 py-2 rounded-lg font-semibold ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-semibold">Provision Tenant</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
