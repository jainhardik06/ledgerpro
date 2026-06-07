"use client";

import React, { useState } from 'react';
import { Search, Filter, MoreHorizontal, AlertCircle, Building2, Terminal } from 'lucide-react';
import Link from 'next/link';

export default function TenantsPage() {
  const [search, setSearch] = useState('');

  // Mock data
  const tenants = [
    { id: 't_9f8a7d', name: 'Acme Corp', status: 'ACTIVE', plan: 'Enterprise', users: 142, mrr: 1200, createdAt: 'Oct 12, 2026' },
    { id: 't_3b2c1d', name: 'Stark Industries', status: 'ACTIVE', plan: 'Team', users: 12, mrr: 499, createdAt: 'Sep 28, 2026' },
    { id: 't_5e4f6g', name: 'Wayne Enterprises', status: 'SUSPENDED', plan: 'Pro', users: 4, mrr: 0, createdAt: 'Aug 15, 2026' },
    { id: 't_7h8i9j', name: 'Ollivanders', status: 'ACTIVE', plan: 'Free', users: 1, mrr: 0, createdAt: 'Oct 24, 2026' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Organizations</h1>
          <p className="text-[13px] text-neutral-400">Manage all 842 provisioned workspaces across the edge.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Filter by ID or Name..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
          <button className="h-9 px-3 border border-white/[0.1] bg-[#0a0a0a] rounded-md flex items-center gap-2 text-[13px] font-medium text-white hover:bg-white/[0.05] transition-colors">
            <Filter className="w-4 h-4 text-neutral-400" /> Filter
          </button>
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/4">Organization</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Plan</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Users</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">MRR</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Created</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {tenants.map(tenant => (
              <tr key={tenant.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-[#0a0a0a] border border-white/[0.05] flex items-center justify-center shrink-0 group-hover:border-white/[0.2] transition-colors">
                      <Building2 className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div>
                      <Link href={`/super-admin/tenants/${tenant.id}`} className="text-[14px] font-medium text-white hover:underline underline-offset-4">{tenant.name}</Link>
                      <div className="text-[12px] font-mono text-neutral-500 mt-0.5">{tenant.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium font-mono uppercase tracking-widest ${
                    tenant.status === 'ACTIVE' 
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' 
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }`}>
                    {tenant.status === 'ACTIVE' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : <AlertCircle className="w-3 h-3" />}
                    {tenant.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-[13px] text-neutral-300 font-medium">{tenant.plan}</td>
                <td className="px-6 py-4 text-[13px] text-neutral-400 tabular-nums text-right">{tenant.users}</td>
                <td className="px-6 py-4 text-[13px] text-white tabular-nums text-right font-medium">${tenant.mrr}</td>
                <td className="px-6 py-4 text-[13px] text-neutral-500 tabular-nums text-right">{tenant.createdAt}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors" title="Impersonate Admin">
                      <Terminal className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
