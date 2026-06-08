"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Sparkles, CheckCircle2, Circle, ArrowLeft, ArrowRight,
  Shield, Key, Users, ListFilter, CreditCard, PlusCircle, AlertTriangle, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ChecklistItem {
  id: string;
  title: string;
  desc: string;
  detail: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "login",
    title: "1. First Login & Profile Verification",
    desc: "Access your dashboard using your secure credentials.",
    detail: "Verify your email and review active session variables in Profile Settings. Ensure your session is safe before importing files."
  },
  {
    id: "org",
    title: "2. Create Your Workspace Organization",
    desc: "Set up the legal boundary of your financial records.",
    detail: "Workspaces form tenant boundaries. In Settings > Workspace, enter your legal name and set the base currency (e.g. INR)."
  },
  {
    id: "team",
    title: "3. Invite Key Collaborators",
    desc: "Invite accountants, business partners, or viewers.",
    detail: "Go to settings, dispatch secure team invitations, and assign either Admin, User, or Viewer roles depending on credentials."
  },
  {
    id: "categories",
    title: "4. Establish Categories & Ledger Accounts",
    desc: "Create category accounts for operating, asset, and revenue records.",
    detail: "Set up Checking Accounts, Savings, and Expense categories (e.g. Office Space, Cloud Hosting) to organize double-entry paths."
  },
  {
    id: "transaction",
    title: "5. Log Your First Transaction",
    desc: "Record your first income or expense to balance the ledger.",
    detail: "Click 'New Transaction' (or press 'N'), input the amount, match it to a category, and save to calculate cash flow instantly."
  },
  {
    id: "budgets",
    title: "6. Configure Budgets & Threshold Notifications",
    desc: "Set limits on operating spending categories.",
    detail: "Create a budget limit for recurring expenses (like software tools) and set alerts at 80% to monitor costs."
  }
];

export default function GettingStartedPage() {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const completedCount = Object.values(checkedItems).filter(Boolean).length;
  const progressPercent = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  return (
    <div className="w-full pt-32 pb-24 px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-4xl mx-auto">
        {/* Back Link */}
        <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8 font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-white/[0.05]">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-400" /> Getting Started Guide
            </h1>
            <p className="text-[14px] text-neutral-400">Follow these key onboarding steps to launch your Money OS financial command center.</p>
          </div>
          <Link href="/login">
            <Button className="bg-white text-black hover:bg-neutral-200 text-[12px] font-medium h-9 px-4 shrink-0">
              Open Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Progress Tracker Widget */}
        <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] mb-12 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[12px] font-semibold text-neutral-400 uppercase tracking-widest">Onboarding Progress</span>
            <span className="text-[14px] font-mono font-bold text-white">{progressPercent}% Completed</span>
          </div>
          <div className="w-full h-2 bg-white/[0.03] rounded-full overflow-hidden border border-white/[0.05]">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            {completedCount} of {CHECKLIST_ITEMS.length} steps marked done. Click step circles to track your progress.
          </p>
        </div>

        {/* Checklist Steps */}
        <div className="space-y-6">
          {CHECKLIST_ITEMS.map((item, idx) => {
            const isChecked = !!checkedItems[item.id];
            return (
              <div 
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`p-6 rounded-xl border transition-all cursor-pointer select-none flex gap-4 items-start ${
                  isChecked 
                    ? 'border-emerald-500/20 bg-emerald-500/[0.02]' 
                    : 'border-white/[0.05] bg-[#0a0a0a] hover:bg-white/[0.01]'
                }`}
              >
                <button 
                  className={`mt-0.5 shrink-0 transition-colors ${isChecked ? 'text-emerald-400' : 'text-neutral-600 hover:text-neutral-400'}`}
                >
                  {isChecked ? (
                    <CheckCircle2 className="w-5 h-5 fill-emerald-950/20" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className={`text-[14px] font-semibold transition-colors ${isChecked ? 'text-emerald-400 line-through' : 'text-white'}`}>
                    {item.title}
                  </h3>
                  <p className="text-[13px] text-neutral-400 mt-1">{item.desc}</p>
                  <p className="text-[12px] text-neutral-500 mt-3 border-l-2 border-white/[0.05] pl-3 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Call to Action Support banner */}
        <div className="mt-16 p-6 rounded-xl border border-white/[0.05] bg-white/[0.01] flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-[14px] font-semibold text-white">Stuck on organization configurations?</h4>
            <p className="text-[12px] text-neutral-400 mt-1">Our technical guides cover custom ledger settings and API mappings.</p>
          </div>
          <Link href="/docs">
            <Button variant="outline" className="border-white/[0.1] text-white hover:bg-white/[0.05] text-[12px] h-9 px-4 shrink-0">
              Read Documentation
            </Button>
          </Link>
        </div>

      </main>
    </div>
  );
}
