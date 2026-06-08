"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Search, Home, Activity, Wallet, PieChart, Repeat, Users, BarChart3, 
  Settings, Shield, X, CornerDownLeft, FileText, HelpCircle, Building2, 
  User, Plus, LogOut, ShieldAlert, Sparkles, TerminalSquare
} from 'lucide-react';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<any>(null);
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
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    const handleOpenEvent = () => setIsOpen(true);
    
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
          const impStr = typeof window !== 'undefined' ? localStorage.getItem('impersonating_tenant') : null;
          if (impStr) {
            try {
              const imp = JSON.parse(impStr);
              data.user.tenantId = imp.id;
              data.user.role = 'TENANT_ADMIN';
            } catch (e) {}
          }
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));
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
    }, 150);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Logout utility
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setIsOpen(false);
    router.push('/login');
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
        { name: 'Go to Clients Directory', action: () => router.push('/dashboard/clients'), icon: Users, section: 'Workspace' },
        { name: 'Go to Performance Reports', action: () => router.push('/dashboard/reports'), icon: BarChart3, section: 'Workspace' }
      );

      if (user.role === 'TENANT_ADMIN') {
        list.push(
          { name: 'Go to Team Workspace', action: () => router.push('/dashboard/team'), icon: Shield, section: 'Administration' },
          { name: 'Go to Audit Trail Logs', action: () => router.push('/dashboard/audit'), icon: FileText, section: 'Administration' },
          { name: 'Go to Settings', action: () => router.push('/dashboard/settings'), icon: Settings, section: 'Administration' }
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
        { 
          name: 'Add Client / Sponsor', 
          action: () => {
            if (pathname !== '/dashboard/clients') {
              router.push('/dashboard/clients');
              setTimeout(() => window.dispatchEvent(new CustomEvent('open-new-client')), 500);
            } else {
              window.dispatchEvent(new CustomEvent('open-new-client'));
            }
          }, 
          icon: Plus, 
          section: 'Quick Actions' 
        }
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
        { name: 'Go to Security Center', action: () => router.push('/super-admin/security'), icon: ShieldAlert, section: 'Super Admin Console' },
        { name: 'Go to Audit Logs', action: () => router.push('/super-admin/audit'), icon: FileText, section: 'Super Admin Console' },
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
            section: 'Clients Directory Matches',
            icon: Users,
            action: () => {
              router.push('/dashboard/clients');
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
        <div className="py-14 text-center text-[13px] text-neutral-500">
          No matches found for "{query}"
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
            <div className="px-3 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-widest bg-white/[0.01] rounded">
              {sectionTitle}
            </div>
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
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-[13.5px] font-medium transition-colors group ${
                    isSelected 
                      ? 'bg-white/[0.08] text-white' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-4 h-4 transition-colors ${isSelected ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
                    <span>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1">
                        <span>Select</span>
                        <CornerDownLeft className="w-3 h-3 text-neutral-600" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4"
      role="dialog" 
      aria-modal="true"
      aria-label="System Command Palette"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300" 
        onClick={() => setIsOpen(false)} 
      />
      
      {/* Container Card */}
      <div className="relative w-full max-w-xl bg-[#0a0a0a]/95 border border-white/[0.08] rounded-xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Search Input Bar */}
        <div className="flex items-center px-4 h-14 border-b border-white/[0.05]">
          <Search className="w-4 h-4 text-neutral-500 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type commands or search dynamic records..."
            value={query}
            aria-autocomplete="list"
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 h-full bg-transparent border-none text-[14px] text-white placeholder:text-neutral-600 outline-none px-3"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-3" />
          )}
          <button 
            className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-colors" 
            onClick={() => setIsOpen(false)}
            aria-label="Close dialog"
          >
             <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div 
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto p-2 scrollbar-none"
        >
          {renderList()}
        </div>
        
        {/* Keyboard Shortcuts Footer */}
        <div className="h-10 border-t border-white/[0.05] bg-white/[0.01] flex items-center justify-between px-4 text-[10.5px] font-medium text-neutral-500">
          <div className="flex items-center gap-3">
             <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono text-[9px]">↑</kbd><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono text-[9px]">↓</kbd> navigate</span>
             <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono text-[9px]">↵</kbd> select</span>
          </div>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] font-mono text-[9px]">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
