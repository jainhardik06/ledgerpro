"use client";

import React, { useState, useEffect } from 'react';
import { RefreshCw, BarChart3, Download, Activity, Target } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/transactions');
        if (res.ok) setTransactions((await res.json()).transactions);
      } catch (e) {} finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return <div className="flex h-full items-center justify-center"><RefreshCw className="w-5 h-5 animate-spin text-neutral-500" /></div>;

  // Chart data derivation
  const catMap: Record<string, number> = {};
  transactions.filter(t => t.type === 'Debit').forEach(t => { catMap[t.category || 'Uncategorized'] = (catMap[t.category || 'Uncategorized'] || 0) + t.amount; });
  const pieData = Object.keys(catMap).map(k => ({ name: k, value: catMap[k] })).sort((a,b) => b.value - a.value);
  const COLORS = ['#171717', '#333333', '#525252', '#737373', '#a3a3a3', '#d4d4d4'];

  const trendDataMap: Record<string, any> = {};
  Array.from({length: 60}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (59 - i)); return d.toISOString().split('T')[0]; })
    .forEach(d => { trendDataMap[d] = { date: d, income: 0, expense: 0 }; });
  transactions.forEach(t => { if (trendDataMap[t.date]) { if (t.type === 'Credit') trendDataMap[t.date].income += t.amount; else trendDataMap[t.date].expense += t.amount; }});
  const trendData = Object.values(trendDataMap);

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">Intelligence & Reporting</h1>
          <p className="text-[13px] text-neutral-400">Deep financial insights and trend analysis.</p>
        </div>
        <button className="h-9 px-4 border border-white/[0.1] text-white rounded-md text-[13px] font-medium hover:bg-white/[0.05] flex items-center gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main 60-day Chart */}
        <div className="lg:col-span-2">
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">60-Day Cash Flow Trend</h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 h-[360px]">
             {transactions.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <defs>
                     <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                     <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#737373" stopOpacity={0.1}/><stop offset="95%" stopColor="#737373" stopOpacity={0}/></linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                   <XAxis dataKey="date" tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} tickFormatter={val => val.split('-')[2]} />
                   <YAxis tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} tickFormatter={val => `₹${val}`} />
                   <Tooltip contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: '1px solid #262626', fontSize: '12px' }} />
                   <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorInc)" />
                   <Area type="monotone" dataKey="expense" stroke="#737373" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
                 </AreaChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-center">
                 <Activity className="w-6 h-6 text-neutral-600 mb-2" />
                 <p className="text-[13px] text-neutral-500">Not enough data to map trends.</p>
               </div>
             )}
           </div>
        </div>

        {/* Expense Distribution */}
        <div>
           <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Expense Distribution</h2>
           <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 h-[360px] flex flex-col">
             <div className="flex-1 min-h-[180px]">
               {pieData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={2} dataKey="value" stroke="none">
                       {pieData.map((_, i) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                     </Pie>
                     <Tooltip contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: '1px solid #262626', fontSize: '12px' }} />
                   </PieChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex items-center justify-center"><Target className="w-6 h-6 text-neutral-600" /></div>
               )}
             </div>
             <div className="mt-6 space-y-3 shrink-0">
               {pieData.slice(0, 4).map((d, i) => (
                 <div key={i} className="flex justify-between items-center text-[13px] font-medium">
                   <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                     <span className="text-neutral-400">{d.name}</span>
                   </div>
                   <span className="tabular-nums text-white">{formatCurrency(d.value)}</span>
                 </div>
               ))}
               {pieData.length > 4 && (
                 <div className="text-[11px] font-medium text-neutral-500 pt-2 border-t border-white/[0.05]">
                   + {pieData.length - 4} other categories
                 </div>
               )}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
