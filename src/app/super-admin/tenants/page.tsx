"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, MoreHorizontal, UserSquare2, ShieldAlert } from 'lucide-react';

export default function TenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await fetch('/api/super-admin/tenants');
        if (res.ok) {
          const data = await res.json();
          setTenants(data.tenants || []);
        }
      } catch (e) {
        console.error("Failed to fetch tenants", e);
      } finally {
        setLoading(false);
      }
    };
    fetchTenants();
  }, []);

  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase()));

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await fetch('/api/super-admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    } catch (e) {
      console.error("Failed to impersonate tenant", e);
    }
  };

  const handleSetStatus = async (tenantId: string, status: 'ACTIVE' | 'SUSPENDED') => {
    setOpenMenuId(null);
    try {
      const res = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, status } : t));
      }
    } catch (e) {
      console.error('Failed to update tenant status', e);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Organization Directory</h1>
          <p className="text-[13px] text-neutral-400">Manage all tenant workspaces, plans, and statuses.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search organizations..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
          />
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">Organization Name</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Plan</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {loading ? (
              <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">Loading organizations...</td>
              </tr>
            ) : filteredTenants.length === 0 ? (
              <tr>
                 <td colSpan={4} className="px-6 py-8 text-center text-[13px] text-neutral-500">No organizations found.</td>
              </tr>
            ) : (
              filteredTenants.map(tenant => (
                <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md border border-white/[0.05] bg-[#0a0a0a] flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-neutral-400" />
                      </div>
                      <div>
                        <div className="text-[14px] font-medium text-white mb-0.5">{tenant.name}</div>
                        <div className="text-[11px] font-mono text-neutral-500">{tenant.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[12px] font-medium text-neutral-300 tracking-wide">{tenant.plan}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
                      tenant.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button onClick={() => handleImpersonate(tenant.id)} title="Impersonate Tenant" aria-label={`Impersonate ${tenant.name}`} className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors">
                        <UserSquare2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === tenant.id ? null : tenant.id); }}
                        aria-label={`More actions for ${tenant.name}`}
                        className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuId === tenant.id && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 z-20 w-40 rounded-md border border-white/[0.1] bg-[#0a0a0a] shadow-lg py-1">
                          {tenant.status === 'ACTIVE' ? (
                            <button onClick={() => handleSetStatus(tenant.id, 'SUSPENDED')} className="w-full text-left px-3 py-2 text-[12px] text-rose-400 hover:bg-white/[0.05]">
                              Suspend Organization
                            </button>
                          ) : (
                            <button onClick={() => handleSetStatus(tenant.id, 'ACTIVE')} className="w-full text-left px-3 py-2 text-[12px] text-emerald-400 hover:bg-white/[0.05]">
                              Reactivate Organization
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
