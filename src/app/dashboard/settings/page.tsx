"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Tag, Briefcase, Plus, Trash2 } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { confirmModal } from '@/components/ui/Dialog';

export default function SettingsPage() {
  const { user, tenant } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [newCat, setNewCat] = useState('');
  
  const [appMode, setAppMode] = useState('Standard');

  useEffect(() => {
    if (user?.role !== 'TENANT_ADMIN') { setLoading(false); return; }
    if (tenant) setAppMode(tenant.appMode || 'Standard');
    
    const fetchCats = async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) setCategories((await res.json()).categories);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchCats();
  }, [user, tenant]);

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  if (user?.role !== 'TENANT_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h2 className="text-[18px] font-semibold text-white mb-2">Access Denied</h2>
        <p className="text-[14px] text-neutral-400">Only workspace administrators can manage global settings.</p>
      </div>
    );
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat) return;
    try {
      const res = await fetch('/api/categories', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: newCat }) });
      if (res.ok) {
        setNewCat('');
        const fres = await fetch('/api/categories');
        if (fres.ok) setCategories((await fres.json()).categories);
      }
    } catch(e) {}
  };

  const deleteCategory = async (id: string) => {
    const ok = await confirmModal({
      title: 'Delete Category',
      message: 'Are you sure you want to delete this category?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const fres = await fetch('/api/categories');
        if (fres.ok) setCategories((await fres.json()).categories);
      }
    } catch(e) {}
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-6xl space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">Workspace Settings</h1>
        <p className="text-[13px] text-neutral-400">Manage preferences, categories, and platform terminology.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Application Operating Mode (Permanent) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-2">
             <Briefcase className="w-4 h-4 text-neutral-400" />
             <h2 className="text-[14px] font-semibold text-white tracking-tight">Organization Operating Mode</h2>
          </div>
          <p className="text-[13px] text-neutral-400">The operating mode for this workspace was established during organization creation and is permanently locked.</p>
          <div className="flex flex-wrap items-center gap-3">
             <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] text-[13px] font-medium text-white">
               <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
               {appMode.replace('_', ' ')}
               <span className="text-[11px] text-neutral-500 font-mono">· Permanent</span>
             </div>
             {appMode === 'Agency' && (
               <Link href="/dashboard/agency/settings" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[12.5px] font-medium hover:bg-emerald-500/20 transition-colors">
                 Open Agency Settings &rarr;
               </Link>
             )}
          </div>
        </section>

        {/* Categories */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.05] pb-2">
             <Tag className="w-4 h-4 text-neutral-400" />
             <h2 className="text-[14px] font-semibold text-white tracking-tight">Transaction Categories</h2>
          </div>
          <p className="text-[13px] text-neutral-400">Define the core buckets for your income and expenses to enable accurate reporting and budgeting.</p>
          
          <form onSubmit={addCategory} className="flex items-center gap-2 max-w-sm">
             <input type="text" value={newCat} onChange={e=>setNewCat(e.target.value)} required placeholder="e.g. Software Subscriptions" className="flex-1 h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-3 text-[13px] text-white focus:border-white/[0.2] outline-none" />
             <button type="submit" className="h-9 px-3 bg-white/[0.05] text-white rounded-md text-[13px] font-medium border border-white/[0.1] hover:bg-white/[0.1] transition-colors"><Plus className="w-4 h-4"/></button>
          </form>

          <div className="rounded-lg border border-white/[0.05] bg-[#0a0a0a] overflow-hidden max-w-lg">
             <ul className="divide-y divide-white/[0.02]">
               {categories.map(c => (
                 <li key={c.id} className="flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors">
                   <span className="text-[13px] font-medium text-neutral-200">{c.name}</span>
                   <button onClick={() => deleteCategory(c.id)} className="text-neutral-500 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4"/></button>
                 </li>
               ))}
               {categories.length === 0 && (
                 <li className="p-4 text-[13px] text-neutral-500 text-center">No categories defined.</li>
               )}
             </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
