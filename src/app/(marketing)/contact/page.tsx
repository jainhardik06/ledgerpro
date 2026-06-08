"use client";

import React, { useState } from 'react';
import { Mail, MapPin, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ContactPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, message })
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to send message. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-24 bg-black min-h-screen text-white">
      {/* Header */}
      <section className="w-full pt-28 pb-12 px-4 sm:px-6 border-b border-white/[0.05]">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-white mb-4 animate-in">
            Contact our team
          </h1>
          <p className="text-base sm:text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Whether you have a question about features, integrations, or anything else, we're ready to answer.
          </p>
        </div>
      </section>

      <section className="w-full px-4 sm:px-6 max-w-4xl mx-auto mt-10 sm:mt-16 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">First Name</label>
                  <Input 
                    required 
                    value={firstName} 
                    onChange={e => setFirstName(e.target.value)}
                    className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" 
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">Last Name</label>
                  <Input 
                    required 
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">Email Address</label>
                <Input 
                  type="email" 
                  required 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="bg-[#0a0a0a] border-white/[0.05] text-white focus-visible:ring-white/[0.2]" 
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1.5 text-neutral-400">How can we help?</label>
                <textarea 
                  required 
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className="flex w-full rounded-md border border-white/[0.05] bg-[#0a0a0a] px-3 py-2 text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.2] min-h-[120px] resize-none"
                />
              </div>
              {errorMsg && (
                <div className="p-3 text-[12px] text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-md font-mono">
                  {errorMsg}
                </div>
              )}
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
                  <p className="font-mono text-neutral-300">moneyos@webasthetic.in</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <MapPin className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Office</p>
                  <p>Remote</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <Clock className="w-5 h-5 text-neutral-500 shrink-0" />
                <div>
                  <p className="font-medium text-white mb-1">Business Hours</p>
                  <p>Mon-Fri, 9:00 AM - 6:00 PM IST</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
