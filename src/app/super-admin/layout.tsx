"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Building2, Users, LineChart, ShieldAlert, FileText, 
  ToggleLeft, LifeBuoy, Megaphone, Settings, Search,
  TerminalSquare, ArrowLeft, Command, TrendingUp, Activity, Stethoscope, ListChecks,
  Menu, X
} from 'lucide-react';
import { BrandMark } from '@/components/ui/BrandMark';
import { CommandPalette } from '@/components/ui/CommandPalette';

const primaryNav = [
  { name: 'Mission Control', href: '/super-admin', icon: TerminalSquare },
  { name: 'Organizations', href: '/super-admin/tenants', icon: Building2 },
  { name: 'Global Users', href: '/super-admin/users', icon: Users },
  { name: 'Revenue', href: '/super-admin/revenue', icon: LineChart },
  { name: 'Growth & Funnels', href: '/super-admin/growth', icon: TrendingUp },
  { name: 'Discovery Engine', href: '/super-admin/discovery', icon: Search },
  { name: 'Attribution', href: '/super-admin/attribution', icon: Activity },
];

const operationsNav = [
  { name: 'Security Center', href: '/super-admin/security', icon: ShieldAlert },
  { name: 'Audit Logs', href: '/super-admin/audit', icon: FileText },
  { name: 'Event Audit', href: '/super-admin/event-audit', icon: ListChecks },
  { name: 'Diagnostics', href: '/super-admin/analytics-diagnostics', icon: Stethoscope },
  { name: 'Feature Flags', href: '/super-admin/features', icon: ToggleLeft },
];

const supportNav = [
  { name: 'Support', href: '/super-admin/support', icon: LifeBuoy },
  { name: 'Communications', href: '/super-admin/communications', icon: Megaphone },
  { name: 'Settings', href: '/super-admin/settings', icon: Settings },
];

function Sidebar({ isMobile, isOpen, onClose, handleExitConsole }: any) {
  const pathname = usePathname();
  
  const content = (
    <>
      <div className="h-14 border-b border-white/[0.05] flex justify-between items-center px-4 shrink-0">
        <div className="flex items-center gap-2">
          <BrandMark size={18} variant="monochrome" className="text-white" />
          <span className="font-semibold text-[13px] tracking-[-0.015em] text-white">Platform Console</span>
        </div>
        {isMobile && (
          <button aria-label="Close navigation menu" onClick={onClose} className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors md:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 scrollbar-hide">
        <div className="px-3 space-y-0.5 mb-6">
           <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest px-2 mb-2">Core</div>
           {primaryNav.map(item => {
             const active = pathname === item.href;
             return (
               <Link 
                 onClick={onClose}
                 key={item.href} 
                 href={item.href}
                 className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                   active ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                 }`}
               >
                 <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-neutral-500'}`} />
                 {item.name}
               </Link>
             );
           })}
        </div>

        <div className="px-3 space-y-0.5 mb-6">
           <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest px-2 mb-2">Operations</div>
           {operationsNav.map(item => {
             const active = pathname === item.href;
             return (
               <Link 
                 onClick={onClose}
                 key={item.href} 
                 href={item.href}
                 className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                   active ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                 }`}
               >
                 <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-neutral-500'}`} />
                 {item.name}
               </Link>
             );
           })}
        </div>

        <div className="px-3 space-y-0.5">
           <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest px-2 mb-2">System</div>
           {supportNav.map(item => {
             const active = pathname === item.href;
             return (
               <Link 
                 onClick={onClose}
                 key={item.href} 
                 href={item.href}
                 className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                   active ? 'bg-white/[0.08] text-white' : 'text-neutral-400 hover:bg-white/[0.04] hover:text-white'
                 }`}
               >
                 <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-neutral-500'}`} />
                 {item.name}
               </Link>
             );
           })}
        </div>
      </div>

      <div className="p-4 border-t border-white/[0.05] shrink-0">
        <button onClick={handleExitConsole} className="flex items-center gap-2 text-[12px] font-medium text-neutral-500 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Exit Console
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        {isOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200" onClick={onClose} />
        )}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0a0a0a] border-r border-white/[0.05] shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {content}
        </aside>
      </>
    );
  }

  return (
    <aside className="w-64 border-r border-white/[0.05] bg-[#000000] flex flex-col shrink-0 h-full hidden md:flex">
      {content}
    </aside>
  );
}

function TopBar({ onOpenMenu }: any) {
  const pathname = usePathname();
  return (
    <header className="h-14 border-b border-white/[0.05] bg-[#000000]/80 backdrop-blur-md sticky top-0 z-30 flex items-center px-4 sm:px-6 justify-between shrink-0">
      <div className="flex items-center gap-4 flex-1">
        <button aria-label="Open navigation menu" onClick={onOpenMenu} className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white transition-colors md:hidden rounded-md hover:bg-white/[0.05]">
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:flex items-center gap-2 text-[12px] font-medium text-neutral-500">
           <span className="text-white">Global Scope</span>
           <span className="text-neutral-600">/</span>
           <span>{primaryNav.concat(operationsNav, supportNav).find(n => n.href === pathname)?.name || 'Tenant Detail'}</span>
        </div>
      </div>
      
      <div className="flex-1 max-w-md hidden sm:block">
         <button onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))} className="w-full h-8 bg-[#0a0a0a] border border-white/[0.1] rounded-md px-3 flex items-center justify-between text-[12px] text-neutral-500 hover:border-white/[0.2] transition-colors group">
           <div className="flex items-center gap-2">
             <Search className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-400" />
             <span>Search organizations, users, or logs...</span>
           </div>
           <div className="flex items-center gap-1 font-mono text-[10px]">
             <Command className="w-3.5 h-3.5" />
             <span>K</span>
           </div>
         </button>
      </div>
      <div className="sm:hidden flex items-center justify-end flex-1">
         <button onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))} className="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-white">
           <Search className="w-4 h-4" />
         </button>
      </div>
    </header>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleExitConsole = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#000000] text-[#ededed] font-sans selection:bg-neutral-800 selection:text-white">
      
      {/* Mobile Sidebar */}
      <Sidebar isMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} handleExitConsole={handleExitConsole} />
      
      {/* Desktop Sidebar */}
      <Sidebar handleExitConsole={handleExitConsole} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenMenu={() => setIsMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full relative">
          {children}
        </main>
      </div>

      <CommandPalette />

    </div>
  );
}
