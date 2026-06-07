import React from 'react';
import Link from 'next/link';

export default function DocsPage() {
  return (
    <div className="flex items-start pb-24 max-w-7xl mx-auto w-full px-6 pt-24 gap-12">
      {/* Sidebar */}
      <aside className="hidden md:block w-64 shrink-0 sticky top-24">
        <div className="space-y-8">
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-3">Getting Started</h4>
            <ul className="space-y-2 text-[13px] text-neutral-400">
              <li><Link href="/docs/quickstart" className="hover:text-white transition-colors">Quickstart Guide</Link></li>
              <li><Link href="/docs/workspaces" className="hover:text-white transition-colors">Setting up Workspaces</Link></li>
              <li><Link href="/docs/importing" className="hover:text-white transition-colors">Importing Data</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-white mb-3">Core Features</h4>
            <ul className="space-y-2 text-[13px] text-neutral-400">
              <li><Link href="/docs/transactions" className="hover:text-white transition-colors">Logging Transactions</Link></li>
              <li><Link href="/docs/budgets" className="hover:text-white transition-colors">Managing Budgets</Link></li>
              <li><Link href="/docs/recurring" className="hover:text-white transition-colors">Recurring Expenses</Link></li>
              <li><Link href="/docs/reports" className="hover:text-white transition-colors">Generating Reports</Link></li>
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 prose prose-invert prose-neutral max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-white mb-4">Documentation</h1>
        <p className="text-lg text-neutral-400 mb-12">
          Everything you need to know about setting up and using Money OS for your organization.
        </p>

        <hr className="border-white/[0.05] my-8" />

        <h2 className="text-2xl font-semibold text-white mt-12 mb-4">Introduction</h2>
        <p className="text-[15px] text-neutral-300 leading-relaxed mb-6">
          Money OS is a double-entry financial operating system built for speed and strict tenant isolation. Unlike consumer budgeting apps, Money OS requires transactions to be linked to specific accounts and categories, ensuring your ledger is always perfectly balanced.
        </p>

        <h3 className="text-xl font-semibold text-white mt-10 mb-4">Core Concepts</h3>
        <div className="grid sm:grid-cols-2 gap-4 not-prose mb-12">
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
            <div className="font-semibold text-white mb-2 text-[14px]">Workspaces (Tenants)</div>
            <div className="text-[13px] text-neutral-400">The top-level container for your data. All accounts, categories, and transactions belong to a single workspace.</div>
          </div>
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
            <div className="font-semibold text-white mb-2 text-[14px]">Accounts</div>
            <div className="text-[13px] text-neutral-400">Represent your actual bank accounts, credit cards, or cash repositories.</div>
          </div>
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
            <div className="font-semibold text-white mb-2 text-[14px]">Categories</div>
            <div className="text-[13px] text-neutral-400">Used to classify income and expenses (e.g., "Software Subscriptions", "Client Retainers").</div>
          </div>
          <div className="p-5 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
            <div className="font-semibold text-white mb-2 text-[14px]">Transactions</div>
            <div className="text-[13px] text-neutral-400">The movement of money. Every transaction must be linked to an Account and a Category.</div>
          </div>
        </div>

        <p className="text-[14px] text-neutral-500">
          Ready to dive in? Head over to the <Link href="/docs/quickstart" className="text-white underline underline-offset-4">Quickstart Guide</Link>.
        </p>
      </main>
    </div>
  );
}
