"use client";

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Key, Users, Lock, Server, FileLock2, HelpCircle, ArrowLeft } from 'lucide-react';

export default function SecurityPage() {
  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6 bg-[#000000] text-white min-h-screen">
      <main className="max-w-4xl mx-auto">
        {/* Back Link */}
        <Link href="/support" className="inline-flex items-center gap-2 text-[12px] text-neutral-500 hover:text-white transition-colors mb-8 font-mono">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Support Center
        </Link>

        {/* Header */}
        <div className="mb-12 pb-8 border-b border-white/[0.05]">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" /> Security & Data Protection
          </h1>
          <p className="text-[14px] text-neutral-400">How we isolate, encrypt, and audit your financial records.</p>
        </div>

        {/* Security Framework Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-3">
            <Server className="w-6 h-6 text-blue-400" />
            <h3 className="text-[15px] font-semibold text-white">Database Tenant Isolation</h3>
            <p className="text-[12.5px] text-neutral-400 leading-relaxed">
              Every workspace query is scoped with hard cryptokeys. The database architecture separates customer records logically, preventing data bleed across organizations.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-3">
            <Key className="w-6 h-6 text-purple-400" />
            <h3 className="text-[15px] font-semibold text-white">Authentication & Sessions</h3>
            <p className="text-[12.5px] text-neutral-400 leading-relaxed">
              Sessions are guarded by TLS 1.3 encryption. Failed login attempts lock account access instantly and issue alerts to administrators.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-3">
            <Users className="w-6 h-6 text-rose-400" />
            <h3 className="text-[15px] font-semibold text-white">Role-Based Access Control (RBAC)</h3>
            <p className="text-[12.5px] text-neutral-400 leading-relaxed">
              Limit permissions with Admin, User, and Viewer roles. Audits log every transaction alteration, workspace invite, and data export.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a] space-y-3">
            <FileLock2 className="w-6 h-6 text-amber-400" />
            <h3 className="text-[15px] font-semibold text-white">Encryption standards</h3>
            <p className="text-[12.5px] text-neutral-400 leading-relaxed">
              Files and backups are encrypted using industry-standard AES-256 keys. All network data transfers are forced through HTTPS connections.
            </p>
          </div>
        </div>

        {/* Security Best Practices */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <Lock className="w-5 h-5 text-neutral-400" /> Security Best Practices
          </h2>
          <div className="space-y-4">
            {[
              { title: "Enforce strong passphrases", detail: "Enforce multi-character, unique passphrases across all team invitations." },
              { title: "Review active sessions regularly", detail: "Navigate to Settings > Sessions to audit logged-in browser scopes." },
              { title: "Limit Admin access privileges", detail: "Reserve the Admin role strictly for owners. Assign external accountants the read-only Viewer role." }
            ].map((practice, idx) => (
              <div key={idx} className="p-4 rounded-lg border border-white/[0.03] bg-white/[0.01]">
                <h4 className="text-[13.5px] font-semibold text-white mb-1">{practice.title}</h4>
                <p className="text-[12px] text-neutral-400">{practice.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance Roadmap */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-neutral-400" /> Compliance Roadmap
          </h2>
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#0a0a0a]">
            <p className="text-[13px] text-neutral-300 leading-relaxed mb-4">
              Money OS is built from the ground up to align with institutional frameworks:
            </p>
            <ul className="space-y-3 text-[12px] text-neutral-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> **SOC 2 Type II Alignment**: Policies and automated logs conform to security trust guidelines.
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> **ISO 27001 Roadmap**: Implementing controls in preparation for audit validation.
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> **GDPR & CCPA**: User records are fully erasable upon validated requests.
              </li>
            </ul>
          </div>
        </section>

        {/* Incident Response */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-neutral-400" /> Security FAQ & Reporting
          </h2>
          <div className="space-y-6">
            <div>
              <h4 className="text-[14px] font-semibold text-white mb-1.5">How do I report a security vulnerability?</h4>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                If you detect a vulnerability, please email us directly at <span className="text-white font-mono">moneyos@webasthetic.in</span>. We review and deploy hotfixes within 24 hours.
              </p>
            </div>
            <div>
              <h4 className="text-[14px] font-semibold text-white mb-1.5">Does Money OS store raw bank login credentials?</h4>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                No. Money OS does not hold bank credentials. Financial updates are created by manual entries, webhook updates, or secure CSV statement imports.
              </p>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
