"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Repeat, Plus, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

export default function RecurringPage() {
  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const [rType, setRType] = useState<'Credit'|'Debit'>('Debit');
  const [rAmount, setRAmount] = useState('');
  const [rDesc, setRDesc] = useState('');
  const [rInterval, setRInterval] = useState<'Daily'|'Weekly'|'Monthly'>('Monthly');
  const [rNextRun, setRNextRun] = useState(new Date().toISOString().split('T')[0]);
  const [rCategory, setRCategory] = useState('');
  const [rAccountId, setRAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [recRes, accRes, catRes] = await Promise.all([
        fetch('/api/recurring'), fetch('/api/accounts'), fetch('/api/categories')
      ]);
      if (recRes.ok) setRecurring((await recRes.json()).recurring);
      if (accRes.ok) {
        const accs = (await accRes.json()).accounts;
        setAccounts(accs);
        if (accs.length > 0 && !rAccountId) setRAccountId(accs[0].id);
      }
      if (catRes.ok) setCategories((await catRes.json()).categories);
    } catch (e) {} finally { setLoading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = selectedItem ? `/api/recurring/${selectedItem.id}` : '/api/recurring';
      const method = selectedItem ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: rType, amount: Number(rAmount), description: rDesc, interval: rInterval, nextRunDate: rNextRun, category: rCategory, accountId: rAccountId })
      });
      if (res.ok) { setIsDrawerOpen(false); fetchData(); }
    } catch (e) {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recurring transaction?')) return;
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
      if (res.ok) { setIsDrawerOpen(false); fetchData(); }
    } catch (e) {}
  };

  const openNew = () => {
    setSelectedItem(null);
    setRType('Debit'); setRAmount(''); setRDesc(''); setRInterval('Monthly'); setRNextRun(new Date().toISOString().split('T')[0]); setRCategory('');
    setIsDrawerOpen(true);
  };

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setRType(item.type); setRAmount(item.amount.toString()); setRDesc(item.description); setRInterval(item.interval); setRNextRun(item.nextRunDate); setRCategory(item.category || ''); setRAccountId(item.accountId);
    setIsDrawerOpen(true);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Subscriptions & Obligations</h1>
          <p className="text-[13px] text-neutral-400">Automate recurring revenue and fixed expenses.</p>
        </div>
        <button onClick={openNew} className="h-9 px-3 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">Schedule</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Interval</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Next Run</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {recurring.length === 0 ? (
               <tr>
                 <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                        <Repeat className="w-5 h-5 text-neutral-500" />
                      </div>
                      <p className="text-[14px] text-white font-medium mb-1">No scheduled obligations</p>
                      <p className="text-[13px] text-neutral-500 max-w-sm mb-4">Automate your fixed SaaS subscriptions, rent, or recurring retainers.</p>
                      <button onClick={openNew} className="text-[13px] font-medium text-emerald-500 hover:text-emerald-400">Set up schedule &rarr;</button>
                    </div>
                 </td>
               </tr>
            ) : (
               recurring.map(item => (
                 <tr key={item.id} onClick={() => openEdit(item)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                   <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${item.type === 'Credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/[0.02] border-white/[0.05] text-neutral-400'}`}>
                         {item.type === 'Credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                       </div>
                       <div>
                         <div className="text-[13px] font-medium text-white group-hover:text-emerald-400 transition-colors">{item.description}</div>
                         <div className="text-[11px] text-neutral-500 mt-0.5">{item.category || 'Uncategorized'}</div>
                       </div>
                     </div>
                   </td>
                   <td className="px-6 py-4">
                     <span className="inline-flex px-2 py-0.5 rounded border border-white/[0.05] bg-white/[0.02] text-[11px] font-medium text-neutral-300">
                       {item.interval}
                     </span>
                   </td>
                   <td className="px-6 py-4">
                     <span className="text-[12px] text-neutral-300 font-mono flex items-center gap-1.5"><Calendar className="w-3 h-3"/> {item.nextRunDate}</span>
                   </td>
                   <td className="px-6 py-4 text-right">
                     <span className={`text-[13px] font-semibold tabular-nums ${item.type === 'Credit' ? 'text-emerald-400' : 'text-neutral-200'}`}>
                       {item.type === 'Credit' ? '+' : '-'}₹{item.amount.toLocaleString()}
                     </span>
                   </td>
                 </tr>
               ))
            )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedItem ? "Edit Schedule" : "New Schedule"}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             <div className="flex p-1 bg-white/[0.02] border border-white/[0.05] rounded-lg">
               <button type="button" onClick={()=>setRType('Debit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${rType==='Debit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Fixed Expense</button>
               <button type="button" onClick={()=>setRType('Credit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${rType==='Credit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Recurring Income</button>
             </div>
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Amount (₹)</label>
               <input type="number" value={rAmount} onChange={e=>setRAmount(e.target.value)} required min="1" step="0.01" className="w-full h-12 bg-transparent border-b border-white/[0.1] text-3xl font-semibold text-white focus:border-emerald-500 outline-none tabular-nums" placeholder="0.00" />
             </div>
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Description</label>
               <input type="text" value={rDesc} onChange={e=>setRDesc(e.target.value)} required className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" placeholder="e.g. Notion Subscription" />
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Interval</label>
                 <select value={rInterval} onChange={e=>setRInterval(e.target.value as any)} className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white outline-none [&>option]:bg-[#000000]">
                   <option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option>
                 </select>
               </div>
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Next Run Date</label>
                 <input type="date" value={rNextRun} onChange={e=>setRNextRun(e.target.value)} required className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-3 text-[13px] text-white outline-none" />
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Account</label>
                 <select value={rAccountId} onChange={e=>setRAccountId(e.target.value)} required className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white outline-none [&>option]:bg-[#000000]">
                   {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Category</label>
                 <select value={rCategory} onChange={e=>setRCategory(e.target.value)} className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white outline-none [&>option]:bg-[#000000]">
                   <option value="">Uncategorized</option>
                   {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                 </select>
               </div>
             </div>
           </div>

           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             {selectedItem ? (
               <button type="button" onClick={() => handleDelete(selectedItem.id)} className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors">Delete schedule</button>
             ) : <div />}
             <div className="flex items-center gap-3">
               <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
               <button type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                 {saving ? 'Saving...' : 'Save Schedule'}
               </button>
             </div>
           </div>
        </form>
      </Drawer>

    </div>
  );
}
