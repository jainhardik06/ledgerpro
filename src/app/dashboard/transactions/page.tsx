"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, Plus, FileSpreadsheet, ArrowDownRight, ArrowUpRight, Filter, MoreHorizontal, FileText, Calendar, Tag } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [search, setSearch] = useState('');
  
  // Filter Popover States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'Credit' | 'Debit'>('all');
  const [filterAccountId, setFilterAccountId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'this-month' | 'last-30' | 'this-year'>('all');
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  
  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  // Form States
  const [txType, setTxType] = useState<'Credit'|'Debit'>('Debit');
  const [txAmount, setTxAmount] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txCategory, setTxCategory] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleOpen = () => openNew();
    window.addEventListener('open-new-transaction', handleOpen);
    return () => window.removeEventListener('open-new-transaction', handleOpen);
  }, [accounts]);

  const fetchData = async () => {
    try {
      const [txRes, catRes, accRes] = await Promise.all([
        fetch('/api/transactions'), fetch('/api/categories'), fetch('/api/accounts')
      ]);
      if (txRes.ok) setTransactions((await txRes.json()).transactions);
      if (catRes.ok) setCategories((await catRes.json()).categories);
      if (accRes.ok) {
        const accs = (await accRes.json()).accounts;
        setAccounts(accs);
        if (accs.length > 0 && !txAccountId) setTxAccountId(accs[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = selectedTx ? `/api/transactions/${selectedTx.id}` : '/api/transactions';
      const method = selectedTx ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: txType, amount: Number(txAmount), description: txDesc, date: txDate, category: txCategory, accountId: txAccountId, notes: txNotes })
      });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openNew = () => {
    setSelectedTx(null);
    setTxType('Debit');
    setTxAmount('');
    setTxDesc('');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxCategory('');
    setTxNotes('');
    setIsDrawerOpen(true);
  };

  const openEdit = (tx: any) => {
    setSelectedTx(tx);
    setTxType(tx.type);
    setTxAmount(tx.amount.toString());
    setTxDesc(tx.description);
    setTxDate(tx.date);
    setTxCategory(tx.category || '');
    setTxAccountId(tx.accountId);
    setTxNotes(tx.notes || '');
    setIsDrawerOpen(true);
  };

  const isFilterActive = 
    filterType !== 'all' || 
    filterAccountId !== 'all' || 
    filterCategory !== 'all' || 
    filterDateRange !== 'all' || 
    filterMinAmount !== '' || 
    filterMaxAmount !== '';

  const clearFilters = () => {
    setFilterType('all');
    setFilterAccountId('all');
    setFilterCategory('all');
    setFilterDateRange('all');
    setFilterMinAmount('');
    setFilterMaxAmount('');
  };

  const filtered = transactions.filter(t => {
    // 1. Search text filter
    const matchesSearch = 
      t.description.toLowerCase().includes(search.toLowerCase()) || 
      t.category?.toLowerCase().includes(search.toLowerCase()) ||
      t.amount.toString().includes(search);
    if (!matchesSearch) return false;

    // 2. Type filter
    if (filterType !== 'all' && t.type !== filterType) return false;

    // 3. Account filter
    if (filterAccountId !== 'all' && t.accountId !== filterAccountId) return false;

    // 4. Category filter
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;

    // 5. Min / Max Amount filter
    if (filterMinAmount !== '' && t.amount < Number(filterMinAmount)) return false;
    if (filterMaxAmount !== '' && t.amount > Number(filterMaxAmount)) return false;

    // 6. Date Range filter
    if (filterDateRange !== 'all') {
      const txDate = new Date(t.date);
      const now = new Date();
      if (filterDateRange === 'this-month') {
        const currentMonthPrefix = now.toISOString().substring(0, 7);
        if (!t.date.startsWith(currentMonthPrefix)) return false;
      } else if (filterDateRange === 'last-30') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      } else if (filterDateRange === 'this-year') {
        const currentYear = now.getFullYear().toString();
        if (!t.date.startsWith(currentYear)) return false;
      }
    }

    return true;
  });

  if (loading) {
    return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Action Bar */}
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Transactions</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Manage, categorize, and audit your financial records.</p>
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
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Transaction Type</label>
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

                {/* Filter by Date Range */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Date Period</label>
                  <select 
                    value={filterDateRange} 
                    onChange={e => setFilterDateRange(e.target.value as any)} 
                    className="w-full h-9 sm:h-8 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[12px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]"
                  >
                    <option value="all">All Time</option>
                    <option value="this-month">This Month</option>
                    <option value="last-30">Last 30 Days</option>
                    <option value="this-year">This Year</option>
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
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Record</span>
          </button>
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-full sm:w-1/3">Transaction</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Category</th>
              <th className="hidden sm:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Date</th>
              <th className="hidden md:table-cell px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Account</th>
              <th className="px-4 sm:px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right shrink-0">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {filtered.length === 0 ? (
               <tr>
                 <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                        <FileText className="w-5 h-5 text-neutral-500" />
                      </div>
                      <p className="text-[14px] text-white font-medium mb-1">No transactions found</p>
                      <p className="text-[13px] text-neutral-500 max-w-sm mb-4">Your transaction history will appear here. Create your first record to start tracking.</p>
                      <button onClick={openNew} className="text-[13px] font-medium text-emerald-500 hover:text-emerald-400">Create transaction &rarr;</button>
                    </div>
                 </td>
               </tr>
            ) : (
               filtered.map(tx => (
                 <tr key={tx.id} onClick={() => openEdit(tx)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                   <td className="px-4 sm:px-6 py-3 align-middle max-w-[200px] sm:max-w-none">
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${tx.type === 'Credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/[0.02] border-white/[0.05] text-neutral-400'}`}>
                         {tx.type === 'Credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                       </div>
                       <div className="flex flex-col min-w-0">
                         <span className="text-[13px] font-medium text-white group-hover:text-emerald-400 transition-colors truncate">{tx.description}</span>
                         <div className="flex sm:hidden items-center gap-1.5 mt-0.5 text-[11px] text-neutral-500">
                           <span className="shrink-0">{tx.date.substring(5)}</span>
                           <span className="shrink-0">•</span>
                           <span className="truncate">{tx.category || 'Uncat.'}</span>
                         </div>
                       </div>
                     </div>
                   </td>
                   <td className="hidden sm:table-cell px-6 py-3 align-middle">
                     <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.05] bg-white/[0.02] text-[11px] font-medium text-neutral-400">
                       <Tag className="w-3 h-3" /> {tx.category || 'Uncategorized'}
                     </span>
                   </td>
                   <td className="hidden sm:table-cell px-6 py-3 align-middle">
                     <span className="text-[12px] text-neutral-500 font-mono flex items-center gap-1.5"><Calendar className="w-3 h-3"/> {tx.date}</span>
                   </td>
                   <td className="hidden md:table-cell px-6 py-3 align-middle">
                     <span className="text-[12px] text-neutral-400">{accounts.find(a=>a.id===tx.accountId)?.name || 'Unknown'}</span>
                   </td>
                   <td className="px-4 sm:px-6 py-3 text-right shrink-0 align-middle">
                     <span className={`text-[13px] font-semibold tabular-nums ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-neutral-200'}`}>
                       {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                     </span>
                   </td>
                 </tr>
               ))
            )}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedTx ? "Edit Transaction" : "New Transaction"}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             
             {/* Type Switcher */}
             <div className="flex p-1 bg-white/[0.02] border border-white/[0.05] rounded-lg">
               <button type="button" onClick={()=>setTxType('Debit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${txType==='Debit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Expense</button>
               <button type="button" onClick={()=>setTxType('Credit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${txType==='Credit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Income</button>
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Amount (₹)</label>
               <input type="number" value={txAmount} onChange={e=>setTxAmount(e.target.value)} required min="0" step="0.01" className="w-full h-12 bg-transparent border-b border-white/[0.1] text-3xl font-semibold text-white focus:border-emerald-500 outline-none tabular-nums" placeholder="0.00" />
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Description</label>
               <input type="text" value={txDesc} onChange={e=>setTxDesc(e.target.value)} required className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none placeholder:text-neutral-700" placeholder="e.g. Server Hosting" />
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Date</label>
                 <input type="date" value={txDate} onChange={e=>setTxDate(e.target.value)} required className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-3 text-[13px] text-white focus:border-white/[0.2] outline-none" />
               </div>
               <div>
                 <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Account</label>
                 <select value={txAccountId} onChange={e=>setTxAccountId(e.target.value)} required className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]">
                   {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                 </select>
               </div>
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Category</label>
               <select value={txCategory} onChange={e=>setTxCategory(e.target.value)} className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]">
                 <option value="">Uncategorized</option>
                 {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
               </select>
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Notes (Optional)</label>
               <textarea value={txNotes} onChange={e=>setTxNotes(e.target.value)} rows={3} className="w-full bg-white/[0.02] border border-white/[0.05] rounded-md p-3 text-[13px] text-white focus:border-white/[0.2] outline-none resize-none" placeholder="Add context to this transaction..." />
             </div>
           </div>

           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             {selectedTx ? (
               <button type="button" onClick={() => handleDelete(selectedTx.id)} className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors">Delete record</button>
             ) : <div />}
             <div className="flex items-center gap-3">
               <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
               <button type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                 {saving ? 'Saving...' : 'Save Record'}
               </button>
             </div>
           </div>
        </form>
      </Drawer>

    </div>
  );
}
