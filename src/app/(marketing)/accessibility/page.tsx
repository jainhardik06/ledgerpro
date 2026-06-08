import React from 'react';

export default function AccessibilityPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Accessibility Statement</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          Money OS is committed to ensuring digital accessibility for individuals of all abilities. We continuously refine the user interface and logic flows to ensure conformance to design guidelines.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Conformance Standards</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          The Money OS frontend is built with accessibility in mind, working toward compliance with the Web Content Accessibility Guidelines (WCAG) 2.1 level AA.
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>Component Primitive Framework:</strong> Interactive dialog drawers, selection selectors, and modals are structured using Radix UI primitives. This ensures native support for ARIA properties, structured focus capture, and aria-expanded announcements.</li>
          <li><strong>Visual Hierarchy & High Contrast:</strong> Main layouts prioritize high-contrast layouts (pure black background #000000 with clean high-contrast text layers) to support readability for low-vision users.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. Keyboard Navigation</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          Our transaction grids, budgeting inputs, client management lists, and settings configuration drawers are fully navigable via standard keyboard tab orders. Interactive buttons and anchor tags include outline borders on keyboard focus state to guide focus indicator positions.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Accessibility Feedback</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          If you experience any accessibility limits while navigating our client-side workspaces, please submit a detailed ticket through our support form or contact platform engineers at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
