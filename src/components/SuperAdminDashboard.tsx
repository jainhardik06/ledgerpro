import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Users, Building, LogOut, Moon, Sun, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  createdAt: string;
}

export default function SuperAdminDashboard({ user, onLogout, darkMode, setDarkMode }: any) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

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

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLoading) return;
    if (!tenantName || !adminUsername || !adminPassword) {
      showToast('All fields are required', 'error');
      return;
    }
    
    setCreateLoading(true);
    try {
      const res = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tenantName, adminUsername, adminPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Tenant created successfully', 'success');
        setIsModalOpen(false);
        setTenantName('');
        setAdminUsername('');
        setAdminPassword('');
        fetchTenants();
      } else {
        showToast(data.error || 'Failed to create tenant', 'error');
      }
    } catch (err) {
      showToast('Network error occurred', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md text-sm ${t.type === 'success' ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400' : 'bg-rose-500/15 border-rose-500/35 text-rose-400'}`}>
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <nav className={`sticky top-0 z-40 border-b backdrop-blur-md ${darkMode ? 'bg-slate-950/80 border-slate-900' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5 font-black text-xl tracking-tight">
            <div className="bg-gradient-to-tr from-rose-600 to-orange-500 p-2 rounded-xl text-white shadow-md shadow-rose-600/10">
              <Building className="w-5 h-5" />
            </div>
            <span className="bg-gradient-to-r from-rose-500 to-orange-400 bg-clip-text text-transparent">Super Admin</span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-xl border ${darkMode ? 'border-slate-800 text-amber-400' : 'border-slate-200 text-indigo-600'}`}>
              {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold">{user?.username}</span>
            </div>
            <button onClick={onLogout} className="p-2 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 lg:p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Manage Tenants</h1>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition">
            <Plus className="w-4 h-4" /> Add Tenant
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /></div>
        ) : (
          <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <table className="w-full text-sm text-left">
              <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/80 text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200'} border-b`}>
                <tr>
                  <th className="px-6 py-4">Tenant Name</th>
                  <th className="px-6 py-4">Tenant ID</th>
                  <th className="px-6 py-4">Created At</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className={`border-b last:border-0 ${darkMode ? 'border-slate-800/60 hover:bg-slate-800/40' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <td className="px-6 py-4 font-medium">{t.name}</td>
                    <td className="px-6 py-4 font-mono text-xs">{t.id}</td>
                    <td className="px-6 py-4">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
                {tenants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500">No tenants found. Create one to get started.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h2 className="text-xl font-bold mb-4">Create New Tenant</h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tenant Name</label>
                <input type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} className={`w-full p-3 rounded-lg border ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-black'}`} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Admin Username</label>
                <input type="text" value={adminUsername} onChange={e => setAdminUsername(e.target.value)} className={`w-full p-3 rounded-lg border ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-black'}`} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Admin Password</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className={`w-full p-3 rounded-lg border ${darkMode ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-300 text-black'}`} required />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className={`px-4 py-2 rounded-lg ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>Cancel</button>
                <button type="submit" disabled={createLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 flex items-center gap-2">
                  {createLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
