"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, Users, Plus, Edit2, Trash2, Mail, ExternalLink } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';

export default function ClientsPage() {
  const { tenant } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const appMode = tenant?.appMode || 'Standard';
  const clientTerm = appMode === 'Student_Club' ? 'Sponsor' : 'Client';
  const incomeTerm = appMode === 'Student_Club' ? 'Funds Collected' : 'Revenue generated';

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleOpen = () => openNew();
    window.addEventListener('open-new-client', handleOpen);
    return () => window.removeEventListener('open-new-client', handleOpen);
  }, []);

  const fetchData = async () => {
    try {
      const [cliRes, txRes] = await Promise.all([
        fetch('/api/clients'), fetch('/api/transactions')
      ]);
      if (cliRes.ok) setClients((await cliRes.json()).clients);
      if (txRes.ok) setTransactions((await txRes.json()).transactions);
    } catch (e) {} finally { setLoading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = selectedClient ? `/api/clients/${selectedClient.id}` : '/api/clients';
      const method = selectedClient ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cName, email: cEmail })
      });
      if (res.ok) { setIsDrawerOpen(false); fetchData(); }
    } catch (e) {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete this ${clientTerm.toLowerCase()}?`)) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (res.ok) { setIsDrawerOpen(false); fetchData(); }
    } catch (e) {}
  };

  const openNew = () => {
    setSelectedClient(null);
    setCName(''); setCEmail('');
    setIsDrawerOpen(true);
  };

  const openEdit = (cli: any) => {
    setSelectedClient(cli);
    setCName(cli.name); setCEmail(cli.email || '');
    setIsDrawerOpen(true);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">{clientTerm}s Directory</h1>
          <p className="text-[13px] text-neutral-400">Manage relationships and track historical revenue per entity.</p>
        </div>
        <button onClick={openNew} className="h-9 px-4 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add {clientTerm}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map(cli => {
          const revenue = transactions.filter(t => t.clientId === cli.id && t.type === 'Credit').reduce((s, t) => s + t.amount, 0);

          return (
            <div key={cli.id} onClick={() => openEdit(cli)} className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.02] transition-colors cursor-pointer group flex flex-col justify-between h-40">
               <div>
                 <div className="text-[15px] font-semibold text-white mb-1">{cli.name}</div>
                 <div className="text-[12px] font-medium text-neutral-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {cli.email || 'No email provided'}</div>
               </div>
               
               <div className="flex items-end justify-between border-t border-white/[0.05] pt-4 mt-4">
                 <div>
                   <div className="text-[10px] uppercase tracking-widest font-medium text-neutral-500 mb-1">{incomeTerm}</div>
                   <div className="text-[16px] font-semibold tracking-tight text-emerald-400 tabular-nums">{formatCurrency(revenue)}</div>
                 </div>
                 <ExternalLink className="w-4 h-4 text-neutral-600 group-hover:text-white transition-colors" />
               </div>
            </div>
          );
        })}
        {clients.length === 0 && (
           <div className="col-span-full p-12 rounded-xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 rounded-full bg-white/[0.02] flex items-center justify-center mb-4">
                <Users className="w-5 h-5 text-neutral-500" />
             </div>
             <p className="text-[14px] text-white font-medium mb-1">No directory entries</p>
             <p className="text-[13px] text-neutral-500 max-w-sm mb-4">Add the people and organizations you do business with to track revenue histories.</p>
             <button onClick={openNew} className="text-[13px] font-medium text-emerald-500 hover:text-emerald-400">Add first {clientTerm.toLowerCase()} &rarr;</button>
           </div>
        )}
      </div>

      <Drawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} title={selectedClient ? `Edit ${clientTerm}` : `Add ${clientTerm}`}>
        <form onSubmit={handleSave} className="space-y-6 flex flex-col h-full">
           <div className="space-y-5 flex-1">
             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Legal Name / Entity</label>
               <input type="text" value={cName} onChange={e=>setCName(e.target.value)} required className="w-full h-9 bg-transparent border-b border-white/[0.1] text-[14px] text-white focus:border-emerald-500 outline-none" placeholder="e.g. Acme Corp" />
             </div>

             <div>
               <label className="block text-[12px] font-medium text-neutral-400 mb-1.5">Primary Email</label>
               <input type="email" value={cEmail} onChange={e=>setCEmail(e.target.value)} className="w-full h-9 bg-white/[0.02] border border-white/[0.05] rounded-md px-3 text-[13px] text-white focus:border-white/[0.2] outline-none" placeholder="billing@acmecorp.com" />
             </div>
           </div>

           <div className="flex items-center justify-between pt-6 border-t border-white/[0.05]">
             {selectedClient ? (
               <button type="button" onClick={() => handleDelete(selectedClient.id)} className="text-[13px] font-medium text-rose-500 hover:text-rose-400 transition-colors">Delete {clientTerm.toLowerCase()}</button>
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
