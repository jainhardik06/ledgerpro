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

import { Menu, X } from 'lucide-react';

function Sidebar({ isMobile, isOpen, onClose }: { isMobile?: boolean; isOpen?: boolean; onClose?: () => void }) {
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

  const content = (
    <>
      {/* Brand & Workspace Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0">
          <div className="w-7 h-7 rounded bg-white flex items-center justify-center shrink-0">
             <BrandMark size={15} variant="monochrome" className="text-black" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[13px] font-semibold text-white tracking-tight truncate">{tenant?.name || 'Workspace'}</span>
            <span className="text-[11px] text-neutral-500 font-medium truncate">{user?.username}</span>
          </div>
        </div>
        {isMobile && (
          <button aria-label="Close navigation menu" onClick={onClose} className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors md:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        <div>
          <div className="px-2 mb-2 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Platform</div>
          <nav className="space-y-0.5">
            {navItems.map(item => {
              const active = pathname === item.path;
              return (
                <Link onClick={onClose} key={item.path} href={item.path} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'}`}>
                  <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-neutral-500'}`} />
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
                  <Link onClick={onClose} key={item.path} href={item.path} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${active ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'}`}>
                    <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-neutral-500'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* User Profile / Logout */}
      <div className="p-3 border-t border-white/[0.05] shrink-0">
        <button aria-label="Open command palette" className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13.5px] font-medium text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-colors" onClick={() => { onClose?.(); window.dispatchEvent(new Event('open-command-palette')); }}>
           <Search className="w-4 h-4 text-neutral-500" />
           <span className="flex-1 text-left">Command Palette</span>
           <span className="text-[10px] font-mono border border-white/[0.1] px-1.5 rounded bg-white/[0.02]">Cmd+K</span>
        </button>
      </div>
    </>
  );

  // Mobile Drawer Wrapper
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={onClose}
          />
        )}
        
        {/* Drawer Panel */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0a0a0a] border-r border-white/[0.05] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {content}
        </aside>
      </>
    );
  }

  // Desktop Persistent Sidebar
  return (
    <aside className="w-64 shrink-0 h-screen border-r border-white/[0.05] bg-[#000000] flex flex-col hidden md:flex">
      {content}
    </aside>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useDashboardContext();
  const pathname = usePathname();

  // Simple Breadcrumbs
  const pathParts = pathname.split('/').filter(Boolean);
  const currentView = pathParts[pathParts.length - 1] || 'Dashboard';
  const title = currentView.charAt(0).toUpperCase() + currentView.slice(1);

  return (
    <header className="h-14 border-b border-white/[0.05] bg-[#000000]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center gap-3">
         <button aria-label="Open navigation menu" onClick={onOpenMenu} className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white transition-colors md:hidden rounded-md hover:bg-white/[0.05]">
           <Menu className="w-5 h-5" />
         </button>
         <span className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-white">{title === 'Dashboard' ? 'Command Center' : title}</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
         <button aria-label="Open command palette" className="w-8 h-8 rounded-full border border-white/[0.1] flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
            <Search className="w-4 h-4 sm:hidden" />
            <Plus className="w-4 h-4 hidden sm:block" />
         </button>
         <button onClick={logout} className="ml-1 sm:ml-2 px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors">
           <span className="hidden sm:inline">{user?.impersonatedBy ? 'Exit Impersonation' : 'Log out'}</span>
           <span className="sm:hidden">{user?.impersonatedBy ? 'Exit' : 'Log out'}</span>
         </button>
      </div>
    </header>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user } = useDashboardContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#000000] text-neutral-200 font-sans selection:bg-white/[0.2] selection:text-white">
      {user?.impersonatedBy && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-rose-500 z-50" />
      )}
      
      {/* Mobile Drawer */}
      <Sidebar isMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      {/* Desktop Sidebar */}
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMenu={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto w-full">
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
