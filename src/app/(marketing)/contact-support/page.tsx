"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Clock, ShieldAlert, ArrowLeft, ArrowRight, MessageSquare, CheckCircle2, Paperclip, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ContactSupportPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    workspaceId: '',
    category: 'Ledger Reconciliation',
    priority: 'Medium',
    subject: '',
    message: ''
  });

  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to submit support request.');
      }
    } catch (err: any) {
      setErrorMsg('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Expected response mapping
  const responseTimes: Record<string, string> = {
    Low: "Within 24 Hours",
    Medium: "Within 12 Hours",
    High: "Within 4 Hours",
    Urgent: "Within 1 Hour"
  };

  return (
    <div className="w-full pt-32 pb-24 px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-4xl mx-auto">
        
        {/* Back Link */}
        <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8 font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
        </Link>

        {/* Header */}
        <div className="mb-12 pb-8 border-b border-white/[0.05]">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2 flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-indigo-400" /> Submit a Support Ticket
          </h1>
          <p className="text-[14px] text-neutral-400">Open a direct conversation with our platform engineering team.</p>
        </div>

        {submitted ? (
          /* Success Screen */
          <div className="max-w-lg mx-auto p-8 border border-emerald-500/20 bg-emerald-500/[0.02] text-center rounded-2xl flex flex-col items-center shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Ticket Submitted Successfully</h3>
            <p className="text-[13px] text-neutral-400 max-w-sm mb-6 leading-relaxed">
              Your support request has been logged. Our engineers will respond to <strong className="text-white">{formData.email}</strong> {responseTimes[formData.priority].toLowerCase()}.
            </p>
            <div className="text-[11px] text-neutral-500 font-mono bg-white/[0.03] border border-white/[0.05] p-3 rounded-lg w-full text-left mb-6 space-y-1">
              <div>Ticket ID: <span className="text-white">#MOS-{(Math.random() * 100000).toFixed(0)}</span></div>
              <div>Category: <span className="text-white">{formData.category}</span></div>
              <div>Priority Scope: <span className="text-white">{formData.priority}</span></div>
            </div>
            <div className="flex gap-4 w-full">
              <Link href="/support" className="flex-1">
                <Button variant="outline" className="w-full text-white border-white/[0.1] hover:bg-white/[0.05] text-[12px] h-10">
                  Return to Support
                </Button>
              </Link>
              <Link href="/login" className="flex-1">
                <Button className="w-full bg-white text-black hover:bg-neutral-200 text-[12px] h-10 font-semibold">
                  Open Dashboard
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Ticket Form split with support matrix */
          <div className="grid md:grid-cols-3 gap-12">
            
            {/* Form Column */}
            <form onSubmit={handleSubmit} className="md:col-span-2 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Your Name</label>
                  <Input 
                    required 
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-[#0a0a0a] border-white/[0.08] text-white focus-visible:ring-white/[0.2] text-[13px]" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Email Address</label>
                  <Input 
                    type="email" 
                    required 
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="bg-[#0a0a0a] border-white/[0.08] text-white focus-visible:ring-white/[0.2] text-[13px]" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Category</label>
                  <select 
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-1 text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.2] outline-none"
                  >
                    <option>Account Setup</option>
                    <option>Ledger Reconciliation</option>
                    <option>Budget Alerts</option>
                    <option>Feature Requests</option>
                    <option>Bug Report</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Priority</label>
                  <select 
                    value={formData.priority}
                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-1 text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.2] outline-none"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Workspace ID</span>
                  <span className="text-[10px] text-neutral-500 lowercase font-normal">Optional</span>
                </label>
                <Input 
                  placeholder="e.g. acme-corp"
                  value={formData.workspaceId}
                  onChange={(e) => setFormData(prev => ({ ...prev, workspaceId: e.target.value }))}
                  className="bg-[#0a0a0a] border-white/[0.08] text-white focus-visible:ring-white/[0.2] text-[13px]" 
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Subject</label>
                <Input 
                  required 
                  value={formData.subject}
                  onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  className="bg-[#0a0a0a] border-white/[0.08] text-white focus-visible:ring-white/[0.2] text-[13px]" 
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Description</label>
                <textarea 
                  required 
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  className="flex w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.2] min-h-[140px] resize-none outline-none"
                  placeholder="Provide precise details. If reporting an error, include ledger account names or steps to reproduce..."
                />
              </div>


              {errorMsg && (
                <div className="text-[12px] text-rose-400 bg-rose-950/20 border border-rose-500/20 p-3 rounded-lg font-mono">
                  {errorMsg}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full bg-white text-black hover:bg-neutral-200 text-[13px] h-10 font-semibold">
                {loading ? 'Submitting request...' : 'Submit Ticket'}
              </Button>
            </form>

            {/* Info Metrics Column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-4">Response Schedule</h3>
                <div className="space-y-3 font-mono text-[11px] text-neutral-400 bg-white/[0.02] border border-white/[0.05] p-4 rounded-xl">
                  <div className="flex justify-between border-b border-white/[0.03] pb-2">
                    <span className="text-red-400 font-semibold">Urgent Priority</span>
                    <span className="text-white">1 Hour response</span>
                  </div>
                  <div className="flex justify-between border-b border-white/[0.03] pb-2">
                    <span className="text-amber-400 font-semibold">High Priority</span>
                    <span className="text-white">4 Hours response</span>
                  </div>
                  <div className="flex justify-between border-b border-white/[0.03] pb-2">
                    <span className="text-neutral-300 font-semibold">Medium Priority</span>
                    <span className="text-white">12 Hours response</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500 font-semibold">Low Priority</span>
                    <span className="text-white">24 Hours response</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-3">Support Policies</h3>
                <ul className="space-y-3 text-[12px] text-neutral-400 leading-relaxed">
                  <li className="flex gap-2">
                    <Clock className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                    <span>Engineers operate on 9:00 AM - 6:00 PM EST schedule, Monday through Friday.</span>
                  </li>
                  <li className="flex gap-2">
                    <ShieldAlert className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                    <span>We never ask you to disclose account passwords or cryptokeys.</span>
                  </li>
                </ul>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
