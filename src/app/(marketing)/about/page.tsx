import React from 'react';
import { Target, Zap, Shield, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <section className="w-full pt-32 pb-16 px-6 border-b border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-6 animate-in">
            We are building the operating system for your money.
          </h1>
          <p className="text-lg text-neutral-400 font-medium animate-in" style={{ animationDelay: '100ms' }}>
            Our mission is to end spreadsheet chaos and provide absolute financial clarity for teams, clubs, and small businesses.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="w-full py-24 px-6 max-w-3xl mx-auto space-y-8 text-[15px] leading-relaxed text-neutral-300">
        <h2 className="text-2xl font-semibold text-white mb-4">Our Story</h2>
        <p>
          Money OS was born out of frustration. As founders and organizers, we spent countless hours wrestling with fragile spreadsheets, generic expense trackers, and enterprise tools that required a manual to understand.
        </p>
        <p>
          We realized that what teams actually need isn't more features—it's more clarity. They need strict multi-tenant isolation so multiple organizations can be managed cleanly. They need fast, keyboard-driven workflows. They need an interface that respects their time.
        </p>
        <p>
          So we built it. Money OS is designed to be the exact opposite of traditional accounting software. It is fast, opinionated, and beautiful.
        </p>
      </section>

      {/* Principles */}
      <section className="w-full py-24 px-6 bg-[#0a0a0a] border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-white mb-12 text-center">Core Principles</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-6 rounded-xl bg-[#000000] border border-white/[0.05]">
              <Zap className="w-6 h-6 text-white mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Speed is a Feature</h3>
              <p className="text-sm text-neutral-400">If it takes more than 100ms to load a transaction list, it's broken. We obsess over performance so you can get in, log your data, and get out.</p>
            </div>
            <div className="p-6 rounded-xl bg-[#000000] border border-white/[0.05]">
              <Target className="w-6 h-6 text-white mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Absolute Clarity</h3>
              <p className="text-sm text-neutral-400">Data density without the noise. We use strict grid systems, tabular numbers, and a restrained color palette to make parsing financial data effortless.</p>
            </div>
            <div className="p-6 rounded-xl bg-[#000000] border border-white/[0.05]">
              <Shield className="w-6 h-6 text-white mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Secure by Default</h3>
              <p className="text-sm text-neutral-400">Tenant isolation isn't an afterthought; it's the foundation of our database schema. Your data is yours, isolated mathematically from everyone else.</p>
            </div>
            <div className="p-6 rounded-xl bg-[#000000] border border-white/[0.05]">
              <Heart className="w-6 h-6 text-white mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Designed for Humans</h3>
              <p className="text-sm text-neutral-400">Software should feel good to use. Every interaction, hover state, and modal is designed with subtle, physics-based motion.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
