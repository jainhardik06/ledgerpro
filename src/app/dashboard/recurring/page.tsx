"use client";

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Repeat, Plus, Calendar, ArrowUpRight, ArrowDownRight, Search, Filter } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { confirmModal } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Req, Opt } from '@/components/ui/Req';
import { FilterPopover } from '@/components/ui/FilterPopover';
import { SearchBar } from '@/components/ui/SearchBar';

export default function RecurringPage() {
  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [search, setSearch] = useState('');
  
  // Filter Popover States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
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
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
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
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(rAmount);
    if (!rAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid amount greater than zero.');
      return;
    }
    if (!rDesc.trim()) {
      setFormError('Description is required.');
      return;
    }
    if (!rNextRun) {
      setFormError('Next run date is required.');
      return;
    }
    if (!rAccountId) {
      setFormError('Please select an account.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const url = selectedItem ? `/api/recurring/${selectedItem.id}` : '/api/recurring';
      const method = selectedItem ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: rType, amount: parsedAmount, description: rDesc.trim(), interval: rInterval, nextRunDate: rNextRun, category: rCategory, accountId: rAccountId })
      });
      if (res.ok) {
        setIsDrawerOpen(false);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Failed to save recurring schedule.');
      }
    } catch (e) {
      setFormError('Network error while saving recurring schedule.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmModal({
      title: 'Delete Recurring Transaction',
      message: 'Are you sure you want to delete this recurring transaction? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
      if (res.ok) { setIsDrawerOpen(false); fetchData(); }
    } catch (e) {}
  };

  function openNew() {
    setSelectedItem(null);
    setRType('Debit'); setRAmount(''); setRDesc(''); setRInterval('Monthly'); setRNextRun(new Date().toISOString().split('T')[0]); setRCategory('');
    setFormError(null);
    setIsDrawerOpen(true);
  }

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setRType(item.type); setRAmount(item.amount.toString()); setRDesc(item.description); setRInterval(item.interval); setRNextRun(item.nextRunDate); setRCategory(item.category || ''); setRAccountId(item.accountId);
    setFormError(null);
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

  const activeFilterCount = [
    filterType !== 'all',
    filterAccountId !== 'all',
    filterCategory !== 'all',
    filterInterval !== 'all',
    filterMinAmount !== '',
    filterMaxAmount !== '',
  ].filter(Boolean).length;

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
    <div className="flex flex-col h-[calc(100vh-56px)] w-full animate-in fade-in duration-500">
      
      <div className="p-4 sm:p-6 shrink-0 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white mb-1">Subscriptions & Obligations</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Automate recurring revenue and fixed expenses.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <SearchBar
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recurring…"
            aria-label="Search recurring"
            wrapperClassName="flex-1 sm:w-64"
          />

          <div className="relative shrink-0">
            <button 
              ref={filterBtnRef}
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className={`h-9 px-3 border rounded-md text-[13px] font-medium flex items-center gap-2 transition-colors ${
                isFilterActive || isFilterOpen
                  ? 'bg-white text-black border-white shadow-sm'
                  : 'border-white/[0.1] text-white hover:bg-white/[0.02]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Filter</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-black text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <FilterPopover
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
              triggerRef={filterBtnRef}
              isFilterActive={isFilterActive}
              activeCount={activeFilterCount}
              onClearAll={clearFilters}
              title="Filter Obligations"
            >
              {/* Filter by Type */}
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">Type</label>
                <div className="flex p-0.5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                  <button 
                    type="button" 
                    onClick={() => setFilterType('all')} 
                    className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${filterType === 'all' ? 'bg-[#18181b] text-white shadow-sm border border-white/[0.08]' : 'text-neutral-500 hover:text-white'}`}
                  >
                    All
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFilterType('Credit')} 
                    className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${filterType === 'Credit' ? 'bg-[#18181b] text-white shadow-sm border border-white/[0.08]' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Income
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFilterType('Debit')} 
                    className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${filterType === 'Debit' ? 'bg-[#18181b] text-white shadow-sm border border-white/[0.08]' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Expense
                  </button>
                </div>
              </div>

              {/* Filter by Interval */}
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">Interval</label>
                <Select 
                  value={filterInterval} 
                  onChange={e => setFilterInterval(e.target.value as any)} 
                  className="w-full h-8.5 bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 text-[12px] text-white"
                >
                  <option value="all">All Intervals</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </Select>
              </div>

              {/* Filter by Account */}
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">Account</label>
                <Select 
                  value={filterAccountId} 
                  onChange={e => setFilterAccountId(e.target.value)} 
                  className="w-full h-8.5 bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 text-[12px] text-white"
                >
                  <option value="all">All Accounts</option>
                  {accounts.map((acc, idx) => {
                    const accId = acc.id || acc._id?.toString?.() || String(acc._id || `acc-${idx}`);
                    return <option key={accId} value={accId}>{acc.name}</option>;
                  })}
                </Select>
              </div>

              {/* Filter by Category */}
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">Category</label>
                <Select 
                  value={filterCategory} 
                  onChange={e => setFilterCategory(e.target.value)} 
                  className="w-full h-8.5 bg-white/[0.02] border border-white/[0.06] rounded-lg px-2.5 text-[12px] text-white"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat, idx) => {
                    const catKey = cat.id || cat._id?.toString?.() || cat.name || `cat-${idx}`;
                    return <option key={catKey} value={cat.name}>{cat.name}</option>;
                  })}
                </Select>
              </div>

              {/* Min / Max Amount */}
              <div className="space-y-1.5">
                <label className="block text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider">Amount Range (₹)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500">₹</span>
                    <input 
                      type="number" 
                      placeholder="Min" 
                      value={filterMinAmount}
                      onChange={e => setFilterMinAmount(e.target.value)}
                      className="w-full h-8.5 bg-white/[0.02] border border-white/[0.06] rounded-lg pl-6 pr-2.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-white/[0.2] outline-none"
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500">₹</span>
                    <input 
                      type="number" 
                      placeholder="Max" 
                      value={filterMaxAmount}
                      onChange={e => setFilterMaxAmount(e.target.value)}
                      className="w-full h-8.5 bg-white/[0.02] border border-white/[0.06] rounded-lg pl-6 pr-2.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-white/[0.2] outline-none"
                    />
                  </div>
                </div>
              </div>
            </FilterPopover>
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
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[12.5px]">
                  {formError}
                </div>
              )}

              <div className="flex p-1 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                <button type="button" onClick={()=>setRType('Debit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${rType==='Debit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Fixed Expense</button>
                <button type="button" onClick={()=>setRType('Credit')} className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${rType==='Credit' ? 'bg-[#111111] text-white shadow-sm border border-white/[0.05]' : 'text-neutral-500 hover:text-white'}`}>Recurring Income</button>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                  Amount (₹) <Req satisfied={Boolean(rAmount && Number(rAmount) > 0)} />
                </label>
                <input
                  type="number"
                  value={rAmount}
                  onChange={e => {
                    setRAmount(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  required
                  min="0.01"
                  step="0.01"
                  className={`w-full h-12 bg-transparent border-b text-3xl font-semibold text-white outline-none tabular-nums transition-colors ${
                    formError && (!rAmount || Number(rAmount) <= 0)
                      ? 'border-rose-500/80 focus:border-rose-500'
                      : 'border-white/[0.1] focus:border-emerald-500'
                  }`}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                  Description <Req satisfied={Boolean(rDesc.trim())} />
                </label>
                <input
                  type="text"
                  value={rDesc}
                  onChange={e => {
                    setRDesc(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  required
                  className={`w-full h-9 bg-transparent border-b text-[14px] text-white outline-none transition-colors ${
                    formError && !rDesc.trim()
                      ? 'border-rose-500/80 focus:border-rose-500'
                      : 'border-white/[0.1] focus:border-emerald-500'
                  }`}
                  placeholder="e.g. Notion Subscription"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                    Interval <Req satisfied={Boolean(rInterval)} />
                  </label>
                  <Select
                    value={rInterval}
                    onChange={e=>setRInterval(e.target.value as any)}
                    className="w-full h-9"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                    Next Run Date <Req satisfied={Boolean(rNextRun)} />
                  </label>
                  <DatePicker
                    value={rNextRun}
                    onChange={e => {
                      setRNextRun(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required
                    placeholder="dd-mm-yyyy"
                    className={`w-full h-9 ${formError && !rNextRun ? 'border-rose-500/80' : ''}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                    Account <Req satisfied={Boolean(rAccountId)} />
                  </label>
                  <Select
                    value={rAccountId}
                    onChange={e => {
                      setRAccountId(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required
                    className={`w-full h-9 ${formError && !rAccountId ? 'border-rose-500/80' : ''}`}
                  >
                    <option value="">Select Account</option>
                    {accounts.map((a, idx) => {
                      const accId = a.id || a._id?.toString?.() || String(a._id || `rec-modal-acc-${idx}`);
                      return <option key={accId} value={accId}>{a.name}</option>;
                    })}
                  </Select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">
                    Category <Opt />
                  </label>
                  <Select
                    value={rCategory}
                    onChange={e=>setRCategory(e.target.value)}
                    className="w-full h-9"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c, idx) => {
                      const catKey = c.id || c._id?.toString?.() || c.name || `rec-modal-cat-${idx}`;
                      return <option key={catKey} value={c.name}>{c.name}</option>;
                    })}
                  </Select>
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
