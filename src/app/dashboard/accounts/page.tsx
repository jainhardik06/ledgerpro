"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Wallet, Building2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Select } from '@/components/ui/Select';
import { Req, Opt } from '@/components/ui/Req';
import { confirmModal } from '@/components/ui/Dialog';

export default function AccountsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

  // Form States
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState('Checking');
  const [accBalance, setAccBalance] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleOpen = () => openNew();
    window.addEventListener('open-new-account', handleOpen);
    return () => window.removeEventListener('open-new-account', handleOpen);
  }, []);

  async function fetchData() {
    try {
      const [accRes, txRes] = await Promise.all([
        fetch('/api/accounts'), fetch('/api/transactions')
      ]);
      if (accRes.ok) setAccounts((await accRes.json()).accounts);
      if (txRes.ok) setTransactions((await txRes.json()).transactions);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      setFormError('Account name is required.');
      return;
    }
    const parsedBalance = Number(accBalance);
    if (accBalance.trim() === '' || isNaN(parsedBalance)) {
      setFormError('Please enter a valid initial balance.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const url = selectedAccount ? `/api/accounts/${selectedAccount.id}` : '/api/accounts';
      const method = selectedAccount ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: accName.trim(), type: accType, initialBalance: parsedBalance })
      });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Failed to save account.');
      }
    } catch (e) {
      console.error(e);
      setFormError('Network error while saving account.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmModal({
      title: 'Delete Account',
      message: 'Are you sure you want to delete this account? Ensure no transactions are tied to it.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      }
    } catch (e) {}
  };

  function openNew() {
    setSelectedAccount(null);
    setAccName('');
    setAccType('Checking');
    setAccBalance('0');
    setFormError(null);
    setIsDrawerOpen(true);
  }

  const openEdit = (acc: any) => {
    setSelectedAccount(acc);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccBalance(acc.initialBalance.toString());
    setFormError(null);
    setIsDrawerOpen(true);
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-1">Financial Infrastructure</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Manage bank accounts, wallets, and cash reserves.</p>
        </div>
        <button id="add-account-btn" onClick={openNew} className="h-9 px-4 shrink-0 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Add Account
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {accounts.map(acc => {
          const accTxs = transactions.filter(t => t.accountId === acc.id);
          const cr = accTxs.filter(t => t.type === 'Credit').reduce((s, t) => s + t.amount, 0);
          const dr = accTxs.filter(t => t.type === 'Debit').reduce((s, t) => s + t.amount, 0);
          const currentBalance = acc.initialBalance + cr - dr;

          return (
            <div key={acc.id} onClick={() => openEdit(acc)} className="p-4 sm:p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors cursor-pointer group flex flex-col min-w-0">
               <div className="flex items-center justify-between mb-5 sm:mb-6">
                  <div className="flex items-center gap-3 min-w-0">
                     <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                        {acc.type === 'Checking' ? <Building2 className="w-5 h-5 text-neutral-400" /> : <Wallet className="w-5 h-5 text-neutral-400" />}
                     </div>
                     <div className="min-w-0">
                       <div className="text-[13px] sm:text-[14px] font-semibold text-white truncate">{acc.name}</div>
                       <div className="text-[10px] sm:text-[11px] font-medium text-neutral-500 tracking-widest uppercase truncate">{acc.type}</div>
                     </div>
                  </div>
               </div>
               
               <div className="flex flex-col gap-1 min-w-0">
                 <div className="text-[11px] sm:text-[12px] font-medium text-neutral-500">Current Balance</div>
                 <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-white tabular-nums truncate">{formatCurrency(currentBalance)}</div>
               </div>
            </div>
          );
        })}
        {accounts.length === 0 && (
           <div className="col-span-full p-12 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                <Wallet className="w-5 h-5 text-neutral-500" />
             </div>
             <p className="text-[14px] text-white font-medium mb-1">No infrastructure configured</p>
             <p className="text-[13px] text-neutral-500 max-w-sm mb-4">Add your first bank account or wallet to start managing your cash positions.</p>
             <button onClick={openNew} className="text-[13px] font-medium text-emerald-500 hover:text-emerald-400">Configure account &rarr;</button>
           </div>
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedAccount ? "Edit Account" : "Add Account"}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             {formError && (
               <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12.5px]">
                 {formError}
               </div>
             )}

             <div>
               <label htmlFor="acc-name" className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                 Account Name <Req satisfied={Boolean(accName.trim())} />
               </label>
               <input
                 id="acc-name"
                 type="text"
                 value={accName}
                 onChange={e => {
                   setAccName(e.target.value);
                   if (formError) setFormError(null);
                 }}
                 required
                 className={`w-full h-9 bg-transparent border-b text-[14px] text-white outline-none transition-colors ${
                   formError && !accName.trim()
                     ? 'border-rose-500/80 focus:border-rose-500'
                     : 'border-white/[0.1] focus:border-emerald-500'
                 }`}
                 placeholder="e.g. Chase Business Checking"
               />
             </div>

             <div>
               <label htmlFor="acc-type" className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                 Account Type <Req satisfied={Boolean(accType)} />
               </label>
               <Select
                 id="acc-type"
                 value={accType}
                 onChange={e => setAccType(e.target.value)}
                 className="w-full h-9"
               >
                 <option value="Checking">Checking</option>
                 <option value="Savings">Savings</option>
                 <option value="Credit Card">Credit Card</option>
                 <option value="Digital Wallet">Digital Wallet</option>
                 <option value="Cash">Cash</option>
               </Select>
             </div>

             <div>
               <label htmlFor="acc-balance" className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                 Initial Balance (₹) <Req satisfied={Boolean(accBalance.trim() !== '' && !isNaN(Number(accBalance)))} />
               </label>
               <input
                 id="acc-balance"
                 type="number"
                 value={accBalance}
                 onChange={e => {
                   setAccBalance(e.target.value);
                   if (formError) setFormError(null);
                 }}
                 required
                 step="0.01"
                 className={`w-full h-9 bg-white/[0.02] border rounded-md px-3 text-[13px] text-white outline-none tabular-nums transition-colors ${
                   formError && (accBalance.trim() === '' || isNaN(Number(accBalance)))
                     ? 'border-rose-500/80 focus:border-rose-500'
                     : 'border-white/[0.05] focus:border-white/[0.2]'
                 }`}
               />
               <p className="text-[11px] text-neutral-500 mt-1.5">The balance of the account before any transactions are recorded.</p>
             </div>
           </div>

           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             {selectedAccount ? (
               <button type="button" onClick={() => handleDelete(selectedAccount.id)} className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors">Delete account</button>
             ) : <div />}
             <div className="flex items-center gap-3">
               <button type="button" onClick={() => setIsDrawerOpen(false)} className="px-4 py-2 text-[13px] font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
               <button id="acc-save-btn" type="submit" disabled={saving} className="px-4 py-2 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50">
                 {saving ? 'Saving...' : 'Save Account'}
               </button>
             </div>
           </div>
        </form>
      </Drawer>

    </div>
  );
}
