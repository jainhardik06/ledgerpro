"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Users, Shield, Plus, MoreHorizontal, AlertCircle } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { Drawer } from '@/components/ui/Drawer';

export default function TeamPage() {
  const { user } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any[]>([]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
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

  useEffect(() => {
    const handleOpen = () => openNew();
    window.addEventListener('open-invite-user', handleOpen);
    return () => window.removeEventListener('open-invite-user', handleOpen);
  }, []);

  const openNew = () => {
    setSelectedMember(null);
    setNewUsername('');
    setNewPassword('');
    setError('');
    setIsDrawerOpen(true);
  };

  const openEdit = (member: any) => {
    setSelectedMember(member);
    setNewUsername(member.username);
    setNewPassword('');
    setError('');
    setIsDrawerOpen(true);
  };

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
    setError('');
    try {
      const url = selectedMember ? `/api/tenant/users/${selectedMember.id}` : '/api/tenant/users';
      const method = selectedMember ? 'PUT' : 'POST';
      const body: any = { username: newUsername };
      if (newPassword) body.password = newPassword;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Save failed');
        setSaving(false);
        return;
      }

      setIsDrawerOpen(false);
      const fres = await fetch('/api/tenant/users');
      if (fres.ok) setTeam((await fres.json()).users);
    } catch (e) {
      setError('A connection error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this team member? This action is irreversible.')) return;
    setError('');
    try {
      const res = await fetch(`/api/tenant/users/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to remove member');
        return;
      }
      setIsDrawerOpen(false);
      const fres = await fetch('/api/tenant/users');
      if (fres.ok) setTeam((await fres.json()).users);
    } catch (e) {
      setError('Failed to reach server.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Team Workspace</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Manage members, permissions, and platform access.</p>
        </div>
        <button onClick={openNew} className="h-9 px-3 shrink-0 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-full sm:w-1/3">User Identity</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Role</th>
              <th className="hidden md:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Status</th>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
             {team.map(member => (
               <tr key={member.id} onClick={() => openEdit(member)} className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                 <td className="px-4 sm:px-6 py-4 align-middle min-w-0">
                   <div className="flex items-center gap-3 min-w-0">
                     <div className="w-8 h-8 rounded-full border border-white/[0.05] bg-white/[0.02] flex items-center justify-center shrink-0">
                       <Users className="w-4 h-4 text-neutral-400" />
                     </div>
                     <div className="min-w-0">
                       <div className="text-[13px] font-medium text-white mb-0.5 group-hover:text-emerald-400 transition-colors truncate">{member.username}</div>
                       <div className="text-[11px] font-mono text-neutral-500 truncate">{member.id}</div>
                       <div className="sm:hidden mt-1 flex items-center gap-1.5 min-w-0">
                         {member.role === 'TENANT_ADMIN' && <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                         <span className={`text-[10px] font-medium truncate ${member.role === 'TENANT_ADMIN' ? 'text-indigo-300' : 'text-neutral-400'}`}>
                           {member.role ? member.role.replace('_', ' ') : 'USER'}
                         </span>
                       </div>
                     </div>
                   </div>
                 </td>
                 <td className="hidden sm:table-cell px-6 py-4 align-middle">
                   <div className="flex items-center gap-1.5 min-w-0">
                     {member.role === 'TENANT_ADMIN' && <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                     <span className={`text-[12px] font-medium truncate ${member.role === 'TENANT_ADMIN' ? 'text-indigo-300' : 'text-neutral-400'}`}>
                       {member.role ? member.role.replace('_', ' ') : 'USER'}
                     </span>
                   </div>
                 </td>
                 <td className="hidden md:table-cell px-6 py-4 align-middle">
                   <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                     Active
                   </span>
                 </td>
                 <td className="px-4 sm:px-6 py-4 text-right align-middle shrink-0">
                   <button onClick={(e) => { e.stopPropagation(); openEdit(member); }} className="p-1.5 hover:bg-white/[0.1] rounded text-neutral-400 hover:text-white transition-colors opacity-100 sm:opacity-0 group-hover:opacity-100">
                     <MoreHorizontal className="w-4 h-4" />
                   </button>
                 </td>
               </tr>
             ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedMember ? "Edit Member" : "Invite Member"}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
            <div className="space-y-5 flex-1">
              
              {error && (
                <div className="p-3 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[12px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Username</label>
                <input 
                  type="text" 
                  value={newUsername} 
                  onChange={e=>setNewUsername(e.target.value)} 
                  required 
                  className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" 
                  placeholder="johndoe" 
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                  {selectedMember ? "New Password (leave blank to keep current)" : "Temporary Password"}
                </label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e=>setNewPassword(e.target.value)} 
                  required={!selectedMember}
                  className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" 
                />
              </div>

              <p className="text-[12px] text-neutral-500">
                New users are granted standard access by default. They can manage transactions, clients, and view reports, but cannot access Settings or Team Workspace.
              </p>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
              {selectedMember && selectedMember.id !== user?.id ? (
                <button 
                  type="button" 
                  onClick={() => handleDelete(selectedMember.id)} 
                  className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors"
                >
                  Remove Member
                </button>
              ) : <div />}
              
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : (selectedMember ? 'Save Changes' : 'Invite Member')}
                </button>
              </div>
            </div>
        </form>
      </Drawer>
    </div>
  );
}
