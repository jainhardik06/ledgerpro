"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Repeat, Plus, Calendar, ArrowUpRight, ArrowDownRight, Search, Filter } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

export default function RecurringPage() {
  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [search, setSearch] = useState('');
  
  // Filter Popover States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'Credit' | 'Debit'>('all');
  const [filterAccountId, setFilterAccountId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterInterval, setFilterInterval] = useState<'all' | 'Daily' | 'Weekly' | 'Monthly'>('all');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');

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

  const isFilterActive = 
    filterType !== 'all' || 
    filterAccountId !== 'all' || 
    filterCategory !== 'all' || 
    filterInterval !== 'all' || 
    filterMinAmount !== '' || 
    filterMaxAmount !== '';

  const clearFilters = () => {
    setFilterType('all');
    setFilterAccountId('all');
    setFilterCategory('all');
    setFilterInterval('all');
    setFilterMinAmount('');
    setFilterMaxAmount('');
  };

  const filtered = recurring.filter(item => {
    // 1. Search text filter
    const matchesSearch = 
      item.description.toLowerCase().includes(search.toLowerCase()) || 
      item.category?.toLowerCase().includes(search.toLowerCase()) ||
      item.amount.toString().includes(search);
    if (!matchesSearch) return false;

    // 2. Type filter
    if (filterType !== 'all' && item.type !== filterType) return false;

    // 3. Account filter
    if (filterAccountId !== 'all' && item.accountId !== filterAccountId) return false;

    // 4. Category filter
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;

    // 5. Interval filter
    if (filterInterval !== 'all' && item.interval !== filterInterval) return false;

    // 6. Min / Max Amount filter
    if (filterMinAmount !== '' && item.amount < Number(filterMinAmount)) return false;
    if (filterMaxAmount !== '' && item.amount > Number(filterMaxAmount)) return false;

    return true;
  });

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Subscriptions & Obligations</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Automate recurring revenue and fixed expenses.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none min-w-0">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-full sm:w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>

          <div className="relative shrink-0">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className={`h-9 px-3 border rounded-md text-[13px] font-medium flex items-center gap-2 transition-colors ${
                isFilterActive || isFilterOpen
                  ? 'bg-white text-black border-white'
                  : 'border-white/[0.1] text-white hover:bg-white/[0.02]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Filter</span>
              {isFilterActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 sm:right-auto mt-2 w-[280px] sm:w-80 bg-[#0a0a0a] border border-white/[0.08] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-4 sm:p-5 z-50 space-y-4 text-left animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between border-b border-white/[0.05] pb-2">
                  <span className="text-[12px] font-semibold text-white">Filters</span>
                  {isFilterActive && (
                    <button 
                      onClick={clearFilters}
                      className="text-[10px] font-semibold text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Filter by Type */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Type</label>
                  <div className="flex p-0.5 bg-white/[0.02] border border-white/[0.05] rounded-md">
                    <button 
                      type="button" 
                      onClick={() => setFilterType('all')} 
                      className={`flex-1 py-1.5 sm:py-1 text-[11px] font-medium rounded transition-colors ${filterType === 'all' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}
                    >
                      All
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setFilterType('Credit')} 
                      className={`flex-1 py-1.5 sm:py-1 text-[11px] font-medium rounded transition-colors ${filterType === 'Credit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}
                    >
                      Income
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setFilterType('Debit')} 
                      className={`flex-1 py-1.5 sm:py-1 text-[11px] font-medium rounded transition-colors ${filterType === 'Debit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}
                    >
                      Expense
                    </button>
                  </div>
                </div>

                {/* Filter by Interval */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Interval</label>
                  <select 
                    value={filterInterval} 
                    onChange={e => setFilterInterval(e.target.value as any)} 
                    className="w-full h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[12px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]"
                  >
                    <option value="all">All Intervals</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                {/* Filter by Account */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Account</label>
                  <select 
                    value={filterAccountId} 
                    onChange={e => setFilterAccountId(e.target.value)} 
                    className="w-full h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[12px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]"
                  >
                    <option value="all">All Accounts</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by Category */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Category</label>
                  <select 
                    value={filterCategory} 
                    onChange={e => setFilterCategory(e.target.value)} 
                    className="w-full h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[12px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Min / Max Amount */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Amount Range (₹)</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      placeholder="Min" 
                      value={filterMinAmount}
                      onChange={e => setFilterMinAmount(e.target.value)}
                      className="w-1/2 h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2.5 text-[12px] text-white placeholder:text-neutral-700 focus:border-white/[0.2] outline-none"
                    />
                    <input 
                      type="number" 
                      placeholder="Max" 
                      value={filterMaxAmount}
                      onChange={e => setFilterMaxAmount(e.target.value)}
                      className="w-1/2 h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2.5 text-[12px] text-white placeholder:text-neutral-700 focus:border-white/[0.2] outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-white/[0.05]">
                  <button 
                    onClick={() => setIsFilterOpen(false)}
                    className="px-4 py-2 sm:px-3 sm:py-1.5 bg-white text-black text-[12px] sm:text-[11px] font-semibold rounded hover:bg-neutral-200 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={openNew} className="h-9 px-3 shrink-0 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Schedule</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-full sm:w-1/3">Schedule</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Interval</th>
              <th className="hidden md:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Next Run</th>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right shrink-0">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {filtered.length === 0 ? (
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
               filtered.map(item => (
                 <tr key={item.id} onClick={() => openEdit(item)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                   <td className="px-4 sm:px-6 py-4 align-middle max-w-[200px] sm:max-w-none">
                     <div className="flex items-center gap-3 min-w-0">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${item.type === 'Credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/[0.02] border-white/[0.05] text-neutral-400'}`}>
                         {item.type === 'Credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                       </div>
                       <div className="flex flex-col min-w-0">
                         <div className="text-[13px] font-medium text-white group-hover:text-emerald-400 transition-colors truncate">{item.description}</div>
                         <div className="text-[11px] text-neutral-500 mt-0.5 truncate flex items-center gap-1.5">
                           <span className="truncate">{item.category || 'Uncat.'}</span>
                           <span className="sm:hidden shrink-0">•</span>
                           <span className="sm:hidden shrink-0">{item.interval}</span>
                           <span className="md:hidden shrink-0">•</span>
                           <span className="md:hidden shrink-0">{item.nextRunDate.substring(5)}</span>
                         </div>
                       </div>
                     </div>
                   </td>
                   <td className="hidden sm:table-cell px-6 py-4 align-middle">
                     <span className="inline-flex px-2 py-0.5 rounded border border-white/[0.05] bg-white/[0.02] text-[11px] font-medium text-neutral-300">
                       {item.interval}
                     </span>
                   </td>
                   <td className="hidden md:table-cell px-6 py-4 align-middle">
                     <span className="text-[12px] text-neutral-300 font-mono flex items-center gap-1.5"><Calendar className="w-3 h-3"/> {item.nextRunDate}</span>
                   </td>
                   <td className="px-4 sm:px-6 py-4 text-right shrink-0 align-middle">
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
