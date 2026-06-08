"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardProvider, useDashboardContext } from '@/components/dashboard/DashboardProvider';
import { 
  Home, Activity, Wallet, PieChart, Repeat, Users, 
  BarChart3, Shield, Settings, Search, Bell, Plus, FileText
} from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { BrandMark } from '@/components/ui/BrandMark';

function Sidebar() {
  const pathname = usePathname();
  const { user, tenant } = useDashboardContext();
  
  const appMode = tenant?.appMode || 'Standard';
  const clientTerm = appMode === 'Student_Club' ? 'Sponsors' : 'Clients';

  const navItems = [
    { name: 'Command Center', path: '/dashboard', icon: Home },
    { name: 'Transactions', path: '/dashboard/transactions', icon: Activity },
    { name: 'Accounts', path: '/dashboard/accounts', icon: Wallet },
    { name: 'Budgets', path: '/dashboard/budgets', icon: PieChart },
    { name: 'Recurring', path: '/dashboard/recurring', icon: Repeat },
    { name: clientTerm, path: '/dashboard/clients', icon: Users },
    { name: 'Reports', path: '/dashboard/reports', icon: BarChart3 },
  ];

  const adminItems = [
    { name: 'Team Workspace', path: '/dashboard/team', icon: Shield },
    { name: 'Audit Log', path: '/dashboard/audit', icon: FileText },
    { name: 'Settings', path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 h-screen border-r border-white/[0.05] bg-[#000000] flex flex-col hidden md:flex">
      {/* Brand & Workspace Header */}
      <div className="h-14 flex items-center px-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity w-full">
          <div className="w-7 h-7 rounded bg-white flex items-center justify-center shrink-0">
             <BrandMark size={15} variant="monochrome" className="text-black" />
          </div>
          <div className="flex flex-col flex-1 truncate">
            <span className="text-[13px] font-semibold text-white tracking-tight truncate">{tenant?.name || 'Workspace'}</span>
            <span className="text-[11px] text-neutral-500 font-medium truncate">{user?.username}</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        <div>
          <div className="px-2 mb-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Platform</div>
          <nav className="space-y-0.5">
            {navItems.map(item => {
              const active = pathname === item.path;
              return (
                <Link key={item.path} href={item.path} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.06] text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02]'}`}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {user?.role === 'TENANT_ADMIN' && (
          <div>
            <div className="px-2 mb-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Administration</div>
            <nav className="space-y-0.5">
              {adminItems.map(item => {
                const active = pathname === item.path;
                return (
                  <Link key={item.path} href={item.path} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.06] text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02]'}`}>
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* User Profile / Logout */}
      <div className="p-3 border-t border-white/[0.05]">
        <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[13px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.02] transition-colors" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
           <Search className="w-4 h-4" />
           <span className="flex-1 text-left">Command Palette</span>
           <span className="text-[10px] font-mono border border-white/[0.1] px-1 rounded bg-white/[0.02]">Cmd+K</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar() {
  const { user, logout } = useDashboardContext();
  const pathname = usePathname();

  // Simple Breadcrumbs
  const pathParts = pathname.split('/').filter(Boolean);
  const currentView = pathParts[pathParts.length - 1] || 'Dashboard';
  const title = currentView.charAt(0).toUpperCase() + currentView.slice(1);

  return (
    <header className="h-14 border-b border-white/[0.05] bg-[#000000]/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
         {/* Breadcrumbs */}
         <span className="text-[14px] font-semibold tracking-tight text-white">{title === 'Dashboard' ? 'Command Center' : title}</span>
      </div>

      <div className="flex items-center gap-3">
         <button className="w-8 h-8 rounded-full border border-white/[0.1] flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
            <Plus className="w-4 h-4" />
         </button>
         <button onClick={logout} className="ml-2 px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors">
           {user?.impersonatedBy ? 'Exit Impersonation' : 'Log out'}
         </button>
      </div>
    </header>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user } = useDashboardContext();

  return (
    <div className="flex h-screen overflow-hidden bg-[#000000] text-neutral-200 font-sans selection:bg-white/[0.2] selection:text-white">
      {user?.impersonatedBy && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-rose-500 z-50" />
      )}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <LayoutContent>
        {children}
        <CommandPalette />
      </LayoutContent>
    </DashboardProvider>
  );
}
