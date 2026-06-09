"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  Download, 
  Activity, 
  Calendar, 
  Users, 
  Briefcase, 
  Repeat, 
  FileText, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle2, 
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  Layers,
  Search
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell, 
  Legend 
} from 'recharts';
import { captureEvent } from '@/lib/posthog';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  
  // Real datasets from MongoDB / LocalDb
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'breakdowns' | 'team' | 'obligations' | 'export'>('overview');

  // Filter States
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '12m' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Spending view switcher
  const [spendingDimension, setSpendingDimension] = useState<'category' | 'account' | 'user' | 'client'>('category');

  // Load datasets in parallel
  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchOrEmpty = async (url: string, key: string) => {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              return data[key] || [];
            }
          } catch (e) {
            console.error(`Failed to fetch ${url}:`, e);
          }
          return [];
        };

        const [txs, accs, cats, bdgs, recs, cls, usrs, lgList] = await Promise.all([
          fetchOrEmpty('/api/transactions', 'transactions'),
          fetchOrEmpty('/api/accounts', 'accounts'),
          fetchOrEmpty('/api/categories', 'categories'),
          fetchOrEmpty('/api/budgets', 'budgets'),
          fetchOrEmpty('/api/recurring', 'recurring'),
          fetchOrEmpty('/api/clients', 'clients'),
          fetchOrEmpty('/api/tenant/users', 'users'),
          fetchOrEmpty('/api/logs', 'logs')
        ]);

        setTransactions(txs);
        setAccounts(accs);
        setCategories(cats);
        setBudgets(bdgs);
        setRecurring(recs);
        setClients(cls);
        setTeam(usrs);
        setLogs(lgList);
      } catch (e) {
        console.error("Failed to load reporting data:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Track Report Views
  useEffect(() => {
    if (!loading && transactions.length > 0) {
      captureEvent('REPORT_VIEWED', { 
        tab: activeTab, 
        dateRange, 
        compareEnabled 
      });
    }
  }, [loading, activeTab, dateRange, compareEnabled, transactions.length]);

  // Helper date generators
  const getPeriodRange = (range: string, customS?: string, customE?: string) => {
    const today = new Date();
    const start = new Date();
    const end = new Date();
    
    if (range === '7d') {
      start.setDate(today.getDate() - 6);
    } else if (range === '30d') {
      start.setDate(today.getDate() - 29);
    } else if (range === '90d') {
      start.setDate(today.getDate() - 89);
    } else if (range === '12m') {
      start.setFullYear(today.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
    } else if (range === 'custom' && customS && customE) {
      return {
        start: new Date(customS),
        end: new Date(customE)
      };
    }
    
    return { start, end };
  };

  const getCompareRange = (range: string, start: Date, end: Date) => {
    const durationMs = end.getTime() - start.getTime();
    const compareEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const compareStart = new Date(compareEnd.getTime() - durationMs);
    return { start: compareStart, end: compareEnd };
  };

  // Memoized Filtered transaction sets
  const filteredCurrent = useMemo(() => {
    const { start, end } = getPeriodRange(dateRange, customStart, customEnd);
    return transactions.filter(t => {
      const tDate = new Date(t.date);
      if (tDate < start || tDate > end) return false;
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (filterClient !== 'all' && t.clientId !== filterClient) return false;
      if (filterTeam !== 'all' && t.userId !== filterTeam) return false;
      return true;
    });
  }, [transactions, dateRange, customStart, customEnd, filterAccount, filterCategory, filterClient, filterTeam]);

  const filteredCompare = useMemo(() => {
    if (!compareEnabled) return [];
    const currPeriod = getPeriodRange(dateRange, customStart, customEnd);
    const { start, end } = getCompareRange(dateRange, currPeriod.start, currPeriod.end);
    return transactions.filter(t => {
      const tDate = new Date(t.date);
      if (tDate < start || tDate > end) return false;
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (filterClient !== 'all' && t.clientId !== filterClient) return false;
      if (filterTeam !== 'all' && t.userId !== filterTeam) return false;
      return true;
    });
  }, [transactions, dateRange, customStart, customEnd, filterAccount, filterCategory, filterClient, filterTeam, compareEnabled]);

  // Section 1: Financial Overview metrics computation
  const metrics = useMemo(() => {
    const calcStats = (txList: any[]) => {
      const income = txList.filter(t => t.type === 'Credit').reduce((sum, t) => sum + t.amount, 0);
      const expenses = txList.filter(t => t.type === 'Debit').reduce((sum, t) => sum + t.amount, 0);
      const netProfit = income - expenses;
      const volume = txList.length;
      const savingsRate = income > 0 ? (netProfit / income) * 100 : 0;
      return { income, expenses, netProfit, volume, savingsRate };
    };

    const currentStats = calcStats(filteredCurrent);
    
    // Liquidity summation
    const initialBalanceSum = accounts.reduce((sum, a) => sum + (a.initialBalance || 0), 0);
    const lifetimeIncome = transactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + t.amount, 0);
    const lifetimeExpense = transactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + t.amount, 0);
    const totalCurrentBalance = initialBalanceSum + lifetimeIncome - lifetimeExpense;

    if (!compareEnabled) {
      return {
        ...currentStats,
        balance: totalCurrentBalance,
        compare: null
      };
    }

    const compareStats = calcStats(filteredCompare);
    const calcGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      ...currentStats,
      balance: totalCurrentBalance,
      compare: {
        ...compareStats,
        incomeGrowth: calcGrowth(currentStats.income, compareStats.income),
        expenseGrowth: calcGrowth(currentStats.expenses, compareStats.expenses),
        netProfitGrowth: calcGrowth(currentStats.netProfit, compareStats.netProfit),
        volumeGrowth: calcGrowth(currentStats.volume, compareStats.volume),
        savingsRateDiff: currentStats.savingsRate - compareStats.savingsRate
      }
    };
  }, [filteredCurrent, filteredCompare, compareEnabled, accounts, transactions]);

  // Section 2: Cash Flow Timeline compilation
  const cashFlowTimeline = useMemo(() => {
    const { start, end } = getPeriodRange(dateRange, customStart, customEnd);
    const daysMap: Record<string, { date: string, formattedDate: string, income: number, expense: number }> = {};
    
    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const parts = dateStr.split('-');
      daysMap[dateStr] = {
        date: dateStr,
        formattedDate: `${parts[2]}/${parts[1]}`,
        income: 0,
        expense: 0
      };
      current.setDate(current.getDate() + 1);
    }

    filteredCurrent.forEach(t => {
      if (daysMap[t.date]) {
        if (t.type === 'Credit') {
          daysMap[t.date].income += t.amount;
        } else {
          daysMap[t.date].expense += t.amount;
        }
      }
    });

    const initialBalanceSum = accounts.reduce((sum, a) => sum + (a.initialBalance || 0), 0);
    const beforeStartTransactions = transactions.filter(t => new Date(t.date) < start);
    const beforeStartNet = beforeStartTransactions.reduce((sum, t) => {
      return sum + (t.type === 'Credit' ? t.amount : -t.amount);
    }, 0);
    
    let cumulative = initialBalanceSum + beforeStartNet;
    
    return Object.values(daysMap).map(d => {
      cumulative += (d.income - d.expense);
      return {
        ...d,
        net: d.income - d.expense,
        cumulative
      };
    });
  }, [transactions, filteredCurrent, dateRange, customStart, customEnd, accounts]);

  // Section 3: Spending breakdown computation
  const spendingBreakdown = useMemo(() => {
    const map: Record<string, { name: string, value: number, count: number }> = {};

    filteredCurrent.filter(t => t.type === 'Debit').forEach(t => {
      let key = 'Uncategorized';
      if (spendingDimension === 'category') {
        key = t.category || 'Uncategorized';
      } else if (spendingDimension === 'account') {
        const acc = accounts.find(a => a.id === t.accountId);
        key = acc ? acc.name : 'Unknown Account';
      } else if (spendingDimension === 'user') {
        const member = team.find(u => u.id === t.userId);
        key = member ? member.username : 'Unknown Member';
      } else if (spendingDimension === 'client') {
        const cl = clients.find(c => c.id === t.clientId);
        key = cl ? cl.name : 'No Client';
      }

      if (!map[key]) {
        map[key] = { name: key, value: 0, count: 0 };
      }
      map[key].value += t.amount;
      map[key].count += 1;
    });

    const total = Object.values(map).reduce((sum, d) => sum + d.value, 0);

    return Object.values(map)
      .map(d => ({
        ...d,
        percentage: total > 0 ? (d.value / total) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredCurrent, spendingDimension, accounts, team, clients]);

  // Section 4: Budget Intelligence computation
  const budgetIntelligence = useMemo(() => {
    const currentMonthPrefix = new Date().toISOString().substring(0, 7);
    const activeBudgets = budgets.filter(b => b.month === currentMonthPrefix);

    const dataList = activeBudgets.map(b => {
      const categorySpent = transactions
        .filter(t => t.type === 'Debit' && t.category === b.category && t.date.startsWith(currentMonthPrefix))
        .reduce((sum, t) => sum + t.amount, 0);

      const remaining = Math.max(0, b.limitAmount - categorySpent);
      const ratio = b.limitAmount > 0 ? (categorySpent / b.limitAmount) * 100 : 0;
      
      let risk: 'low' | 'warning' | 'critical' = 'low';
      if (ratio >= 100) risk = 'critical';
      else if (ratio >= 85) risk = 'warning';

      return {
        category: b.category,
        limit: b.limitAmount,
        spent: categorySpent,
        remaining,
        ratio,
        risk
      };
    });

    const totalLimit = activeBudgets.reduce((sum, b) => sum + b.limitAmount, 0);
    const totalSpent = dataList.reduce((sum, d) => sum + d.spent, 0);
    const totalRemaining = Math.max(0, totalLimit - totalSpent);
    const overallRatio = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

    return {
      budgets: dataList,
      totalLimit,
      totalSpent,
      totalRemaining,
      overallRatio
    };
  }, [budgets, transactions]);

  // Section 5: Team Intelligence computation
  const teamIntelligence = useMemo(() => {
    const map: Record<string, { username: string, txCount: number, totalSpent: number, lastActive: string }> = {};

    team.forEach(u => {
      map[u.id || u.username] = {
        username: u.username,
        txCount: 0,
        totalSpent: 0,
        lastActive: 'Never'
      };
    });

    filteredCurrent.forEach(t => {
      const userKey = t.userId;
      if (map[userKey]) {
        map[userKey].txCount += 1;
        if (t.type === 'Debit') {
          map[userKey].totalSpent += t.amount;
        }
      }
    });

    logs.forEach(l => {
      const match = team.find(u => u.username === l.username);
      if (match) {
        const uId = match.id || match.username;
        if (map[uId] && (map[uId].lastActive === 'Never' || new Date(l.timestamp) > new Date(map[uId].lastActive))) {
          map[uId].lastActive = new Date(l.timestamp).toLocaleDateString();
        }
      }
    });

    return Object.values(map).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [filteredCurrent, team, logs]);

  // Section 6: Client Intelligence computation
  const clientIntelligence = useMemo(() => {
    const map: Record<string, { name: string, totalRevenue: number, txCount: number }> = {};

    clients.forEach(c => {
      map[c.id] = { name: c.name, totalRevenue: 0, txCount: 0 };
    });

    filteredCurrent.forEach(t => {
      if (t.clientId && map[t.clientId]) {
        map[t.clientId].txCount += 1;
        if (t.type === 'Credit') {
          map[t.clientId].totalRevenue += t.amount;
        }
      }
    });

    const list = Object.values(map).filter(c => c.txCount > 0 || c.totalRevenue > 0);
    const overallRevenue = list.reduce((sum, c) => sum + c.totalRevenue, 0);

    return list.map(c => ({
      ...c,
      contributionRatio: overallRevenue > 0 ? (c.totalRevenue / overallRevenue) * 100 : 0
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredCurrent, clients]);

  // Section 7: Recurring Commitments computation
  const recurringIntelligence = useMemo(() => {
    const monthlyObligations = recurring.reduce((sum, r) => sum + r.amount, 0);
    const upcoming = recurring.map(r => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      type: r.type,
      interval: r.interval,
      nextRunDate: r.nextRunDate,
      category: r.category || 'Uncategorized'
    })).sort((a, b) => new Date(a.nextRunDate).getTime() - new Date(b.nextRunDate).getTime());

    return { monthlyObligations, upcoming };
  }, [recurring]);

  // Section 8: Operational logs
  const auditIntelligence = useMemo(() => {
    return logs.slice(0, 15).map(l => ({
      id: l.id || l.timestamp,
      username: l.username,
      action: l.action,
      details: l.details,
      timestamp: new Date(l.timestamp).toLocaleString()
    }));
  }, [logs]);

  // Format Helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  // Exporters
  const handleExportCSV = () => {
    captureEvent('REPORT_EXPORTED', { format: 'CSV', tab: activeTab, rowCount: filteredCurrent.length });
    const headers = ['Date', 'Description', 'Category', 'Account', 'Client', 'Type', 'Amount (INR)'];
    const rows = filteredCurrent.map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      const cl = clients.find(c => c.id === t.clientId);
      return [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.category || 'Uncategorized',
        acc ? acc.name : 'Unknown Account',
        cl ? cl.name : 'N/A',
        t.type,
        t.amount.toFixed(2)
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `moneyos_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    captureEvent('REPORT_EXPORTED', { format: 'PDF', tab: activeTab });
    window.print();
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-white/[0.05] rounded"></div>
            <div className="h-4 w-72 bg-white/[0.05] rounded"></div>
          </div>
          <div className="h-9 w-28 bg-white/[0.05] rounded"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white/[0.03] border border-white/[0.05] rounded-xl"></div>
          ))}
        </div>
        <div className="h-[360px] bg-white/[0.03] border border-white/[0.05] rounded-xl"></div>
      </div>
    );
  }

  // Global Empty State Check
  if (transactions.length === 0) {
    return (
      <div className="p-8 max-w-md mx-auto text-center mt-20 space-y-6">
        <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto">
          <Activity className="w-8 h-8 text-neutral-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Financial Intelligence Locked</h2>
          <p className="text-[13px] text-neutral-400">
            No transaction records are present in this workspace. Add transaction data inside Ledger to unlock automated reports, metrics, cash flows, and analytics.
          </p>
        </div>
        <a href="/dashboard/transactions" className="inline-flex h-9 items-center justify-center px-4 bg-white text-black text-[13px] font-semibold rounded-md hover:bg-neutral-200 transition-colors">
          Add First Transaction
        </a>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 w-full overflow-hidden">
      
      {/* CSS style injection for printing formatting */}
      <style jsx global>{`
        @media print {
          aside, nav, header, button, select, input, .no-print {
            display: none !important;
          }
          body, main {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .print-card {
            border: 1px solid #e5e5e5 !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .text-white, .text-neutral-400 {
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-5 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-1">Financial Intelligence Center</h1>
          <p className="text-[12px] sm:text-[13px] text-neutral-400">Advanced aggregations, comparisons, and audit-level insight logs.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button 
            onClick={handlePrintPDF} 
            className="h-9 px-3 border border-white/[0.1] text-white rounded-md text-[13px] font-medium hover:bg-white/[0.05] flex items-center justify-center flex-1 sm:flex-none gap-2 transition-colors"
          >
            <FileText className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Print PDF Summary</span>
          </button>
          <button 
            onClick={handleExportCSV} 
            className="h-9 px-3 bg-white text-black rounded-md text-[13px] font-semibold hover:bg-neutral-200 flex items-center justify-center flex-1 sm:flex-none gap-2 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" /> Export CSV
          </button>
        </div>
      </div>

      {/* Advanced Filter and Comparison Row */}
      <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 no-print">
        
        {/* Date Ranges */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Date Period</label>
          <select 
            value={dateRange} 
            onChange={e => setDateRange(e.target.value as any)} 
            className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="12m">Last 12 Months</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Custom Start */}
        {dateRange === 'custom' && (
          <>
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Start Date</label>
              <input 
                type="date" 
                value={customStart} 
                onChange={e => setCustomStart(e.target.value)} 
                className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none" 
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">End Date</label>
              <input 
                type="date" 
                value={customEnd} 
                onChange={e => setCustomEnd(e.target.value)} 
                className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none" 
              />
            </div>
          </>
        )}

        {/* Account Filter */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Account</label>
          <select 
            value={filterAccount} 
            onChange={e => setFilterAccount(e.target.value)} 
            className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none"
          >
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Category Filter */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Category</label>
          <select 
            value={filterCategory} 
            onChange={e => setFilterCategory(e.target.value)} 
            className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {/* Client Filter */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Client</label>
          <select 
            value={filterClient} 
            onChange={e => setFilterClient(e.target.value)} 
            className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none"
          >
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Team Member Filter */}
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Team Member</label>
          <select 
            value={filterTeam} 
            onChange={e => setFilterTeam(e.target.value)} 
            className="w-full h-9 bg-black border border-white/[0.1] rounded px-2 text-[12px] sm:text-[13px] text-white outline-none"
          >
            <option value="all">All Team</option>
            {team.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </div>

        {/* Comparison Toggle */}
        <div className="flex items-center gap-2 pl-2 md:pt-4">
          <input 
            type="checkbox" 
            id="compareCheck" 
            checked={compareEnabled} 
            onChange={e => setCompareEnabled(e.target.checked)} 
            className="accent-white cursor-pointer w-4 h-4 shrink-0"
          />
          <label htmlFor="compareCheck" className="text-[12px] font-medium text-white cursor-pointer select-none">Period Compare</label>
        </div>

      </div>

      {/* Tabs Switcher Row */}
      <div className="flex border-b border-white/[0.05] gap-2 pb-px overflow-x-auto no-scrollbar no-print whitespace-nowrap">
        <button 
          onClick={() => setActiveTab('overview')} 
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors shrink-0 ${activeTab === 'overview' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          Overview & Flow
        </button>
        <button 
          onClick={() => setActiveTab('breakdowns')} 
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors shrink-0 ${activeTab === 'breakdowns' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          Breakdowns & Budgets
        </button>
        <button 
          onClick={() => setActiveTab('team')} 
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors shrink-0 ${activeTab === 'team' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          Team & Clients
        </button>
        <button 
          onClick={() => setActiveTab('obligations')} 
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors shrink-0 ${activeTab === 'obligations' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          Obligations & Logs
        </button>
        <button 
          onClick={() => setActiveTab('export')} 
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors shrink-0 ${activeTab === 'export' ? 'border-white text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          Export Center
        </button>
      </div>

      {/* TAB 1: OVERVIEW & FLOW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Section 1: Financial Overview Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Balance Card */}
            <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card">
              <span className="block text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Workspace Liquidity</span>
              <span className="block text-2xl font-bold text-white mt-1.5 tabular-nums">{formatCurrency(metrics.balance)}</span>
              <span className="block text-[11px] text-neutral-500 mt-1">Sum of accounts & initial bal</span>
            </div>

            {/* Income Card */}
            <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card">
              <div className="flex justify-between items-start">
                <span className="block text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Total Income</span>
                {compareEnabled && metrics.compare && (
                  <span className={`inline-flex items-center text-[11px] font-semibold ${metrics.compare.incomeGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {metrics.compare.incomeGrowth >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                    {Math.abs(metrics.compare.incomeGrowth).toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="block text-2xl font-bold text-emerald-400 mt-1.5 tabular-nums">{formatCurrency(metrics.income)}</span>
              {compareEnabled && metrics.compare && (
                <span className="block text-[10px] text-neutral-500 mt-1">vs {formatCurrency(metrics.compare.income)} prior</span>
              )}
            </div>

            {/* Expenses Card */}
            <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card">
              <div className="flex justify-between items-start">
                <span className="block text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Total Expenses</span>
                {compareEnabled && metrics.compare && (
                  <span className={`inline-flex items-center text-[11px] font-semibold ${metrics.compare.expenseGrowth <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {metrics.compare.expenseGrowth <= 0 ? <TrendingDown className="w-3.5 h-3.5 mr-0.5" /> : <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />}
                    {Math.abs(metrics.compare.expenseGrowth).toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="block text-2xl font-bold text-neutral-200 mt-1.5 tabular-nums">{formatCurrency(metrics.expenses)}</span>
              {compareEnabled && metrics.compare && (
                <span className="block text-[10px] text-neutral-500 mt-1">vs {formatCurrency(metrics.compare.expenses)} prior</span>
              )}
            </div>

            {/* Savings Rate Card */}
            <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card">
              <div className="flex justify-between items-start">
                <span className="block text-[11px] font-medium text-neutral-500 uppercase tracking-widest">Savings Rate</span>
                {compareEnabled && metrics.compare && (
                  <span className={`text-[11px] font-semibold ${metrics.compare.savingsRateDiff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {metrics.compare.savingsRateDiff >= 0 ? '+' : ''}{metrics.compare.savingsRateDiff.toFixed(1)}%
                  </span>
                )}
              </div>
              <span className="block text-2xl font-bold text-white mt-1.5 tabular-nums">{metrics.savingsRate.toFixed(1)}%</span>
              <span className="block text-[11px] text-neutral-500 mt-1">Inflow-to-outflow efficiency</span>
            </div>

          </div>

          {/* Section 2: Cash Flow Timeline Chart */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Cash Flow & Liquidity Timeline</h2>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.05}/><stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                  <XAxis dataKey="formattedDate" tick={{fontSize: 10, fill: '#737373'}} tickLine={false} axisLine={false} />
                  <YAxis tick={{fontSize: 10, fill: '#737373'}} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: '1px solid #262626', fontSize: '12px' }} />
                  <Area type="monotone" name="Income" dataKey="income" stroke="#10b981" strokeWidth={1.5} fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" name="Expense" dataKey="expense" stroke="#f43f5e" strokeWidth={1.5} fillOpacity={1} fill="url(#colorExpense)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: BREAKDOWNS & BUDGETS */}
      {activeTab === 'breakdowns' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Section 3: Spending Breakdown */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[13px] font-medium text-white uppercase tracking-widest">Spending breakdown</h2>
              <div className="flex p-0.5 bg-white/[0.02] border border-white/[0.05] rounded-md no-print">
                {(['category', 'account', 'user', 'client'] as const).map(dim => (
                  <button 
                    key={dim}
                    onClick={() => setSpendingDimension(dim)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded capitalize transition-colors ${spendingDimension === dim ? 'bg-white text-black' : 'text-neutral-500 hover:text-white'}`}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-auto space-y-4 pr-1">
              {spendingBreakdown.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-500 text-[13px]">No matching expense records.</div>
              ) : (
                spendingBreakdown.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[13px] font-medium text-white">
                      <span>{item.name}</span>
                      <span className="tabular-nums">{formatCurrency(item.value)} <span className="text-[11px] text-neutral-500">({item.percentage.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
                      <div className="h-full bg-white/[0.4] rounded-full" style={{ width: `${item.percentage}%` }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 4: Budget Intelligence */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Budget Limits & Risk Analysis</h2>
            
            <div className="flex-1 overflow-auto space-y-4 pr-1">
              {budgetIntelligence.budgets.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 text-[13px] p-8">
                  <AlertTriangle className="w-5 h-5 mb-2 text-neutral-600" />
                  No budget categories found for this month. 
                  <a href="/dashboard/budgets" className="text-emerald-500 hover:underline mt-1 font-semibold block">Set Limit Goals &rarr;</a>
                </div>
              ) : (
                budgetIntelligence.budgets.map((b, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] font-semibold text-white">{b.category}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wider ${
                        b.risk === 'critical' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 
                        b.risk === 'warning' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                        'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      }`}>
                        {b.risk} Risk
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-neutral-400 tabular-nums">
                      <span>Spent: {formatCurrency(b.spent)}</span>
                      <span>Goal Limit: {formatCurrency(b.limit)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        b.risk === 'critical' ? 'bg-rose-500' :
                        b.risk === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} style={{ width: `${Math.min(100, b.ratio)}%` }}></div>
                    </div>
                    {b.spent > b.limit && (
                      <span className="block text-[10px] text-rose-500 font-medium font-mono">Overrun by {formatCurrency(b.spent - b.limit)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: TEAM & CLIENTS */}
      {activeTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Section 5: Team Intelligence */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Team operational Contribution</h2>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <th className="py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-widest w-full sm:w-auto">Username</th>
                    <th className="hidden sm:table-cell py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-widest text-center">Tx Count</th>
                    <th className="py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-widest text-right shrink-0">Debit Total</th>
                    <th className="hidden md:table-cell py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-widest text-right">Last Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {teamIntelligence.map((member, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.01]">
                      <td className="py-3 font-medium text-white align-middle min-w-0">
                         <div className="flex flex-col min-w-0">
                           <span className="truncate">{member.username}</span>
                           <span className="sm:hidden text-[10px] text-neutral-500 mt-0.5 truncate">{member.txCount} txs • Last: {member.lastActive}</span>
                         </div>
                      </td>
                      <td className="hidden sm:table-cell py-3 text-center tabular-nums text-neutral-400 align-middle">{member.txCount}</td>
                      <td className="py-3 text-right tabular-nums text-white font-medium align-middle shrink-0">{formatCurrency(member.totalSpent)}</td>
                      <td className="hidden md:table-cell py-3 text-right text-[11px] text-neutral-500 align-middle">{member.lastActive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 6: Client Intelligence */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Client Revenue Contribution</h2>
            
            <div className="flex-1 overflow-auto space-y-4">
              {clientIntelligence.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-500 text-[13px]">No matching client ledger inputs.</div>
              ) : (
                clientIntelligence.map((cl, idx) => (
                  <div key={idx} className="space-y-1.5 p-3 bg-white/[0.01] border border-white/[0.03] rounded-lg">
                    <div className="flex justify-between items-center text-[13px] font-semibold text-white">
                      <span>{cl.name}</span>
                      <span className="tabular-nums text-emerald-400">{formatCurrency(cl.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-neutral-500">
                      <span>{cl.txCount} transactions</span>
                      <span>{cl.contributionRatio.toFixed(1)}% of total inflow</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/[0.02] rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${cl.contributionRatio}%` }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* TAB 4: OBLIGATIONS & OPERATIONS */}
      {activeTab === 'obligations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Section 7: Recurring Obligation Forecast */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Committed obligations Forecast</h2>
            <div className="mb-4 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl flex justify-between items-center">
              <div>
                <span className="text-[11px] text-neutral-500 block">Monthly Committed Cost</span>
                <span className="text-xl font-bold text-white block tabular-nums">{formatCurrency(recurringIntelligence.monthlyObligations)}</span>
              </div>
              <Repeat className="w-5 h-5 text-neutral-500" />
            </div>

            <div className="flex-1 overflow-auto space-y-3">
              {recurringIntelligence.upcoming.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-500 text-[13px]">No recurring obligators registered.</div>
              ) : (
                recurringIntelligence.upcoming.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-lg flex justify-between items-center">
                    <div>
                      <span className="text-[13px] font-semibold text-white block">{item.description}</span>
                      <span className="text-[11px] text-neutral-500 block">Next: {item.nextRunDate} | <span className="capitalize">{item.interval}</span></span>
                    </div>
                    <span className={`text-[13px] font-mono font-semibold tabular-nums ${item.type === 'Credit' ? 'text-emerald-400' : 'text-neutral-400'}`}>
                      {item.type === 'Credit' ? '+' : '-'}{formatCurrency(item.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 8: Operational logs */}
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a] print-card flex flex-col h-[480px]">
            <h2 className="text-[13px] font-medium text-white uppercase tracking-widest mb-4">Intelligence Security & Audit Stream</h2>
            
            <div className="flex-1 overflow-auto space-y-3 pr-1">
              {auditIntelligence.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-500 text-[13px]">No matching operational events.</div>
              ) : (
                auditIntelligence.map((log, idx) => (
                  <div key={idx} className="p-3 bg-white/[0.01] border border-white/[0.03] rounded-lg space-y-1.5">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="font-semibold text-white">{log.username}</span>
                      <span className="text-neutral-500 text-[10px] font-mono">{log.timestamp}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      <span className="text-emerald-400 font-medium mr-1.5 font-mono">[{log.action}]</span> {log.details}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* TAB 5: EXPORT CENTER */}
      {activeTab === 'export' && (
        <div className="max-w-2xl mx-auto p-6 bg-[#0a0a0a] border border-white/[0.05] rounded-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-white/[0.05] pb-4">
            <Layers className="w-5 h-5 text-neutral-400" />
            <div>
              <h2 className="text-[15px] font-semibold text-white">Financial Export Suite</h2>
              <p className="text-[11px] text-neutral-400">Filter parameters can be packaged into structured reports.</p>
            </div>
          </div>

          <div className="space-y-4">
            
            <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/[0.03] rounded-xl">
              <div>
                <span className="text-[13px] font-semibold text-white block">Raw Transaction CSV</span>
                <span className="text-[11px] text-neutral-500 block">Extracts {filteredCurrent.length} matching rows in CSV format.</span>
              </div>
              <button 
                onClick={handleExportCSV} 
                className="h-9 px-4 bg-white text-black font-semibold rounded text-[12px] hover:bg-neutral-200 transition-colors"
              >
                Download CSV
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/[0.03] rounded-xl">
              <div>
                <span className="text-[13px] font-semibold text-white block">Intelligence Summary Sheet</span>
                <span className="text-[11px] text-neutral-500 block">Generates clean printable layouts suitable for physical signatures or PDF files.</span>
              </div>
              <button 
                onClick={handlePrintPDF} 
                className="h-9 px-4 border border-white/[0.1] text-white font-semibold rounded text-[12px] hover:bg-white/[0.05] transition-colors"
              >
                Print Summary
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
