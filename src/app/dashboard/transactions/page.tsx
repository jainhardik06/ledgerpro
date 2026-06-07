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

  const filtered = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) || 
    t.category?.toLowerCase().includes(search.toLowerCase()) ||
    t.amount.toString().includes(search)
  );

  if (loading) {
    return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] animate-in fade-in duration-500">
      
      {/* Action Bar */}
      <div className="p-6 shrink-0 border-b border-white/[0.05] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Transactions</h1>
          <p className="text-[13px] text-neutral-400">Manage, categorize, and audit your financial records.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search transactions..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 bg-[#0a0a0a] border border-white/[0.1] rounded-md pl-9 pr-3 text-[13px] text-white focus:border-white/[0.2] outline-none"
            />
          </div>
          <button className="h-9 px-3 border border-white/[0.1] rounded-md text-[13px] font-medium text-white hover:bg-white/[0.02] flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" /> Filter
          </button>
          <button onClick={openNew} className="h-9 px-3 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Record
          </button>
        </div>
      </div>

      {/* Edge-to-edge Data Table */}
      <div className="flex-1 overflow-auto bg-[#000000]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#0a0a0a] z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
            <tr>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest w-1/3">Transaction</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Category</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Date</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Account</th>
              <th className="px-6 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-widest text-right">Amount</th>
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
                   <td className="px-6 py-3">
                     <div className="flex items-center gap-3">
                       <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${tx.type === 'Credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/[0.02] border-white/[0.05] text-neutral-400'}`}>
                         {tx.type === 'Credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                       </div>
                       <div className="text-[13px] font-medium text-white group-hover:text-emerald-400 transition-colors">{tx.description}</div>
                     </div>
                   </td>
                   <td className="px-6 py-3">
                     <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/[0.05] bg-white/[0.02] text-[11px] font-medium text-neutral-400">
                       <Tag className="w-3 h-3" /> {tx.category || 'Uncategorized'}
                     </span>
                   </td>
                   <td className="px-6 py-3">
                     <span className="text-[12px] text-neutral-500 font-mono flex items-center gap-1.5"><Calendar className="w-3 h-3"/> {tx.date}</span>
                   </td>
                   <td className="px-6 py-3">
                     <span className="text-[12px] text-neutral-400">{accounts.find(a=>a.id===tx.accountId)?.name || 'Unknown'}</span>
                   </td>
                   <td className="px-6 py-3 text-right">
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
