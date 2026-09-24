"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Key, Webhook, CheckCircle2, Copy, Check, ExternalLink,
  ShieldCheck, AlertTriangle, Info, Terminal, Sparkles, RefreshCw,
  CreditCard, Send, Lock, HelpCircle
} from 'lucide-react';

interface EventItem {
  name: string;
  category: string;
  description: string;
  required: boolean;
}

const REQUIRED_EVENTS: EventItem[] = [
  {
    name: 'payment.captured',
    category: 'Payment',
    description: 'Triggered when a customer payment is successfully charged and captured. Automatically confirms invoice receipt and updates accounts receivable.',
    required: true,
  },
  {
    name: 'payment.failed',
    category: 'Payment',
    description: 'Triggered if a payment is declined or fails. Marks the attempt as failed in payment records without affecting invoice balance.',
    required: true,
  },
  {
    name: 'payment_link.paid',
    category: 'Payment Link',
    description: 'Triggered when a client completes payment through an issued payment link. Reconciles payment directly against the invoice.',
    required: true,
  },
  {
    name: 'payment_link.partially_paid',
    category: 'Payment Link',
    description: 'Triggered when partial payment is received on a link configured for installments.',
    required: true,
  },
  {
    name: 'payment_link.cancelled',
    category: 'Payment Link',
    description: 'Synchronizes payment link status in LedgerPro if voided or cancelled directly in Razorpay.',
    required: false,
  },
  {
    name: 'payment_link.expired',
    category: 'Payment Link',
    description: 'Marks links as expired when their validity period passes without completion.',
    required: false,
  },
];

