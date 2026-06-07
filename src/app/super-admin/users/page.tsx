"use client";

import React, { useState, useEffect } from 'react';
import { Search, UserCircle, Shield, MoreHorizontal } from 'lucide-react';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/super-admin/users');
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()) || u.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Header Actions */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Global User Intelligence</h1>
          <p className="text-[13px] text-neutral-400">Search and monitor all users across every organization.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search by username or ID..." 
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
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">User Identity</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Tenant ID</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {loading ? (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-[13px] text-neutral-500">Loading users...</td>
               </tr>
            ) : filteredUsers.length === 0 ? (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-[13px] text-neutral-500">No users found.</td>
               </tr>
            ) : (
               filteredUsers.map(user => (
                 <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                   <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full border border-white/[0.05] bg-[#0a0a0a] flex items-center justify-center shrink-0">
                         <UserCircle className="w-4 h-4 text-neutral-400" />
                       </div>
                       <div>
                         <div className="text-[13px] font-medium text-white mb-0.5">{user.username}</div>
                         <div className="text-[11px] font-mono text-neutral-500">{user.id}</div>
                       </div>
                     </div>
                   </td>
                   <td className="px-6 py-4">
                     <div className="flex items-center gap-1.5">
                       {user.role === 'TENANT_ADMIN' && <Shield className="w-3.5 h-3.5 text-indigo-400" />}
                       <span className={`text-[12px] font-medium ${user.role === 'TENANT_ADMIN' ? 'text-indigo-300' : 'text-neutral-400'}`}>
                         {user.role ? user.role.replace('_', ' ') : 'UNKNOWN'}
                       </span>
                     </div>
                   </td>
                   <td className="px-6 py-4">
                     <span className="text-[12px] font-mono text-neutral-400">{user.tenantId}</span>
                   </td>
                   <td className="px-6 py-4">
                     <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase ${
                       user.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                     }`}>
                       {user.status}
                     </span>
                   </td>
                   <td className="px-6 py-4 text-right">
                     <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                       <MoreHorizontal className="w-4 h-4" />
                     </button>
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
