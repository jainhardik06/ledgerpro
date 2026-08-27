"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Menu, X, ChevronDown, Activity, PieChart, Users, FileText, 
  BarChart3, Repeat, Briefcase, GraduationCap, Building, 
  HelpCircle, BookOpen, Notebook, Shield, Info, ActivitySquare, History 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const FEATURES = [
  { name: 'Expense Tracking', desc: 'Real-time ledger entry and flow tracking.', path: '/features/expense-tracking', icon: Activity },
  { name: 'Budgets', desc: 'Category-specific monthly spending limits.', path: '/features/budgets', icon: PieChart },
  { name: 'Teams', desc: 'Multi-user collaboration with RBAC.', path: '/features/teams', icon: Users },
  { name: 'Audit Logs', desc: 'Immutable chronological event traces.', path: '/features/audit-logs', icon: FileText },
  { name: 'Reports', desc: 'Modular business intelligence engines.', path: '/features/reports', icon: BarChart3 },
  { name: 'Recurring', desc: 'Automate scheduling of recurring items.', path: '/features/recurring-transactions', icon: Repeat },
];

const USE_CASES = [
  { name: 'Freelancers', desc: 'Manage solopreneur cash flows simply.', path: '/use-cases/freelancers', icon: Users },
  { name: 'Agencies', desc: 'Isolate client accounts and reporting.', path: '/use-cases/agencies', icon: Briefcase },
  { name: 'Student Clubs', desc: 'Track sponsorships and budgets.', path: '/use-cases/student-clubs', icon: GraduationCap },
  { name: 'Small Businesses', desc: 'Full double-entry general ledger.', path: '/use-cases/small-businesses', icon: Building },
];

const RESOURCES = [
  { name: 'Support Center', desc: 'Help guides and ticketing workspace.', path: '/support', icon: HelpCircle },
  { name: 'Documentation', desc: 'Developer docs and setup guidelines.', path: '/docs', icon: BookOpen },
  { name: 'Blog', desc: 'Product news and ledger articles.', path: '/blog', icon: Notebook },
];

