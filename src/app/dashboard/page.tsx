"use client";

import React, { useState, useEffect } from 'react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { ArrowUpRight, ArrowDownRight, RefreshCw, Activity, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MoneyCommandCenter() {
  const { user, tenant } = useDashboardContext();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const [txRes, accRes, recRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/accounts'),
          fetch('/api/recurring')
        ]);
        
        const transactions = txRes.ok ? (await txRes.json()).transactions : [];
        const accounts = accRes.ok ? (await accRes.json()).accounts : [];
        const recurring = recRes.ok ? (await recRes.json()).recurring : [];
        const upcoming = recurring.filter((r: any) => r.type === 'Debit');
        const upcomingCount = upcoming.length;
        const upcomingAmount = upcoming.reduce((acc: number, r: any) => acc + r.amount, 0);

        // Derived logic
        const currentMonthPrefix = new Date().toISOString().substring(0, 7);
        const monthTxs = transactions.filter((t: any) => t.date.startsWith(currentMonthPrefix));
        const income = monthTxs.filter((t: any) => t.type === 'Credit').reduce((acc: number, t: any) => acc + t.amount, 0);
        const expense = monthTxs.filter((t: any) => t.type === 'Debit').reduce((acc: number, t: any) => acc + t.amount, 0);
        const profit = income - expense;

        const totalBalance = accounts.reduce((acc: number, a: any) => {
          const accTxs = transactions.filter((t: any) => t.accountId === a.id);
          const cr = accTxs.filter((t: any) => t.type === 'Credit').reduce((s: number, t: any) => s + t.amount, 0);
          const dr = accTxs.filter((t: any) => t.type === 'Debit').reduce((s: number, t: any) => s + t.amount, 0);
          return acc + (a.initialBalance + cr - dr);
        }, 0);

        // Trend Data
        const trendDataMap: Record<string, any> = {};
        Array.from({length: 30}, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d.toISOString().split('T')[0]; })
          .forEach(d => { trendDataMap[d] = { date: d, profit: 0 }; });
        
        transactions.forEach((t: any) => { 
          if (trendDataMap[t.date]) { 
            if (t.type === 'Credit') trendDataMap[t.date].profit += t.amount; 
            else trendDataMap[t.date].profit -= t.amount; 
          }
        });

        // Cumulative sum for visual chart
        let running = 0;
        const trendData = Object.values(trendDataMap).map(d => {
           running += d.profit;
           return { ...d, cumulative: running };
        });

        setData({
          income, expense, profit, totalBalance, trendData,
          recent: transactions.slice(0, 8),
          upcomingCount, upcomingAmount
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
         <RefreshCw className="w-5 h-5 animate-spin text-neutral-500" />
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header Greeting */}
      <div className="flex flex-col gap-1">
         <h1 className="text-2xl font-semibold tracking-tight text-white">Good evening, {user?.username}</h1>
         <p className="text-[14px] text-neutral-400">Here's your financial snapshot for {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}.</p>
      </div>

      {/* Snapshot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Cash */}
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:bg-white/[0.02] transition-colors relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-3xl group-hover:bg-white/[0.04] transition-colors" />
           <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-4">Total Cash</div>
           <div>
             <div className="text-4xl font-semibold tracking-tight text-white tabular-nums mb-1">{formatCurrency(data.totalBalance)}</div>
             <div className="text-[13px] text-emerald-500 font-medium flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5"/> All accounts healthy</div>
           </div>
        </div>

        {/* Operating Profit */}
        <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] flex flex-col justify-between hover:bg-white/[0.02] transition-colors relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
           <div className="text-[12px] font-medium text-neutral-500 uppercase tracking-widest mb-4">Operating Profit (MTD)</div>
           <div>
             <div className={`text-4xl font-semibold tracking-tight tabular-nums mb-1 ${data.profit >= 0 ? 'text-white' : 'text-rose-400'}`}>
               {data.profit > 0 ? '+' : ''}{formatCurrency(data.profit)}
             </div>
             <div className="flex gap-4 text-[13px] font-medium mt-2">
               <span className="text-neutral-400">In: <span className="text-emerald-400">{formatCurrency(data.income)}</span></span>
               <span className="text-neutral-400">Out: <span className="text-neutral-200">{formatCurrency(data.expense)}</span></span>
             </div>
           </div>
        </div>

        {/* Next Action / Recommendation */}
        <div className="p-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex flex-col justify-between hover:bg-indigo-500/10 transition-colors cursor-pointer group" onClick={() => window.location.href='/dashboard/recurring'}>
           <div className="text-[12px] font-medium text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
             <Activity className="w-3.5 h-3.5" /> Intelligence
           </div>
           <div>
             {data.upcomingCount > 0 ? (
               <p className="text-[14px] text-neutral-200 font-medium leading-relaxed mb-3">You have {data.upcomingCount} active recurring obligations totaling {formatCurrency(data.upcomingAmount)} per cycle.</p>
             ) : (
               <p className="text-[14px] text-neutral-200 font-medium leading-relaxed mb-3">No active recurring obligations detected. Set them up to track future cash flow.</p>
             )}
             <div className="text-[13px] text-indigo-400 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">Review obligations <ArrowRight className="w-3.5 h-3.5"/></div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Cash Flow Chart */}
         <div className="lg:col-span-2">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">30-Day Trajectory</h2>
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] p-5 h-[320px]">
               {data.trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffffff" stopOpacity={0.1}/><stop offset="95%" stopColor="#ffffff" stopOpacity={0}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                      <XAxis dataKey="date" tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} tickFormatter={(val) => val.split('-')[2]} />
                      <YAxis tick={{fontSize: 11, fill: '#737373'}} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: '1px solid #262626', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="cumulative" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                    </AreaChart>
                  </ResponsiveContainer>
               ) : (
                  <div className="h-full flex items-center justify-center text-[13px] text-neutral-500">No trajectory data yet.</div>
               )}
            </div>
         </div>

         {/* Recent Activity */}
         <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[13px] font-medium text-white uppercase tracking-widest">Live Feed</h2>
              <button className="text-[12px] text-neutral-500 hover:text-white transition-colors">View all</button>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-[#0a0a0a] overflow-hidden flex flex-col h-[320px]">
               <div className="flex-1 overflow-y-auto">
                 {data.recent.length === 0 ? (
                   <div className="p-5 text-center text-[13px] text-neutral-500">No recent activity.</div>
                 ) : data.recent.map((tx: any, i: number) => (
                   <div key={i} className="flex items-center justify-between p-4 border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors group">
                      <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${tx.type === 'Credit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/[0.05] border-white/[0.1] text-neutral-400'}`}>
                           {tx.type === 'Credit' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                         </div>
                         <div>
                           <div className="text-[13px] font-medium text-white truncate max-w-[160px]">{tx.description}</div>
                           <div className="text-[11px] text-neutral-500 font-mono mt-0.5">{tx.date}</div>
                         </div>
                      </div>
                      <div className={`text-[13px] font-medium tabular-nums ${tx.type === 'Credit' ? 'text-emerald-400' : 'text-neutral-200'}`}>
                         {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                      </div>
                   </div>
                 ))}
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}
