"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DashboardProvider, useDashboardContext } from '@/components/dashboard/DashboardProvider';
import {
  Home, Activity, Wallet, PieChart, Repeat, Users,
  BarChart3, Shield, Settings, Search, Bell, Plus, FileText, TrendingUp, Briefcase, FolderKanban, Tags, Clock, Receipt, IndianRupee, Hourglass
} from 'lucide-react';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { BrandMark } from '@/components/ui/BrandMark';
import { BroadcastBanner } from '@/components/dashboard/BroadcastBanner';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { tenantHasCapability } from '@/lib/agency/types/vertical';

import { Menu, X, Download, ChevronRight } from 'lucide-react';

function Sidebar({ isMobile, isOpen, onClose }: { isMobile?: boolean; isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, tenant } = useDashboardContext();
  const { isInstallable, promptInstall } = usePwaInstall();
  
  const appMode = tenant?.appMode || 'Standard';
  const clientTerm = appMode === 'Student_Club' ? 'Sponsors' : 'Clients';
  // Module 1.1 — Agency workspaces swap the generic Command Center for the
  // Agency Command Center; other verticals are untouched. Capability check,
  // not a raw appMode comparison (Step 0.5 boundary).
  const isAgency = tenantHasCapability(tenant, 'AGENCY_DASHBOARD');

  const navItems = [
    isAgency
      ? { name: 'Agency Command Center', path: '/dashboard/agency', icon: Briefcase }
      : { name: 'Command Center', path: '/dashboard', icon: Home },
    { name: 'Transactions', path: '/dashboard/transactions', icon: Activity },
    { name: 'Accounts', path: '/dashboard/accounts', icon: Wallet },
    { name: 'Budgets', path: '/dashboard/budgets', icon: PieChart },
    { name: 'Recurring', path: '/dashboard/recurring', icon: Repeat },
    // Module 2 — Agency workspaces route Clients to the agency client list;
    // Standard/Student Club keep the core clients page untouched.
    isAgency
      ? { name: 'Agency Clients', path: '/dashboard/agency/clients', icon: Users }
      : { name: clientTerm, path: '/dashboard/clients', icon: Users },
    // Module 3 — Agency projects list. Agency workspaces only; the other
    // verticals have no project equivalent, so nothing is swapped.
    ...(isAgency
      ? [{ name: 'Agency Projects', path: '/dashboard/agency/projects', icon: FolderKanban }]
      : []),
    // Module 7 — Time Tracking. Agency workspaces only, and for EVERYONE in
    // them (§4: low-friction adoption — logging time is a base capability,
    // never an admin surface). The timer and manual entry live here.
    ...(isAgency
      ? [{ name: 'Time Tracking', path: '/dashboard/agency/time', icon: Clock }]
      : []),
    // Module 8 — Expenses. Agency workspaces only, for everyone (§39 base
    // capability): recording spend is a base action; approvals are gated
    // inside the pages, not the nav.
    ...(isAgency
      ? [{ name: 'Expenses', path: '/dashboard/agency/expenses', icon: Receipt }]
      : []),
    // Module 9 — Invoices. Agency workspaces only. The receivables list is
    // shared context (readable by the whole workspace, §28 pattern);
    // composition/finalization affordances are admin-gated inside the pages
    // (§67/§81 — invoicing is admin/finance work).
    ...(isAgency
      ? [{ name: 'Invoices', path: '/dashboard/agency/invoices', icon: FileText }]
      : []),
    // Module 14 — Receivables (the A/R operating view). Agency workspaces
    // only, for everyone (the §28 shared-context pattern): who owes us money
    // and for how long is shared context, read from the one engine (§99).
    ...(isAgency
      ? [{ name: 'Receivables', path: '/dashboard/agency/receivables', icon: Hourglass }]
      : []),
    // Module 10 — Payments. Agency workspaces only. The collections list is
    // shared context (readable by the whole workspace, §28 pattern);
    // record/confirm/reverse affordances are admin-gated inside the page
    // (§110 — money movement is admin/finance work).
    ...(isAgency
      ? [{ name: 'Payments', path: '/dashboard/agency/payments', icon: IndianRupee }]
      : []),
    // Module 15 — Alert Center (§23). Agency workspaces only, for everyone
    // (the §28 shared-context pattern: reads ride agency.dashboard.read; the
    // API already §114-filters cost-bearing rows per session). The list is a
    // read-only view of the STORED alerts; acknowledge/resolve are admin-gated
    // inside the page (agency.alerts.manage).
    ...(isAgency
      ? [{ name: 'Alert Center', path: '/dashboard/agency/alerts', icon: Bell }]
      : []),
    // Module 13 — Profitability. Admin/finance only (§114: agency.profitability
    // .read — labor cost is salary economics, §63, the same privacy class as
    // agency.rates.cost.read). The reports are read-only views of the one
    // financial engine (§70), but the numbers themselves are the cost ledger —
    // a plain USER (PM included) never gets the surface, and the API enforces
    // the same boundary on the route.
    ...(isAgency && (user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN')
      ? [{ name: 'Profitability', path: '/dashboard/agency/profitability', icon: TrendingUp }]
      : []),
    // Module 6 — Rate Cards. Agency workspaces only; the rate console is an
    // admin surface (§98: manage and cost.read are admin permissions), so a
    // plain USER never gets the nav item.
    ...(isAgency && (user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN')
      ? [{ name: 'Rate Cards', path: '/dashboard/agency/rate-cards', icon: Tags }]
      : []),
    { name: 'Reports', path: '/dashboard/reports', icon: BarChart3 },
  ];

  const adminItems = [
    { name: 'Team Workspace', path: '/dashboard/team', icon: Shield },
    { name: 'Growth Metrics', path: '/dashboard/growth', icon: TrendingUp },
    { name: 'Audit Log', path: '/dashboard/audit', icon: FileText },
    { name: 'Settings', path: isAgency ? '/dashboard/agency/settings' : '/dashboard/settings', icon: Settings },
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
              // Agency clients/projects/rate-cards detail pages keep the nav
              // item active without highlighting Transaction/Reports siblings.
              const active = item.path === '/dashboard/agency/clients'
                ? (pathname === item.path || pathname.startsWith('/dashboard/agency/clients/'))
                : item.path === '/dashboard/agency/projects'
                  ? (pathname === item.path || pathname.startsWith('/dashboard/agency/projects/'))
                  : item.path === '/dashboard/agency/rate-cards'
                    ? (pathname === item.path || pathname.startsWith('/dashboard/agency/rate-cards/'))
                    : item.path === '/dashboard/agency/time'
                      ? (pathname === item.path || pathname.startsWith('/dashboard/agency/time/'))
                      : item.path === '/dashboard/agency/expenses'
                        ? (pathname === item.path || pathname.startsWith('/dashboard/agency/expenses/'))
                        : item.path === '/dashboard/agency/invoices'
                          ? (pathname === item.path || pathname.startsWith('/dashboard/agency/invoices/'))
                          : pathname === item.path;
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
                const active = (item.name === 'Settings')
                  ? (pathname === '/dashboard/agency/settings' || pathname.startsWith('/dashboard/agency/settings') || pathname === '/dashboard/settings')
                  : pathname === item.path;
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
        {isMobile && isInstallable && (
          <button aria-label="Download App" className="flex items-center gap-2.5 w-full px-3 py-2 mb-2 rounded-lg text-[13.5px] font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors" onClick={() => { onClose?.(); promptInstall(); }}>
            <Download className="w-4 h-4" />
            <span className="flex-1 text-left">Download App</span>
          </button>
        )}
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

interface BreadcrumbItem {
  label: string;
  href?: string;
}

function isId(segment: string): boolean {
  if (!segment) return false;
  const s = segment.trim().toLowerCase();
  if (/^[0-9a-f]{24}$/.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return true;
  if (/^\d+$/.test(s) || /^[0-9a-f_-]{10,}$/.test(s)) return true;
  if (s.length >= 8 && /\d/.test(s) && /[a-z]/.test(s)) return true;
  return false;
}

const SEGMENT_TITLES: Record<string, string> = {
  dashboard: 'Command Center',
  agency: 'Agency Command Center',
  projects: 'Agency Projects',
  clients: 'Agency Clients',
  invoices: 'Invoices',
  'rate-cards': 'Rate Cards',
  time: 'Time Tracking',
  timesheet: 'Weekly Timesheet',
  expenses: 'Expenses',
  approvals: 'Approvals',
  receivables: 'Receivables',
  payments: 'Payments & Collections',
  profitability: 'Portfolio Profitability',
  alerts: 'Alert Center',
  reports: 'Agency Reports',
  settings: 'Settings',
  team: 'Team',
  transactions: 'Transactions',
  accounts: 'Accounts',
  budgets: 'Budgets',
  recurring: 'Recurring Transactions',
  audit: 'Audit Logs',
  growth: 'Growth Dashboard',
};

const DETAIL_TITLES: Record<string, string> = {
  projects: 'Project Details',
  clients: 'Client Details',
  invoices: 'Invoice Details',
  'rate-cards': 'Rate Card Details',
  users: 'User Details',
  tenants: 'Organization Details',
};

function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === 'dashboard')) {
    return [{ label: 'Command Center' }];
  }

  // Handle /dashboard/agency/...
  if (parts[0] === 'dashboard' && parts[1] === 'agency') {
    if (parts.length === 2) {
      return [{ label: 'Agency Command Center' }];
    }
    const section = parts[2];
    const sub = parts[3];
    const sectionLabel = SEGMENT_TITLES[section] || (section.charAt(0).toUpperCase() + section.slice(1).replace(/-/g, ' '));
    const sectionHref = `/dashboard/agency/${section}`;

    if (!sub) {
      return [{ label: sectionLabel }];
    }

    if (isId(sub)) {
      const detailLabel = DETAIL_TITLES[section] || `${sectionLabel.replace(/s$/, '')} Details`;
      return [
        { label: sectionLabel, href: sectionHref },
        { label: detailLabel }
      ];
    }

    let subLabel = SEGMENT_TITLES[sub] || (sub.charAt(0).toUpperCase() + sub.slice(1).replace(/-/g, ' '));
    if (sub === 'approvals') {
      subLabel = section === 'time' ? 'Time Approvals' : section === 'expenses' ? 'Expense Approvals' : 'Approvals';
    } else if (sub === 'timesheet') {
      subLabel = 'Weekly Timesheet';
    }

    return [
      { label: sectionLabel, href: sectionHref },
      { label: subLabel }
    ];
  }

  // Handle /dashboard/...
  const section = parts[1] || parts[0];
  const sub = parts[2];
  const sectionLabel = SEGMENT_TITLES[section] || (section.charAt(0).toUpperCase() + section.slice(1).replace(/-/g, ' '));
  const sectionHref = `/dashboard/${section}`;

  if (!sub) {
    return [{ label: sectionLabel }];
  }

  if (isId(sub)) {
    const detailLabel = DETAIL_TITLES[section] || `${sectionLabel.replace(/s$/, '')} Details`;
    return [
      { label: sectionLabel, href: sectionHref },
      { label: detailLabel }
    ];
  }

  const subLabel = SEGMENT_TITLES[sub] || (sub.charAt(0).toUpperCase() + sub.slice(1).replace(/-/g, ' '));
  return [
    { label: sectionLabel, href: sectionHref },
    { label: subLabel }
  ];
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useDashboardContext();
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="h-14 border-b border-white/[0.05] bg-[#000000]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button aria-label="Open navigation menu" onClick={onOpenMenu} className="p-1.5 -ml-1.5 text-neutral-400 hover:text-white transition-colors md:hidden rounded-md hover:bg-white/[0.05] shrink-0">
          <Menu className="w-5 h-5" />
        </button>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14px] min-w-0">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-600 shrink-0 hidden sm:inline" aria-hidden />}
                {isLast || !crumb.href ? (
                  <span className="font-semibold text-white tracking-tight truncate">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="text-neutral-400 hover:text-white transition-colors font-medium truncate hidden sm:inline">
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button aria-label="Open command palette" className="w-8 h-8 rounded-full border border-white/[0.1] flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors" onClick={() => window.dispatchEvent(new Event('open-command-palette'))}>
          <Search className="w-4 h-4 sm:hidden" />
          <Plus className="w-4 h-4 hidden sm:block" />
        </button>
        <button id="logout-btn" onClick={logout} className="ml-1 sm:ml-2 px-3 py-1.5 rounded bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors">
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
        <BroadcastBanner />
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
