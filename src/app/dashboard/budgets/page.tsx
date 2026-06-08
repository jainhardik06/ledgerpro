"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, PieChart, Plus, Target, AlertTriangle } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';

export default function BudgetsPage() {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);

  const [bCategory, setBCategory] = useState('');
  const [bLimit, setBLimit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleOpen = () => openNew();
    window.addEventListener('open-new-budget', handleOpen);
    return () => window.removeEventListener('open-new-budget', handleOpen);
  }, [categories]);

  const fetchData = async () => {
    try {
      const [budRes, txRes, catRes] = await Promise.all([
        fetch('/api/budgets'), fetch('/api/transactions'), fetch('/api/categories')
      ]);
      if (budRes.ok) setBudgets((await budRes.json()).budgets);
      if (txRes.ok) setTransactions((await txRes.json()).transactions);
      if (catRes.ok) setCategories((await catRes.json()).categories);
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
      const url = selectedBudget ? `/api/budgets/${selectedBudget.id}` : '/api/budgets';
      const method = selectedBudget ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: bCategory, limitAmount: Number(bLimit), month: new Date().toISOString().substring(0, 7) })
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
    if (!confirm('Delete this budget?')) return;
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      }
    } catch (e) {}
  };

  const openNew = () => {
    setSelectedBudget(null);
    setBCategory('');
    setBLimit('');
    setIsDrawerOpen(true);
  };

  const openEdit = (bud: any) => {
    setSelectedBudget(bud);
    setBCategory(bud.category);
    setBLimit(bud.limitAmount.toString());
    setIsDrawerOpen(true);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  const currentMonthPrefix = new Date().toISOString().substring(0, 7);
  const currentMonthTxs = transactions.filter(t => t.type === 'Debit' && t.date.startsWith(currentMonthPrefix));

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-500 w-full overflow-hidden">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-1">Budget Planning</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Forecast and enforce spending limits across categories.</p>
        </div>
        <button onClick={openNew} className="h-9 px-4 shrink-0 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Create Budget
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {budgets.map(bud => {
          const spent = currentMonthTxs.filter(t => t.category === bud.category).reduce((s, t) => s + t.amount, 0);
          const percent = bud.limitAmount > 0 ? (spent / bud.limitAmount) * 100 : 0;
          const isWarning = percent >= 80 && percent < 100;
          const isDanger = percent >= 100;

          return (
            <div key={bud.id} onClick={() => openEdit(bud)} className="p-4 sm:p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors cursor-pointer group flex flex-col min-w-0">
               <div className="flex items-center justify-between mb-4 min-w-0 gap-2">
                  <div className="flex items-center gap-2 text-[12px] sm:text-[13px] font-medium text-white min-w-0">
                     <Target className="w-4 h-4 text-neutral-400 shrink-0" /> <span className="truncate">{bud.category}</span>
                  </div>
                  <div className="shrink-0">
                    {isDanger && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                    {isWarning && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  </div>
               </div>
               
               <div className="space-y-3 min-w-0">
                 <div className="flex items-end justify-between min-w-0 gap-2">
                   <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white tabular-nums truncate">{formatCurrency(spent)}</div>
                   <div className="text-[11px] sm:text-[12px] text-neutral-500 font-medium mb-1 shrink-0">of {formatCurrency(bud.limitAmount)}</div>
                 </div>

                 {/* Progress Bar */}
                 <div className="h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden shrink-0">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${Math.min(percent, 100)}%` }} 
                    />
                 </div>
                 
                 <div className="text-[10px] sm:text-[11px] font-medium text-neutral-500 flex justify-between min-w-0 gap-2">
                   <span className="truncate">{percent.toFixed(1)}% consumed</span>
                   <span className="truncate">{bud.limitAmount - spent >= 0 ? formatCurrency(bud.limitAmount - spent) + ' left' : formatCurrency(spent - bud.limitAmount) + ' over'}</span>
                 </div>
               </div>
            </div>
          );
        })}
        {budgets.length === 0 && (
           <div className="col-span-full p-12 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                <PieChart className="w-5 h-5 text-neutral-500" />
             </div>
             <p className="text-[14px] text-white font-medium mb-1">No active budgets</p>
             <p className="text-[13px] text-neutral-500 max-w-sm mb-4">Establish spending limits for specific categories to keep your expenses in check.</p>
             <button onClick={openNew} className="text-[13px] font-medium text-emerald-500 hover:text-emerald-400">Set up budget &rarr;</button>
           </div>
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedBudget ? "Edit Budget" : "New Budget"}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Category</label>
               <select value={bCategory} onChange={e=>setBCategory(e.target.value)} required className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-2 text-[13px] text-white focus:border-white/[0.2] outline-none [&>option]:bg-[#000000]">
                 <option value="">Select a category</option>
                 {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
               </select>
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Monthly Limit (₹)</label>
               <input type="number" value={bLimit} onChange={e=>setBLimit(e.target.value)} required min="1" step="0.01" className="w-full h-12 bg-transparent border-b border-white/[0.1] text-3xl font-semibold text-white focus:border-emerald-500 outline-none tabular-nums" placeholder="0.00" />
             </div>
           </div>

           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             {selectedBudget ? (
               <button type="button" onClick={() => handleDelete(selectedBudget.id)} className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors">Delete budget</button>
             ) : <div />}
             <div className="flex items-center gap-3">
               <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
               <button type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                 {saving ? 'Saving...' : 'Save Budget'}
               </button>
             </div>
           </div>
        </form>
      </Drawer>

    </div>
  );
}
