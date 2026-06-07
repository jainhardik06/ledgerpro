"use client";

import React, { useState } from 'react';
import { Mail, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate network request
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 800);
  };

  return (
    <div className="flex flex-col items-center pb-24">
      {/* Header */}
      <section className="w-full pt-32 pb-16 px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">
            Contact our team
          </h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Whether you have a question about features, trials, pricing, or anything else, we're ready to answer.
          </p>
        </div>
      </section>

      <section className="w-full px-6 max-w-4xl mx-auto mt-16 grid md:grid-cols-2 gap-16">
        {/* Contact Form */}
        <div className="animate-in" style={{ animationDelay: '200ms' }}>
          {submitted ? (
             <div className="p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Message received.</h3>
                <p className="text-[14px]">We'll be in touch with you shortly.</p>
             </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">First Name</label>
                  <Input required className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">Last Name</label>
                  <Input required className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">Email Address</label>
                <Input type="email" required className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">How can we help?</label>
                <textarea 
                  required 
                  className="flex w-full rounded-md border border-white/[0.05] bg-[#0a0a0a] px-3 py-2 text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.2] min-h-[120px] resize-none"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-white text-black hover:bg-neutral-200">
                {loading ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-8 animate-in" style={{ animationDelay: '300ms' }}>
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Other ways to connect</h3>
            <div className="space-y-6 text-[14px] text-neutral-400">
              <div className="flex gap-4">
                <Mail className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Support</p>
                  <p>support@moneyos.com</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Mail className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Sales & Business Inquiries</p>
                  <p>sales@moneyos.com</p>
                </div>
              </div>
              <div className="flex gap-4">
                <MapPin className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Office</p>
                  <p>123 Financial District<br/>New York, NY 10004</p>
                </div>
              </div>
              <div className="flex gap-4">
                <Clock className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Business Hours</p>
                  <p>Mon-Fri, 9:00 AM - 6:00 PM EST</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
