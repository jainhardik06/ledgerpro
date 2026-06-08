"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#000000] text-[#ededed] font-sans selection:bg-neutral-800 selection:text-white flex flex-col">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#000000]/70 backdrop-blur-md border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo href="/" size={18} showBeta={true} />

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-neutral-400">
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <div className="w-px h-4 bg-white/[0.1] mx-2" />
            <Link href="/login" className="hover:text-white transition-colors">Log in</Link>
            <Link href="/login">
              <Button variant="default" size="sm" className="bg-white text-black hover:bg-neutral-200">
                Start Workspace
              </Button>
            </Link>
          </nav>

          {/* Mobile Toggle */}
          <button 
            className="md:hidden p-2 text-neutral-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 bg-[#000000] border-b border-white/[0.05] p-6 flex flex-col gap-4 text-sm font-medium animate-in">
            <Link href="/about" className="text-neutral-300" onClick={() => setMobileMenuOpen(false)}>About</Link>
            <Link href="/contact" className="text-neutral-300" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
            <hr className="border-white/[0.05]" />
            <Link href="/login" className="text-neutral-300" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full bg-white text-black mt-2">Start Workspace</Button>
            </Link>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-14">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.05] bg-[#000000] py-16 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <div className="mb-4">
              <Logo href="/" size={22} showBeta={true} />
            </div>
            <p className="text-[13px] text-neutral-500">
              The financial operating system for modern teams. Built with precision, speed, and design in mind.
            </p>
          </div>
          
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Features</h4>
            <ul className="space-y-3 text-[13px] text-neutral-500">
              <li><Link href="/features/expense-tracking" className="hover:text-white transition-colors">Expense Tracking</Link></li>
              <li><Link href="/features/budgets" className="hover:text-white transition-colors">Budgets</Link></li>
              <li><Link href="/features/teams" className="hover:text-white transition-colors">Teams</Link></li>
              <li><Link href="/features/audit-logs" className="hover:text-white transition-colors">Audit Logs</Link></li>
              <li><Link href="/features/reports" className="hover:text-white transition-colors">Reports</Link></li>
              <li><Link href="/features/recurring-transactions" className="hover:text-white transition-colors">Recurring</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Use Cases</h4>
            <ul className="space-y-3 text-[13px] text-neutral-500">
              <li><Link href="/use-cases/freelancers" className="hover:text-white transition-colors">Freelancers</Link></li>
              <li><Link href="/use-cases/agencies" className="hover:text-white transition-colors">Agencies</Link></li>
              <li><Link href="/use-cases/student-clubs" className="hover:text-white transition-colors">Student Clubs</Link></li>
              <li><Link href="/use-cases/small-businesses" className="hover:text-white transition-colors">Small Businesses</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-3 text-[13px] text-neutral-500">
              <li><Link href="/support" className="hover:text-white transition-colors">Support Center</Link></li>
              <li><Link href="/docs" className="hover:text-white transition-colors">Documentation</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3 text-[13px] text-neutral-500">
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="/security" className="hover:text-white transition-colors">Security</Link></li>
              <li><Link href="/status" className="hover:text-white transition-colors">System Status</Link></li>
              <li><Link href="/changelog" className="hover:text-white transition-colors">Changelog</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-3 text-[13px] text-neutral-500">
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link></li>
              <li><Link href="/refund-policy" className="hover:text-white transition-colors">Refund Policy</Link></li>
              <li><Link href="/dpa" className="hover:text-white transition-colors">DPA</Link></li>
              <li><Link href="/accessibility" className="hover:text-white transition-colors">Accessibility</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4 text-[13px] text-neutral-600">
          <p>© {new Date().getFullYear()} Money OS Inc. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="https://twitter.com" className="hover:text-white">Twitter</Link>
            <Link href="https://github.com" className="hover:text-white">GitHub</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
