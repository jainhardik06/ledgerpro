"use client";

import React from 'react';
import Link from 'next/link';
import { HelpCircle, ArrowRight, Home, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#000000] text-white min-h-[80vh] px-6 py-24 text-center">
      <div className="max-w-md w-full flex flex-col items-center">
        {/* Error icon badge */}
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6">
          <HelpCircle className="w-8 h-8 text-rose-500" />
        </div>

        <h1 className="text-3xl font-semibold tracking-tighter text-white mb-2">Page Not Found</h1>
        <p className="text-[14px] text-neutral-400 mb-8 max-w-xs leading-relaxed">
          The page you are looking for does not exist or has been relocated to another sub-center.
        </p>

        {/* Action recovery buttons */}
        <div className="flex flex-col gap-3 w-full mb-10">
          <Link href="/">
            <Button className="w-full bg-white text-black hover:bg-neutral-200 text-[13px] font-medium h-11">
              <Home className="w-4 h-4 mr-2" /> Return to Homepage
            </Button>
          </Link>
          <Link href="/support">
            <Button variant="outline" className="w-full text-white border-white/[0.1] hover:bg-white/[0.05] text-[13px] h-11">
              Go to Support Center
            </Button>
          </Link>
        </div>

        {/* Suggested pathways */}
        <div className="w-full text-left border-t border-white/[0.05] pt-8">
          <h4 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Suggested Pathways</h4>
          <div className="space-y-3">
            <Link 
              href="/support/getting-started" 
              className="flex items-center justify-between p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.02] transition-colors group"
            >
              <span className="text-[12.5px] font-medium text-neutral-300 group-hover:text-white flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Getting Started Guide
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
            </Link>
            <Link 
              href="/contact-support" 
              className="flex items-center justify-between p-3 rounded-lg border border-white/[0.03] hover:border-white/[0.08] bg-white/[0.01] hover:bg-white/[0.02] transition-colors group"
            >
              <span className="text-[12.5px] font-medium text-neutral-300 group-hover:text-white flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Contact Support Team
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
