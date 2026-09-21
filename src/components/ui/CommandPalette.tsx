"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search, Home, Activity, Wallet, PieChart, Repeat, Users, BarChart3,
  Settings, Shield, X, CornerDownLeft, FileText, HelpCircle, Building2,
  User, Plus, LogOut, ShieldAlert, Sparkles, TerminalSquare, Briefcase,
  Clock, FileSpreadsheet, IndianRupee, Tags, Receipt, Hourglass, Bell,
  SlidersHorizontal
} from 'lucide-react';
import { captureEvent } from '@/lib/posthog';
import { tenantHasCapability } from '@/lib/agency/types/vertical';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<any>(null);
  const [isAgencyWorkspace, setIsAgencyWorkspace] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const router = useRouter();
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLButtonElement[]>([]);

  // 1. Toggle Command Palette on Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(prev => {
          if (!prev) captureEvent('COMMAND_PALETTE_OPENED', { trigger: 'shortcut' });
          return !prev;
        });
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    const handleOpenEvent = () => {
      setIsOpen(true);
      captureEvent('COMMAND_PALETTE_OPENED', { trigger: 'event' });
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpenEvent);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpenEvent);
    };
  }, []);

  // 2. Load authenticated session info when opened
  useEffect(() => {
    if (!isOpen) return;
    
    // Reset query & selection on open
    setQuery('');
    setSelectedIndex(0);
    setSearchResults(null);

    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));

    // Tenant vertical for the agency command (Module 1.1) — DashboardProvider's
    // fetch pattern; capability-resolved, never a raw appMode string check.
    fetch('/api/tenant')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        setIsAgencyWorkspace(
          !!data?.tenant && tenantHasCapability(data.tenant, 'AGENCY_DASHBOARD')
        );
      })
      .catch(() => setIsAgencyWorkspace(false));
  }, [isOpen]);

  // 3. Debounced DB Search query handler
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSelectedIndex(0);
      return;
    }
    setLoading(true);
    const delayDebounce = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          setSearchResults(data.results);
          setSelectedIndex(0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Logout utility
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setIsOpen(false);
    router.push('/login');
  };

  /**
   * Module 1.15 — pending agency action. The action's destination module does
   * not exist yet, so the palette routes to the Agency Command Center and
   * dispatches one well-defined event; the dashboard shows an honest
   * "arriving with its module" notice. No fake dialogs, no fabricated flows.
   */
  const dispatchAgencyActionPending = (actionName: string) => {
    router.push('/dashboard/agency');
    setTimeout(() => window.dispatchEvent(new CustomEvent('agency-action-pending', { detail: { actionName } })), 500);
  };

  // 4. Build commands contextually
  const getCommands = () => {
    const list: any[] = [];

    // Public / Marketing / Guest routes
    list.push(
      { name: 'Go to Home', action: () => router.push('/'), icon: Home, section: 'Public Pages' },
      { name: 'Go to About Us', action: () => router.push('/about'), icon: Sparkles, section: 'Public Pages' },
      { name: 'Go to Contact', action: () => router.push('/contact'), icon: HelpCircle, section: 'Public Pages' },
      { name: 'Go to Support Center', action: () => router.push('/support'), icon: HelpCircle, section: 'Public Pages' },
      { name: 'Go to System Status', action: () => router.push('/status'), icon: Activity, section: 'Public Pages' },
      { name: 'Go to Security Protocol', action: () => router.push('/security'), icon: ShieldAlert, section: 'Public Pages' },
      { name: 'Go to Changelog', action: () => router.push('/changelog'), icon: FileText, section: 'Public Pages' }
    );

    // If User / Tenant Admin is logged in
    if (user && user.role !== 'SUPER_ADMIN') {
      list.push(
        { name: 'Go to Command Center', action: () => router.push('/dashboard'), icon: Home, section: 'Workspace' },
        { name: 'Go to Transactions', action: () => router.push('/dashboard/transactions'), icon: Activity, section: 'Workspace' },
        { name: 'Go to Accounts', action: () => router.push('/dashboard/accounts'), icon: Wallet, section: 'Workspace' },
        { name: 'Go to Budgets', action: () => router.push('/dashboard/budgets'), icon: PieChart, section: 'Workspace' },
        { name: 'Go to Recurring Transactions', action: () => router.push('/dashboard/recurring'), icon: Repeat, section: 'Workspace' },
        // Module 2 (§117/§118) — agency workspaces route the Clients entry to
        // the agency client directory, mirroring the dashboard nav swap.
        isAgencyWorkspace
          ? { name: 'Go to Agency Clients', action: () => router.push('/dashboard/agency/clients'), icon: Users, section: 'Workspace' }
          : { name: 'Go to Clients Directory', action: () => router.push('/dashboard/clients'), icon: Users, section: 'Workspace' },
        // Module 3 — the agency projects list, mirroring the nav swap.
        ...(isAgencyWorkspace
          ? [{ name: 'Go to Agency Projects', action: () => router.push('/dashboard/agency/projects'), icon: Briefcase, section: 'Workspace' }]
          : []),
        { name: 'Go to Performance Reports', action: () => router.push('/dashboard/reports'), icon: BarChart3, section: 'Workspace' }
      );

      // Module 1.1 — Agency Command Center command for agency workspaces.
      // The palette fetches /api/auth/me (user); the tenant's appMode comes
      // with this component's own lightweight fetch, same pattern as
      // DashboardProvider — capability check, not raw appMode (Step 0.5).
      if (isAgencyWorkspace) {
        list.push(
          { name: 'Go to Agency Command Center', action: () => router.push('/dashboard/agency'), icon: Building2, section: 'Workspace' }
        );

        // Module 1.15 — Agency Quick Actions. Existing core Money OS pattern:
        // every command is an honest action. Destinations that do not exist
        // yet are marked "Coming in Phase 1" and open a no-op notice —
        // NEVER fake navigation or fabricated flows.
        list.push(
          // Module 2 (§117) — Create Client is LIVE. Admins only (§28);
          // a USER never sees a create affordance.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Create Client',
            action: () => {
              if (pathname !== '/dashboard/agency/clients') {
                router.push('/dashboard/agency/clients');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-agency-client')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-agency-client'));
              }
            },
            icon: Users,
            section: 'Agency Actions'
          }] : []),
          // Module 3 (§117 pattern) — Create Project is LIVE. Admins only
          // (§28 split); a USER never sees a create affordance.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Create Project',
            action: () => {
              if (pathname !== '/dashboard/agency/projects') {
                router.push('/dashboard/agency/projects');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-agency-project')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-agency-project'));
              }
            },
            icon: Briefcase,
            section: 'Agency Actions'
          }] : []),
          // Module 3 (§117) — Search Projects: navigate + focus the list's
          // search input. Read path, so every agency USER sees it (§28).
          {
            name: 'Search Projects',
            action: () => {
              if (pathname !== '/dashboard/agency/projects') {
                router.push('/dashboard/agency/projects');
                setTimeout(() => window.dispatchEvent(new CustomEvent('focus-agency-projects-search')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('focus-agency-projects-search'));
              }
            },
            icon: Search,
            section: 'Agency Actions'
          },
          // Module 3 (§117) — Open Active Projects: the status-filtered list.
          {
            name: 'Open Active Projects',
            action: () => router.push('/dashboard/agency/projects?status=ACTIVE'),
            icon: Briefcase,
            section: 'Agency Actions'
          },
          // Module 4 (§23) — Create Work Item is LIVE. Admins only (§28).
          // Invoked from a project page it preselects that project (the
          // workspace opens its drawer); elsewhere it routes to the projects
          // list — a work item always needs its project first.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Create Work Item',
            action: () => {
              if (/^\/dashboard\/agency\/projects\/[^/]+/.test(pathname)) {
                window.dispatchEvent(new CustomEvent('open-new-agency-work-item'));
              } else {
                router.push('/dashboard/agency/projects');
              }
            },
            icon: Briefcase,
            section: 'Agency Actions'
          }] : []),
          // Module 6 (§117 pattern) — the Rate Cards console. Admins only
          // (§98: manage + cost.read are admin permissions); a USER never
          // sees rate-management affordances.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Go to Rate Cards',
            action: () => router.push('/dashboard/agency/rate-cards'),
            icon: Tags,
            section: 'Agency Actions'
          }] : []),
          // Module 6 (§117) — Create Rate Card is LIVE. Admins only (§98);
          // navigate + dispatch, same pattern as Create Client/Project.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Create Rate Card',
            action: () => {
              if (pathname !== '/dashboard/agency/rate-cards') {
                router.push('/dashboard/agency/rate-cards');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-rate-card')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-rate-card'));
              }
            },
            icon: Tags,
            section: 'Agency Actions'
          }] : []),
          // Module 7 (§27) — Log Time is LIVE. Everyone in an agency
          // workspace logs time; navigate + dispatch, same pattern as Create
          // Client/Project.
          {
            name: 'Log Time',
            action: () => {
              if (pathname !== '/dashboard/agency/time') {
                router.push('/dashboard/agency/time');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-time-entry')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-time-entry'));
              }
            },
            icon: Clock,
            section: 'Agency Actions'
          },
          // Module 7 (§8 Path B) — Start Timer: the fastest interaction in
          // the PRD (§74: Cmd/Ctrl+K → Start Timer → Select Project →
          // Start). Navigates to the time page and focuses the timer's
          // start form (a running session surfaces its stop/review).
          {
            name: 'Start Timer',
            action: () => {
              if (pathname !== '/dashboard/agency/time') {
                router.push('/dashboard/agency/time');
                setTimeout(() => window.dispatchEvent(new CustomEvent('focus-agency-timer')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('focus-agency-timer'));
              }
            },
            icon: Clock,
            section: 'Agency Actions'
          },
          // Module 8 (§53) — Record Expense is LIVE. Everyone in an agency
          // workspace records spend; navigate + dispatch, same pattern.
          {
            name: 'Record Expense',
            action: () => {
              if (pathname !== '/dashboard/agency/expenses') {
                router.push('/dashboard/agency/expenses');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-expense')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-expense'));
              }
            },
            icon: Receipt,
            section: 'Agency Actions'
          },
          // Module 9 (§67/§81/§117) — Create Invoice is LIVE. Admins only
          // (invoicing is admin/finance work); navigate + dispatch, same
          // pattern as Create Client/Project.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Create Invoice',
            action: () => {
              if (pathname !== '/dashboard/agency/invoices') {
                router.push('/dashboard/agency/invoices');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-invoice')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-invoice'));
              }
            },
            icon: FileSpreadsheet,
            section: 'Agency Actions'
          }] : []),
          // Module 9 (§85) — the invoice centre, with the derived-OVERDUE
          // filter pre-set (§80 — display derivation, never a stored state).
          {
            name: 'View Invoices',
            action: () => router.push('/dashboard/agency/invoices'),
            icon: FileText,
            section: 'Agency Actions'
          },
          {
            name: 'View Overdue Invoices',
            action: () => router.push('/dashboard/agency/invoices?status=OVERDUE'),
            icon: FileText,
            section: 'Agency Actions'
          },
          // Module 14 — the A/R operating view (§100 deep-link target).
          {
            name: 'Go to Receivables',
            action: () => router.push('/dashboard/agency/receivables'),
            icon: Hourglass,
            section: 'Agency Actions'
          },
          // Module 10 (§110/§117) — Record Payment is LIVE. Admins only
          // (money movement is admin/finance work); navigate + dispatch, the
          // Create Invoice pattern.
          ...(user.role === 'TENANT_ADMIN' ? [{
            name: 'Record Payment',
            action: () => {
              if (pathname !== '/dashboard/agency/payments') {
                router.push('/dashboard/agency/payments?new=1');
              } else {
                window.dispatchEvent(new CustomEvent('open-new-payment'));
              }
            },
            icon: IndianRupee,
            section: 'Agency Actions'
          }] : []),
          {
            name: 'View Payments',
            action: () => router.push('/dashboard/agency/payments'),
            icon: IndianRupee,
            section: 'Agency Actions'
          },
          // Module 13 (§81) — the portfolio profitability reports (the
          // Module 1 placeholder pointed here before the page existed).
          {
            name: 'View Profitability',
            action: () => router.push('/dashboard/agency/profitability'),
            icon: PieChart,
            section: 'Agency Actions'
          },
          // Module 15 (§23) — the Alert Center: filterable stored alerts with
          // acknowledge/resolve (admin-gated inside the page). Everyone in the
          // workspace may open it (reads ride agency.dashboard.read).
          {
            name: 'Go to Alert Center',
            action: () => router.push('/dashboard/agency/alerts'),
            icon: Bell,
            section: 'Agency Actions'
          },
          // Module 16 (§38) — the Reports center: the five engine-backed
          // reports (portfolio, profitability, time, unbilled, receivables).
          // Everyone in the workspace may open it; the cost reports gate on
          // agency.profitability.read server-side (§114).
          {
            name: 'Go to Reports',
            action: () => router.push('/dashboard/agency/reports'),
            icon: BarChart3,
            section: 'Agency Actions'
          },
          // Module 17 (§53) — Agency Settings: the five configuration
          // sections (general/billing/profitability/tax/payments). Everyone
          // in the workspace may READ; the save paths gate on
          // agency.settings.manage server-side (§55).
          {
            name: 'Go to Agency Settings',
            action: () => router.push('/dashboard/agency/settings'),
            icon: SlidersHorizontal,
            section: 'Agency Actions'
          }
        );
      }

      if (user.role === 'TENANT_ADMIN') {
        list.push(
          { name: 'Go to Team Workspace', action: () => router.push('/dashboard/team'), icon: Shield, section: 'Administration' },
          { name: 'Go to Audit Trail Logs', action: () => router.push('/dashboard/audit'), icon: FileText, section: 'Administration' },
          { name: 'Go to Settings', action: () => router.push(isAgencyWorkspace ? '/dashboard/agency/settings' : '/dashboard/settings'), icon: Settings, section: 'Administration' }
        );
      }

      // Quick actions triggers
      list.push(
        { 
          name: 'Create Transaction Record', 
          action: () => {
            if (pathname !== '/dashboard/transactions') {
              router.push('/dashboard/transactions');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-transaction')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-new-transaction'));
            }
          }, 
          icon: Plus, 
          section: 'Quick Actions' 
        },
        { 
          name: 'Create Budget Limit', 
          action: () => {
            if (pathname !== '/dashboard/budgets') {
              router.push('/dashboard/budgets');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-budget')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-new-budget'));
            }
          }, 
          icon: Plus, 
          section: 'Quick Actions' 
        },
        { 
          name: 'Configure Financial Account', 
          action: () => {
            if (pathname !== '/dashboard/accounts') {
              router.push('/dashboard/accounts');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-account')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-new-account'));
            }
          }, 
          icon: Plus, 
          section: 'Quick Actions' 
        },
        // Module 2 (§117/§28) — agency workspaces use the agency client drawer,
        // and USERs (read-only, §28) get no create affordance at all there.
        ...(!isAgencyWorkspace || user.role === 'TENANT_ADMIN' ? [{
          name: isAgencyWorkspace ? 'Add Agency Client' : 'Add Client / Sponsor',
          action: () => {
            if (isAgencyWorkspace) {
              if (pathname !== '/dashboard/agency/clients') {
                router.push('/dashboard/agency/clients');
                setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-agency-client')), 500);
              } else {
                window.dispatchEvent(new CustomEvent('open-new-agency-client'));
              }
              return;
            }
            if (pathname !== '/dashboard/clients') {
              router.push('/dashboard/clients');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-client')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-new-client'));
            }
          },
          icon: Plus,
          section: 'Quick Actions'
        }] : [])
      );

      if (user.role === 'TENANT_ADMIN') {
        list.push({ 
          name: 'Invite Team Member', 
          action: () => {
            if (pathname !== '/dashboard/team') {
              router.push('/dashboard/team');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-invite-user')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-invite-user'));
            }
          }, 
          icon: Plus, 
          section: 'Quick Actions' 
        });
      }

      list.push({ name: 'Log Out of Session', action: handleLogout, icon: LogOut, section: 'Session' });
    }

    // If Super Admin is logged in
    if (user && user.role === 'SUPER_ADMIN') {
      list.push(
        { name: 'Go to Mission Control', action: () => router.push('/super-admin'), icon: TerminalSquare, section: 'Super Admin Console' },
        { name: 'Go to Organizations', action: () => router.push('/super-admin/tenants'), icon: Building2, section: 'Super Admin Console' },
        { name: 'Go to Global Users', action: () => router.push('/super-admin/users'), icon: Users, section: 'Super Admin Console' },
        { name: 'Go to Revenue Intelligence', action: () => router.push('/super-admin/revenue'), icon: BarChart3, section: 'Super Admin Console' },
        { name: 'Go to Agency Analytics', action: () => router.push('/super-admin/agency'), icon: Briefcase, section: 'Super Admin Console' },
        { name: 'Go to Growth & Funnels', action: () => router.push('/super-admin/growth'), icon: Activity, section: 'Super Admin Console' },
        { name: 'Go to Discovery Engine', action: () => router.push('/super-admin/discovery'), icon: Search, section: 'Super Admin Console' },
        { name: 'Go to Attribution', action: () => router.push('/super-admin/attribution'), icon: Activity, section: 'Super Admin Console' },
        { name: 'Go to Security Center', action: () => router.push('/super-admin/security'), icon: ShieldAlert, section: 'Super Admin Console' },
        { name: 'Go to Audit Logs', action: () => router.push('/super-admin/audit'), icon: FileText, section: 'Super Admin Console' },
        { name: 'Go to Event Audit', action: () => router.push('/super-admin/event-audit'), icon: FileText, section: 'Super Admin Console' },
        { name: 'Go to Analytics Diagnostics', action: () => router.push('/super-admin/analytics-diagnostics'), icon: Settings, section: 'Super Admin Console' },
        { name: 'Go to Feature Flags Manager', action: () => router.push('/super-admin/features'), icon: Settings, section: 'Super Admin Console' },
        { name: 'Go to Support Ops', action: () => router.push('/super-admin/support'), icon: HelpCircle, section: 'Super Admin Console' },
        { name: 'Go to Communications Broadcast', action: () => router.push('/super-admin/communications'), icon: Sparkles, section: 'Super Admin Console' },
        { name: 'Go to Platform Settings', action: () => router.push('/super-admin/settings'), icon: Settings, section: 'Super Admin Console' },
        { name: 'Log Out of Session', action: handleLogout, icon: LogOut, section: 'Session' }
      );
    }

    // Default Guest/Unauthenticated options
    if (!user) {
      list.push(
        { name: 'Log In to Workspace', action: () => router.push('/login'), icon: Shield, section: 'Account Gateway' },
        { name: 'Sign Up for Money OS', action: () => router.push('/signup'), icon: Plus, section: 'Account Gateway' }
      );
    }

    return list;
  };

  const commands = getCommands();

  // Combine query matches from database search AND commands list
  const getCombinedItems = () => {
    const items: any[] = [];

    // Filter local commands matching input
    const matchedCommands = commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query.toLowerCase()) || 
      cmd.section.toLowerCase().includes(query.toLowerCase())
    );

    matchedCommands.forEach(cmd => {
      items.push({
        id: `cmd-${cmd.name}`,
        name: cmd.name,
        section: cmd.section,
        icon: cmd.icon,
        action: () => {
          captureEvent('COMMAND_EXECUTED', { commandName: cmd.name, section: cmd.section });
          cmd.action();
          setIsOpen(false);
          setQuery('');
        }
      });
    });

    // Append DB search matches
    if (searchResults) {
      if (searchResults.transactions?.length > 0) {
        searchResults.transactions.forEach((tx: any) => {
          items.push({
            id: `tx-${tx.id}`,
            name: `${tx.description} (${tx.category || 'Uncategorized'})`,
            section: 'Transactions Matches',
            icon: Activity,
            action: () => {
              router.push('/dashboard/transactions');
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.accounts?.length > 0) {
        searchResults.accounts.forEach((acc: any) => {
          items.push({
            id: `acc-${acc.id}`,
            name: `${acc.name} (${acc.type})`,
            section: 'Accounts Matches',
            icon: Wallet,
            action: () => {
              router.push('/dashboard/accounts');
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.clients?.length > 0) {
        searchResults.clients.forEach((c: any) => {
          items.push({
            id: `client-${c.id}`,
            name: `${c.name} - ${c.email || 'No Email'}`,
            // Module 2 (§118) — agency workspaces deep-link into the agency
            // client detail page, not the core Clients Directory.
            section: isAgencyWorkspace ? 'Agency Clients Matches' : 'Clients Directory Matches',
            icon: Users,
            action: () => {
              router.push(isAgencyWorkspace ? `/dashboard/agency/clients/${c.id}` : '/dashboard/clients');
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.budgets?.length > 0) {
        searchResults.budgets.forEach((b: any) => {
          items.push({
            id: `budget-${b.id}`,
            name: `Limit for ${b.category}: ₹${b.limitAmount.toLocaleString()}`,
            section: 'Budgets Matches',
            icon: PieChart,
            action: () => {
              router.push('/dashboard/budgets');
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.tenants?.length > 0) {
        searchResults.tenants.forEach((t: any) => {
          items.push({
            id: `tenant-${t.id}`,
            name: `${t.name} (Status: ${t.status})`,
            section: 'Tenant Records Matches',
            icon: Building2,
            action: () => {
              router.push(`/super-admin/tenants`);
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.users?.length > 0) {
        searchResults.users.forEach((u: any) => {
          items.push({
            id: `user-${u.id}`,
            name: `${u.username} (${u.role})`,
            section: 'User Profiles Matches',
            icon: User,
            action: () => {
              router.push(`/super-admin/users`);
              setIsOpen(false);
            }
          });
        });
      }

      if (searchResults.help?.length > 0) {
        searchResults.help.forEach((h: any) => {
          items.push({
            id: `help-${h.title}`,
            name: h.title,
            section: 'Help & Documentation',
            icon: HelpCircle,
            action: () => {
              router.push(h.path);
              setIsOpen(false);
            }
          });
        });
      }
    }

    return items;
  };

  const combinedItems = getCombinedItems();

  // 5. Scroll Selected Item into View
  useEffect(() => {
    if (itemsRef.current[selectedIndex]) {
      itemsRef.current[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  // 6. Handle Arrow Keys & Enter Keydown Event listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleListKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % combinedItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + combinedItems.length) % combinedItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (combinedItems[selectedIndex]) {
          combinedItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleListKeys);
    return () => window.removeEventListener('keydown', handleListKeys);
  }, [isOpen, selectedIndex, combinedItems]);

  if (!isOpen) return null;

  // Render list items by grouping section headers
  const renderList = () => {
    if (combinedItems.length === 0) {
      return (
        <div className="py-12 sm:py-16 text-center px-4">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-neutral-500">
            <Search className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-medium text-white">No matches found</p>
          <p className="text-[12.5px] text-neutral-400 mt-1 max-w-sm mx-auto">
            No commands or records matching &ldquo;{query}&rdquo;
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
            <span className="text-[11px] text-neutral-500 mr-1">Try searching:</span>
            {['Invoices', 'Projects', 'Clients', 'Command Center', 'Reports'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] text-neutral-300 hover:text-white transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Group items by section
    const sections: { [key: string]: any[] } = {};
    combinedItems.forEach((item, index) => {
      if (!sections[item.section]) sections[item.section] = [];
      sections[item.section].push({ ...item, globalIndex: index });
    });

    return (
      <div className="space-y-4" role="listbox">
        {Object.keys(sections).map(sectionTitle => (
          <div key={sectionTitle} className="space-y-1">
            <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2 select-none">
              <span>{sectionTitle}</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            <div className="space-y-0.5">
              {sections[sectionTitle].map((item) => {
                const isSelected = item.globalIndex === selectedIndex;
                return (
                  <button
                    key={item.id}
                    ref={el => {
                      if (el) itemsRef.current[item.globalIndex] = el;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(item.globalIndex)}
                    onClick={item.action}
                    className={`w-full flex items-center justify-between px-3 py-2 sm:py-2 rounded-xl text-left text-[13.5px] sm:text-[14px] font-medium transition-all group min-h-[40px] ${
                      isSelected 
                        ? 'bg-white/[0.1] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] border border-white/[0.1]' 
                        : 'text-neutral-300 hover:text-white hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected 
                          ? 'bg-white text-black shadow-sm' 
                          : 'bg-white/[0.05] text-neutral-400 group-hover:text-white group-hover:bg-white/[0.08]'
                      }`}>
                        <item.icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSelected ? (
                        <span className="text-[10.5px] text-neutral-200 font-medium px-2 py-0.5 rounded-md bg-white/10 border border-white/10 flex items-center gap-1 animate-in fade-in duration-100">
                          <span>Select</span>
                          <CornerDownLeft className="w-3 h-3 text-neutral-300" />
                        </span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100 text-[11px] text-neutral-500 font-mono transition-opacity">
                          ↵
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[12vh] px-3 sm:px-4 pb-6 overflow-y-auto"
      role="dialog" 
      aria-modal="true"
      aria-label="System Command Palette"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-xl transition-opacity duration-300" 
        onClick={() => setIsOpen(false)} 
      />
      
      {/* Container Card */}
      <div className="relative w-full max-w-xl bg-[#0d0d0f]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_24px_68px_-12px_rgba(0,0,0,0.9),0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 my-auto sm:my-0">
        
        {/* Ambient Top Subtle Line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        {/* Search Input Bar */}
        <div className="flex items-center px-3.5 sm:px-4 h-14 border-b border-white/[0.08] gap-2.5 sm:gap-3 relative">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-neutral-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Type commands or search dynamic records..."
            value={query}
            aria-autocomplete="list"
            onChange={(e) => setQuery(e.target.value)}
            style={{ outline: 'none', boxShadow: 'none' }}
            className="flex-1 h-full bg-transparent border-0 text-[14px] sm:text-[14.5px] text-white placeholder:text-neutral-500 !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 p-0"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
          )}
          {query && (
            <button 
              type="button"
              onClick={() => setQuery('')}
              className="px-2 py-0.5 text-[11px] rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-neutral-400 hover:text-white transition-colors shrink-0"
            >
              Clear
            </button>
          )}
          <button 
            type="button"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0" 
            onClick={() => setIsOpen(false)}
            aria-label="Close dialog"
          >
             <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div 
          ref={listRef}
          className="max-h-[60vh] sm:max-h-[52vh] overflow-y-auto p-2 sm:p-2.5 scrollbar-thin scrollbar-thumb-white/10"
        >
          {renderList()}
        </div>
        
        {/* Keyboard Shortcuts Footer */}
        <div className="h-11 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between px-4 text-[11px] font-medium text-neutral-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] font-mono text-[9.5px] text-neutral-300 shadow-sm">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] font-mono text-[9.5px] text-neutral-300 shadow-sm">↓</kbd>
              <span className="hidden xs:inline text-neutral-400">Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] font-mono text-[9.5px] text-neutral-300 shadow-sm">↵</kbd>
              <span className="hidden xs:inline text-neutral-400">Select</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-neutral-500 text-[10.5px] hidden sm:inline">
              {combinedItems.length} {combinedItems.length === 1 ? 'command' : 'commands'}
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] font-mono text-[9.5px] text-neutral-300 shadow-sm">esc</kbd>
              <span className="hidden xs:inline text-neutral-400">Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
