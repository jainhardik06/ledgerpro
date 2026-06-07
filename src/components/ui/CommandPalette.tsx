"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Home, Activity, Wallet, PieChart, Repeat, Users, BarChart3, Settings, Shield, X, CornerDownLeft, FileText } from 'lucide-react';
import { useDashboardContext } from '@/components/dashboard/DashboardProvider';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { user } = useDashboardContext();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    
    const handleOpenEvent = () => setIsOpen(true);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpenEvent);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, []);

  if (!isOpen) return null;

  const navigate = (path: string) => {
    router.push(path);
    setIsOpen(false);
    setQuery('');
  };

  const navItems = [
    { name: 'Go to Command Center', path: '/dashboard', icon: Home, section: 'Navigation' },
    { name: 'Go to Transactions', path: '/dashboard/transactions', icon: Activity, section: 'Navigation' },
    { name: 'Go to Accounts', path: '/dashboard/accounts', icon: Wallet, section: 'Navigation' },
    { name: 'Go to Budgets', path: '/dashboard/budgets', icon: PieChart, section: 'Navigation' },
    { name: 'Go to Recurring', path: '/dashboard/recurring', icon: Repeat, section: 'Navigation' },
    { name: 'Go to Directory', path: '/dashboard/clients', icon: Users, section: 'Navigation' },
    { name: 'Go to Reports', path: '/dashboard/reports', icon: BarChart3, section: 'Navigation' },
  ];

  if (user?.role === 'TENANT_ADMIN') {
    navItems.push({ name: 'Go to Team Workspace', path: '/dashboard/team', icon: Shield, section: 'Navigation' });
    navItems.push({ name: 'Go to Audit Log', path: '/dashboard/audit', icon: FileText, section: 'Navigation' });
    navItems.push({ name: 'Go to Settings', path: '/dashboard/settings', icon: Settings, section: 'Navigation' });
  }

  const filteredItems = navItems.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsOpen(false)} />
      
      {/* Palette */}
      <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/[0.1] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Search Input */}
        <div className="flex items-center px-4 h-14 border-b border-white/[0.05]">
          <Search className="w-5 h-5 text-neutral-500 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 h-full bg-transparent border-none text-[15px] text-white placeholder:text-neutral-600 outline-none px-4"
          />
          <button className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors" onClick={() => setIsOpen(false)}>
             <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
           {filteredItems.length === 0 ? (
             <div className="py-14 text-center text-[13px] text-neutral-500">No results found for "{query}"</div>
           ) : (
             <div className="space-y-1">
               <div className="px-2 py-1.5 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Navigation</div>
               {filteredItems.map(item => (
                 <button 
                   key={item.name} 
                   onClick={() => navigate(item.path)}
                   className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-[14px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] group transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <item.icon className="w-4 h-4 text-neutral-500 group-hover:text-white" />
                     {item.name}
                   </div>
                   <CornerDownLeft className="w-4 h-4 text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                 </button>
               ))}
             </div>
           )}
        </div>
        
        {/* Footer */}
        <div className="h-10 border-t border-white/[0.05] bg-white/[0.01] flex items-center justify-between px-4 text-[11px] font-medium text-neutral-500">
          <div className="flex items-center gap-4">
             <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono">↑</kbd><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono">↓</kbd> to navigate</span>
             <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono">↵</kbd> to select</span>
          </div>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono">esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
