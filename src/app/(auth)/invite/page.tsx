"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, UserPlus, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function InvitePage() {
  const [accepted, setAccepted] = useState(false);

  if (accepted) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20">
          <UserPlus className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Invitation Accepted</h1>
        <p className="text-[14px] text-neutral-400 mb-8 max-w-[280px]">
          You have successfully joined the workspace.
        </p>
        <Link href="/dashboard" className="w-full">
           <Button className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium">Open Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-8">
        <span className="text-2xl font-bold text-indigo-400">AC</span>
      </div>
      
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Acme Corp</h1>
      <p className="text-[14px] text-neutral-400 mb-8">
        <span className="text-white font-medium">John Doe</span> has invited you to join their workspace as an <span className="text-white font-medium">Admin</span>.
      </p>

      <div className="bg-[#0a0a0a] border border-white/[0.05] p-4 rounded-xl mb-8 flex items-start gap-3">
         <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0" />
         <p className="text-[12px] text-neutral-400 leading-relaxed">
           By accepting this invitation, you agree to access this organization's financial data. All actions taken within this workspace are logged for audit purposes.
         </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button 
          onClick={() => setAccepted(true)} 
          className="w-full h-12 bg-white text-black hover:bg-neutral-200 text-[15px] font-medium group"
        >
          Accept Invitation <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
        </Button>
        <Link href="/">
           <Button variant="outline" className="w-full h-12 border-white/[0.1] text-white hover:bg-white/[0.05] text-[15px] font-medium">Decline</Button>
        </Link>
      </div>
    </div>
  );
}