const COMPANY = [
  { name: 'About Us', desc: 'Our mission and story.', path: '/about', icon: Info },
  { name: 'Contact', desc: 'Reach out to our sales and support teams.', path: '/contact', icon: HelpCircle },
  { name: 'Security', desc: 'Tenant isolation and encryption metrics.', path: '/security', icon: Shield },
  { name: 'System Status', desc: 'Real-time service operational checks.', path: '/status', icon: ActivitySquare },
  { name: 'Changelog', desc: 'Chronological timeline of product releases.', path: '/changelog', icon: History },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [expandedAccordion, setExpandedAccordion] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { isInstallable, promptInstall } = usePwaInstall();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dashboardPath = user?.role === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard';

  // Toggle mobile accordion
  const toggleAccordion = (name: string) => {
    setExpandedAccordion(expandedAccordion === name ? null : name);
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[#ededed] font-sans selection:bg-neutral-800 selection:text-white flex flex-col">
      {/* Keyboard Access Skip Link */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:rounded-md focus:font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        Skip to content
      </a>

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#000000]/70 backdrop-blur-md border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Logo href="/" size={18} showBeta={true} />

          {/* Desktop Nav */}
          <nav 
            className="hidden md:flex items-center gap-6 text-[13px] font-medium text-neutral-400"
            onMouseLeave={() => setActiveDropdown(null)}
          >
            {/* Features Dropdown */}
            <div className="relative py-4" onMouseEnter={() => setActiveDropdown('features')}>
              <button 
                className={`flex items-center gap-1 transition-colors hover:text-white focus:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1 ${activeDropdown === 'features' ? 'text-white' : ''}`}
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'features'}
              >
                Features <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'features' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'features' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 w-[380px] bg-[#0a0a0a]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl grid grid-cols-1 gap-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {FEATURES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500">
                      <div className="w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-white/10 transition-colors">
                        <item.icon className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white mb-0.5">{item.name}</div>
                        <div className="text-[11px] text-neutral-500 leading-normal">{item.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Use Cases Dropdown */}
            <div className="relative py-4" onMouseEnter={() => setActiveDropdown('use-cases')}>
              <button 
                className={`flex items-center gap-1 transition-colors hover:text-white focus:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1 ${activeDropdown === 'use-cases' ? 'text-white' : ''}`}
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'use-cases'}
              >
                Use Cases <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'use-cases' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'use-cases' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 w-[340px] bg-[#0a0a0a]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl grid grid-cols-1 gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {USE_CASES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500">
                      <div className="w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-white/10 transition-colors">
                        <item.icon className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white mb-0.5">{item.name}</div>
                        <div className="text-[11px] text-neutral-500 leading-normal">{item.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Resources Dropdown */}
            <div className="relative py-4" onMouseEnter={() => setActiveDropdown('resources')}>
              <button 
                className={`flex items-center gap-1 transition-colors hover:text-white focus:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1 ${activeDropdown === 'resources' ? 'text-white' : ''}`}
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'resources'}
              >
                Resources <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'resources' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'resources' && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 w-[320px] bg-[#0a0a0a]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl grid grid-cols-1 gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {RESOURCES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500">
                      <div className="w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-white/10 transition-colors">
                        <item.icon className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white mb-0.5">{item.name}</div>
                        <div className="text-[11px] text-neutral-500 leading-normal">{item.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Company Dropdown */}
            <div className="relative py-4" onMouseEnter={() => setActiveDropdown('company')}>
              <button 
                className={`flex items-center gap-1 transition-colors hover:text-white focus:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1 ${activeDropdown === 'company' ? 'text-white' : ''}`}
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'company'}
              >
                Company <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${activeDropdown === 'company' ? 'rotate-180' : ''}`} />
              </button>
              {activeDropdown === 'company' && (
                <div className="absolute top-full right-0 mt-0.5 w-[340px] bg-[#0a0a0a]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl grid grid-cols-1 gap-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {COMPANY.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors group focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500">
                      <div className="w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0 group-hover:border-white/10 transition-colors">
                        <item.icon className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white mb-0.5">{item.name}</div>
                        <div className="text-[11px] text-neutral-500 leading-normal">{item.desc}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-white/[0.1] mx-1" />
            
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : user ? (
              <Link href={dashboardPath}>
                <Button variant="default" size="sm" className="bg-white text-black hover:bg-neutral-200 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                  Go to Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 px-1.5 rounded py-0.5">Log in</Link>
                <Link href="/login">
                  <Button variant="default" size="sm" className="bg-white text-black hover:bg-neutral-200 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                    Start Workspace
                  </Button>
                </Link>
              </>
            )}
          </nav>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2 text-neutral-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-haspopup="true"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-[#000000] flex flex-col p-6 overflow-y-auto animate-in fade-in duration-200">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-8 shrink-0">
            <Logo href="/" size={18} showBeta={true} />
            <button 
              className="p-2 text-neutral-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Categories */}
          <div className="flex-1 space-y-4">
            {/* Features Accordion */}
            <div className="border-b border-white/[0.05] pb-3">
              <button 
                onClick={() => toggleAccordion('features')}
                className="w-full flex items-center justify-between text-[15px] font-semibold text-white py-2"
                aria-expanded={expandedAccordion === 'features'}
              >
                <span>Features</span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${expandedAccordion === 'features' ? 'rotate-180' : ''}`} />
              </button>
              {expandedAccordion === 'features' && (
                <div className="mt-2 grid grid-cols-1 gap-3 pl-2 animate-in fade-in duration-200">
                  {FEATURES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-center gap-3 py-1.5 text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="text-[13px]">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Use Cases Accordion */}
            <div className="border-b border-white/[0.05] pb-3">
              <button 
                onClick={() => toggleAccordion('use-cases')}
                className="w-full flex items-center justify-between text-[15px] font-semibold text-white py-2"
                aria-expanded={expandedAccordion === 'use-cases'}
              >
                <span>Use Cases</span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${expandedAccordion === 'use-cases' ? 'rotate-180' : ''}`} />
              </button>
              {expandedAccordion === 'use-cases' && (
                <div className="mt-2 grid grid-cols-1 gap-3 pl-2 animate-in fade-in duration-200">
                  {USE_CASES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-center gap-3 py-1.5 text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="text-[13px]">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Resources Accordion */}
            <div className="border-b border-white/[0.05] pb-3">
              <button 
                onClick={() => toggleAccordion('resources')}
                className="w-full flex items-center justify-between text-[15px] font-semibold text-white py-2"
                aria-expanded={expandedAccordion === 'resources'}
              >
                <span>Resources</span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${expandedAccordion === 'resources' ? 'rotate-180' : ''}`} />
              </button>
              {expandedAccordion === 'resources' && (
                <div className="mt-2 grid grid-cols-1 gap-3 pl-2 animate-in fade-in duration-200">
                  {RESOURCES.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-center gap-3 py-1.5 text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="text-[13px]">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Company Accordion */}
            <div className="border-b border-white/[0.05] pb-3">
              <button 
                onClick={() => toggleAccordion('company')}
                className="w-full flex items-center justify-between text-[15px] font-semibold text-white py-2"
                aria-expanded={expandedAccordion === 'company'}
              >
                <span>Company</span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${expandedAccordion === 'company' ? 'rotate-180' : ''}`} />
              </button>
              {expandedAccordion === 'company' && (
                <div className="mt-2 grid grid-cols-1 gap-3 pl-2 animate-in fade-in duration-200">
                  {COMPANY.map(item => (
                    <Link key={item.path} href={item.path} className="flex items-center gap-3 py-1.5 text-neutral-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="w-4 h-4 text-neutral-500 shrink-0" />
                      <span className="text-[13px]">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Auth Actions in Drawer Footer */}
          <div className="mt-8 pt-6 border-t border-white/[0.05] flex flex-col gap-4 shrink-0">
            <Button 
              variant="outline"
              className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-semibold h-11"
              onClick={() => {
                promptInstall();
                setMobileMenuOpen(false);
              }}
            >
              Download App
            </Button>
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            ) : user ? (
              <Link href={dashboardPath} onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-white text-black font-semibold h-11">Go to Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-center text-neutral-300 hover:text-white py-2 text-[14px]" onClick={() => setMobileMenuOpen(false)}>
                  Log in
                </Link>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full bg-white text-black font-semibold h-11">Start Workspace</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main id="main-content" className="flex-1 pt-14 focus:outline-none">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] bg-[#000000] py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-8 sm:gap-10">
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <div className="mb-4">
              <Logo href="/" size={22} showBeta={true} />
            </div>
            <p className="text-[13px] text-neutral-500">
              The financial operating system for modern teams. Built with precision, speed, and design in mind.
            </p>
          </div>
          
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Features</h4>
            <ul className="space-y-4 text-[13px] text-neutral-500">
              <li><Link href="/features/expense-tracking" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Expense Tracking</Link></li>
              <li><Link href="/features/budgets" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Budgets</Link></li>
              <li><Link href="/features/teams" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Teams</Link></li>
              <li><Link href="/features/audit-logs" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Audit Logs</Link></li>
              <li><Link href="/features/reports" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Reports</Link></li>
              <li><Link href="/features/recurring-transactions" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Recurring</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Use Cases</h4>
            <ul className="space-y-4 text-[13px] text-neutral-500">
              <li><Link href="/use-cases/freelancers" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Freelancers</Link></li>
              <li><Link href="/use-cases/agencies" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Agencies</Link></li>
              <li><Link href="/use-cases/student-clubs" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Student Clubs</Link></li>
              <li><Link href="/use-cases/small-businesses" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Small Businesses</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-4 text-[13px] text-neutral-500">
              <li><Link href="/support" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Support Center</Link></li>
              <li><Link href="/docs" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Documentation</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Blog</Link></li>
              <li><button onClick={promptInstall} className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded text-left">Download App</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-4 text-[13px] text-neutral-500">
              <li><Link href="/about" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Contact</Link></li>
              <li><Link href="/security" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Security</Link></li>
              <li><Link href="/status" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">System Status</Link></li>
              <li><Link href="/changelog" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Changelog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-4 text-[13px] text-neutral-500">
              <li><Link href="/privacy" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Terms of Service</Link></li>
              <li><Link href="/cookie-policy" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Cookie Policy</Link></li>
              <li><Link href="/refund-policy" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Refund Policy</Link></li>
              <li><Link href="/dpa" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">DPA</Link></li>
              <li><Link href="/accessibility" className="hover:text-white transition-colors focus:outline-none focus-visible:underline rounded">Accessibility</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 sm:mt-16 pt-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] text-neutral-600">
          <p>© {new Date().getFullYear()} Money OS Inc. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="https://twitter.com" className="hover:text-white focus:outline-none focus-visible:underline rounded px-1">Twitter</Link>
            <Link href="https://github.com" className="hover:text-white focus:outline-none focus-visible:underline rounded px-1">GitHub</Link>
          </div>
        </div>
      </footer>
      <CommandPalette />
    </div>
  );
}