function generateRandomSecret(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(24);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

export default function RazorpayGuidePage() {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [copiedEvent, setCopiedEvent] = useState<string | null>(null);
  const [customOrigin, setCustomOrigin] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'keys' | 'webhooks'>('all');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCustomOrigin(window.location.origin);
      setGeneratedSecret(generateRandomSecret());
    }
  }, []);

  const webhookEndpoint = `${customOrigin || 'https://your-domain.com'}/api/webhooks/razorpay`;

  function copyToClipboard(text: string, onDone: () => void) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        onDone();
      }).catch(() => {});
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Header & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <Link
            href="/dashboard/agency/settings?tab=payment"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-400 hover:text-white transition-colors mb-2.5 font-medium group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
            Back to Payment Gateway Settings
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[22px] font-semibold text-white tracking-tight">
                Razorpay Integration & Webhook Guide
              </h1>
              <p className="text-[13px] text-neutral-400">
                Complete walkthrough to obtain API credentials, configure webhooks, and automate invoice payments
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href="https://dashboard.razorpay.com/app/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium bg-white/[0.05] border border-white/[0.1] text-white hover:bg-white/[0.1] transition-colors"
          >
            Razorpay API Keys <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
          </a>
          <a
            href="https://dashboard.razorpay.com/app/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold bg-sky-500 text-black hover:bg-sky-400 transition-colors shadow-sm"
          >
            Razorpay Webhooks <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Quick Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 space-y-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Key className="w-3.5 h-3.5" />
          </div>
          <div className="text-[13px] font-medium text-white">1. API Keys</div>
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            Generate <strong>Key ID</strong> and <strong>Key Secret</strong> to allow LedgerPro to authenticate and create payment links.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 space-y-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Webhook className="w-3.5 h-3.5" />
          </div>
          <div className="text-[13px] font-medium text-white">2. Webhook Endpoint</div>
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            Register your webhook URL in Razorpay so incoming payments automatically mark invoices as <strong>PAID</strong>.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#050505] p-4 space-y-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="text-[13px] font-medium text-white">3. Webhook Secret</div>
          <p className="text-[12px] text-neutral-400 leading-relaxed">
            Configure a shared secret to cryptographically verify HMAC-SHA256 signatures and prevent unauthorized requests.
          </p>
        </div>
      </div>

      {/* PART 1: Obtaining API Keys */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#050505] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-gradient-to-r from-amber-500/[0.04] to-transparent flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-[13px]">
              1
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white tracking-tight">
                How to Obtain Key ID & Key Secret
              </h2>
              <p className="text-[12px] text-neutral-400">
                Required for API calls, payment link generation, and connection verification
              </p>
            </div>
          </div>

          <a
            href="https://dashboard.razorpay.com/app/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            Open API Keys Page <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <ol className="space-y-4 text-[13px] text-neutral-300">
            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-white shrink-0 mt-0.5">
                a
              </span>
              <div>
                <strong className="text-white">Choose Environment (Test or Live):</strong>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  At the top of the Razorpay Dashboard, toggle between <strong>Test Mode</strong> (recommended first for testing) and <strong>Live Mode</strong>. Test mode keys begin with <code className="text-amber-300 bg-white/[0.05] px-1.5 py-0.5 rounded font-mono text-[11px]">rzp_test_</code> while Live keys begin with <code className="text-emerald-300 bg-white/[0.05] px-1.5 py-0.5 rounded font-mono text-[11px]">rzp_live_</code>.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-white shrink-0 mt-0.5">
                b
              </span>
              <div>
                <strong className="text-white">Navigate to API Keys:</strong>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  In the left sidebar or top profile menu, click on <strong>Account & Settings</strong> (or <strong>Settings</strong>) &rarr; under <em>Website and App Settings</em>, select <strong>API Keys</strong>.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-white shrink-0 mt-0.5">
                c
              </span>
              <div>
                <strong className="text-white">Generate Your Key Pair:</strong>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  Click the <strong>Generate Key</strong> (or <strong>Generate Test Key</strong>) button. A modal popup will appear displaying your <strong>Key ID</strong> and <strong>Key Secret</strong>.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-white shrink-0 mt-0.5">
                d
              </span>
              <div>
                <strong className="text-white">Save the Key Secret Immediately:</strong>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  Click <strong>Download Key Details</strong> or copy both values immediately. Razorpay will <em>never show the Key Secret again</em> once the modal is closed.
                </p>
              </div>
            </li>

            <li className="flex items-start gap-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-white shrink-0 mt-0.5">
                e
              </span>
              <div>
                <strong className="text-white">Enter in LedgerPro:</strong>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  Paste the <strong>Key ID</strong> and <strong>Key Secret</strong> into the respective fields in <Link href="/dashboard/agency/settings?tab=payment" className="text-sky-400 hover:underline">Settings &gt; Payment Gateway</Link>.
                </p>
              </div>
            </li>
          </ol>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 flex items-start gap-3 text-[12px] text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-white">Security Reminder:</span> Never commit API Key Secrets to Git or share them publicly. LedgerPro securely encrypts credentials in your database using AES-256 before saving.
            </div>
          </div>
        </div>
      </section>

      {/* PART 2: Creating Webhooks */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#050505] overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-gradient-to-r from-sky-500/[0.04] to-transparent flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-[13px]">
              2
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white tracking-tight">
                How to Create the Webhook in Razorpay
              </h2>
              <p className="text-[12px] text-neutral-400">
                Enables Razorpay to notify LedgerPro whenever payments succeed, fail, or links are paid
              </p>
            </div>
          </div>

          <a
            href="https://dashboard.razorpay.com/app/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-sky-500/10 border border-sky-500/25 text-sky-300 hover:bg-sky-500/20 transition-colors"
          >
            Open Webhooks Page <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Step 2.1: Webhook URL */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[13px] font-semibold text-white flex items-center gap-2">
                <span>Webhook URL to enter in Razorpay</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  Exact Endpoint
                </span>
              </label>
              <button
                type="button"
                onClick={() => copyToClipboard(webhookEndpoint, () => {
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-[11.5px] text-white font-medium transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
                {copiedUrl ? 'Copied URL!' : 'Copy URL'}
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-black border border-white/[0.1] px-3.5 py-2.5 font-mono text-[13px] text-sky-300 break-all select-all">
              <Terminal className="w-4 h-4 text-neutral-500 shrink-0" />
              <span className="flex-1">{webhookEndpoint}</span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11.5px] text-neutral-500">Domain override:</span>
              <input
                type="text"
                value={customOrigin}
                onChange={e => setCustomOrigin(e.target.value)}
                placeholder="https://your-production-domain.com"
                className="h-7 px-2.5 rounded bg-white/[0.03] border border-white/[0.08] text-[11.5px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/25 flex-1 max-w-sm"
              />
            </div>

            {customOrigin.includes('localhost') && (
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3 text-[11.5px] text-neutral-300 space-y-1">
                <div className="font-medium text-sky-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" /> Localhost Testing Note
                </div>
                <p className="text-neutral-400 leading-relaxed">
                  Because Razorpay servers cannot send HTTP POST requests directly to <code className="text-white">localhost</code>, use a tunnel like <strong>ngrok</strong> (<code className="text-white">ngrok http 3000</code>) when testing webhooks on your development machine, then paste the forwarding URL above. In production, use your live domain.
                </p>
              </div>
            )}
          </div>

          {/* Step 2.2: Webhook Secret */}
          <div className="space-y-3 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <label className="text-[13px] font-semibold text-white">Webhook Secret</label>
                <p className="text-[12px] text-neutral-400">
                  A custom shared key you choose or generate. The exact same secret must be saved in Razorpay AND in LedgerPro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedSecret(generateRandomSecret())}
                className="inline-flex items-center gap-1 text-[11.5px] text-neutral-400 hover:text-white transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center justify-between rounded-xl bg-black border border-white/[0.1] px-3.5 py-2 font-mono text-[13px] text-emerald-400">
                <span className="truncate select-all">{generatedSecret}</span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-sans font-medium px-2 py-0.5 rounded bg-white/[0.05]">
                  24-byte hex
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedSecret, () => {
                  setCopiedSecret(true);
                  setTimeout(() => setCopiedSecret(false), 2000);
                })}
                className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-[12.5px] text-white font-medium transition-colors inline-flex items-center gap-1.5 shrink-0"
              >
                {copiedSecret ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
                {copiedSecret ? 'Copied!' : 'Copy Secret'}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Paste this secret into the <strong>Secret</strong> field in Razorpay webhook form, and into <strong>Webhook Secret</strong> in LedgerPro Settings.
            </p>
          </div>

          {/* Step 2.3: Active Events Checklist */}
          <div className="space-y-3 pt-4 border-t border-white/[0.06]">
            <div>
              <h3 className="text-[13px] font-semibold text-white">Required Webhook Events</h3>
              <p className="text-[12px] text-neutral-400">
                In the Razorpay webhook setup form, select the following events under the <strong>Active Events</strong> checklist:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {REQUIRED_EVENTS.map(evt => (
                <div
                  key={evt.name}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 transition-colors hover:border-white/[0.12]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`w-4 h-4 ${evt.required ? 'text-emerald-400' : 'text-sky-400'}`} />
                      <code className="text-[12.5px] font-semibold text-white font-mono">{evt.name}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(evt.name, () => {
                        setCopiedEvent(evt.name);
                        setTimeout(() => setCopiedEvent(null), 1500);
                      })}
                      className="p-1 rounded text-neutral-500 hover:text-white transition-colors"
                      title="Copy event name"
                    >
                      {copiedEvent === evt.name ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                    {evt.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PART 3: Step-by-Step Summary in Razorpay UI */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#050505] p-5 sm:p-6 space-y-4">
        <h2 className="text-[15px] font-semibold text-white tracking-tight flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Summary: Creating the Webhook Form in Razorpay
        </h2>

        <div className="space-y-3 text-[12.5px] text-neutral-300">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-neutral-400 font-medium">1. Webhook URL:</span>
            <span className="sm:col-span-2 font-mono text-sky-300 text-[12px]">{webhookEndpoint}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-neutral-400 font-medium">2. Secret:</span>
            <span className="sm:col-span-2 text-neutral-200">
              The secret generated above (e.g. <code className="font-mono text-emerald-300 text-[12px]">{generatedSecret.slice(0, 12)}…</code>)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-neutral-400 font-medium">3. Alert Email:</span>
            <span className="sm:col-span-2 text-neutral-200">Your admin email (receives notifications if any delivery fails)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <span className="text-neutral-400 font-medium">4. Active Events:</span>
            <span className="sm:col-span-2 font-mono text-[11.5px] text-neutral-300">
              payment.captured, payment.failed, payment_link.paid, payment_link.partially_paid
            </span>
          </div>
        </div>

        <div className="pt-3">
          <p className="text-[12px] text-neutral-400">
            Once saved in Razorpay, return to <Link href="/dashboard/agency/settings?tab=payment" className="text-sky-400 underline font-medium">LedgerPro Payment Gateway Settings</Link>, ensure the status is set to <strong>Enabled</strong>, paste your credentials, and click <strong>Test Connection</strong>.
          </p>
        </div>
      </section>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/[0.08] flex-wrap">
        <Link
          href="/dashboard/agency/settings?tab=payment"
          className="inline-flex items-center gap-2 h-10 px-5 bg-white text-black rounded-xl text-[13px] font-semibold hover:bg-neutral-200 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Payment Settings
        </Link>

        <a
          href="https://dashboard.razorpay.com/app/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-10 px-5 bg-sky-500 text-black rounded-xl text-[13px] font-semibold hover:bg-sky-400 transition-colors shadow-sm"
        >
          Open Razorpay Webhook Settings <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
