"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Users, Shield, Plus, MoreHorizontal } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { Drawer } from '@/components/ui/Drawer';

export default function TeamPage() {
  const { user } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.role !== 'TENANT_ADMIN') {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const res = await fetch('/api/tenant/users');
        if (res.ok) setTeam((await res.json()).users);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, [user]);

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  if (user?.role !== 'TENANT_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Shield className="w-12 h-12 text-neutral-700 mb-4" />
        <h2 className="text-[18px] font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-[14px] text-neutral-400">Only workspace administrators can manage team members.</p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/tenant/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });
      if (res.ok) {
        setIsDrawerOpen(false);
        setNewUsername('');
        setNewPassword('');
        const fres = await fetch('/api/tenant/users');
        if (fres.ok) setTeam((await fres.json()).users);
      }
    } catch (e) {} finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Team Workspace</h1>
          <p className="text-[13px] text-neutral-400">Manage members, permissions, and platform access.</p>
        </div>
        <button onClick={() => setIsDrawerOpen(true)} className="h-9 px-3 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">User Identity</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
             {team.map(member => (
               <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                 <td className="px-6 py-4">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full border border-white/[0.05] bg-white/[0.02] flex items-center justify-center shrink-0">
                       <Users className="w-4 h-4 text-neutral-400" />
                     </div>
                     <div>
                       <div className="text-[13px] font-medium text-white mb-0.5">{member.username}</div>
                       <div className="text-[11px] font-mono text-neutral-500">{member.id}</div>
                     </div>
                   </div>
                 </td>
                 <td className="px-6 py-4">
                   <div className="flex items-center gap-1.5">
                     {member.role === 'TENANT_ADMIN' && <Shield className="w-3.5 h-3.5 text-indigo-400" />}
                     <span className={`text-[12px] font-medium ${member.role === 'TENANT_ADMIN' ? 'text-indigo-300' : 'text-neutral-400'}`}>
                       {member.role ? member.role.replace('_', ' ') : 'USER'}
                     </span>
                   </div>
                 </td>
                 <td className="px-6 py-4">
                   <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                     Active
                   </span>
                 </td>
                 <td className="px-6 py-4 text-right">
                   <button className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                     <MoreHorizontal className="w-4 h-4" />
                   </button>
                 </td>
               </tr>
             ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title="Invite Member">
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Username</label>
               <input type="text" value={newUsername} onChange={e=>setNewUsername(e.target.value)} required className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" placeholder="johndoe" />
             </div>
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Temporary Password</label>
               <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" />
             </div>
             <p className="text-[12px] text-neutral-500">New users are granted standard access by default. They can manage transactions, clients, and view reports, but cannot access Settings or Team Workspace.</p>
           </div>
           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             <div />
             <div className="flex items-center gap-3">
               <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
               <button type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                 {saving ? 'Inviting...' : 'Invite Member'}
               </button>
             </div>
           </div>
        </form>
      </Drawer>
    </div>
  );
}
