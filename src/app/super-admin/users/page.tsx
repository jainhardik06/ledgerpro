"use client";

import React, { useState } from 'react';
import { Search, ShieldAlert, Lock, Unlock, Mail } from 'lucide-react';

export default function UsersPage() {
  const [search, setSearch] = useState('');

  // Mock data
  const users = [
    { id: 'usr_1a2b', email: 'tony@stark.com', tenantId: 't_3b2c1d', tenantName: 'Stark Industries', role: 'ADMIN', status: 'ACTIVE', lastLogin: '2 mins ago' },
    { id: 'usr_3c4d', email: 'pepper@stark.com', tenantId: 't_3b2c1d', tenantName: 'Stark Industries', role: 'USER', status: 'ACTIVE', lastLogin: '1 hour ago' },
    { id: 'usr_5e6f', email: 'bruce@wayne.com', tenantId: 't_5e4f6g', tenantName: 'Wayne Enterprises', role: 'ADMIN', status: 'LOCKED', lastLogin: '14 days ago' },
    { id: 'usr_7g8h', email: 'clark@dailyplanet.com', tenantId: 't_9f8a7d', tenantName: 'Acme Corp', role: 'USER', status: 'ACTIVE', lastLogin: 'Just now' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Global User Intelligence</h1>
          <p className="text-[13px] text-neutral-400">Search and audit 14,205 users across all isolated tenants.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by email..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#000000] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">User Identity</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Organization Context</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Last Login</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0a0a0a] border border-white/[0.05] flex items-center justify-center shrink-0">
                      <span className="text-[12px] font-semibold text-white">{user.email.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div>
                      <div className="text-[14px] font-medium text-white">{user.email}</div>
                      <div className="text-[12px] font-mono text-neutral-500 mt-0.5">{user.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                   <div className="text-[13px] text-white font-medium">{user.tenantName}</div>
                   <div className="text-[11px] font-mono text-neutral-500">{user.tenantId}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest ${
                    user.role === 'ADMIN' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-white/[0.05] text-neutral-400'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-medium font-mono uppercase tracking-widest ${
                    user.status === 'ACTIVE' 
                      ? 'border-emerald-500/20 bg-transparent text-emerald-400' 
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }`}>
                    {user.status === 'ACTIVE' ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : <ShieldAlert className="w-3 h-3" />}
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-[13px] text-neutral-500 tabular-nums text-right">{user.lastLogin}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors" title="Send Email">
                      <Mail className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-rose-500 transition-colors" title={user.status === 'ACTIVE' ? 'Lock Account' : 'Unlock Account'}>
                      {user.status === 'ACTIVE' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
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
