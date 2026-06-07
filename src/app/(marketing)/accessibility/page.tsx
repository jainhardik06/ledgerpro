import React from 'react';

export default function AccessibilityPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Accessibility Statement</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>Money OS is committed to ensuring digital accessibility for people with disabilities. We are continually improving the user experience for everyone and applying the relevant accessibility standards.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Conformance Status</h2>
        <p>We strive to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 level AA. Our component library utilizes radix-ui primitives to ensure proper ARIA attributes, focus trapping, and keyboard navigation.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Keyboard Navigation</h2>
        <p>Speed is a core feature of Money OS. Because of this, the entire application—including data entry, table filtering, and modal interactions—is fully navigable via keyboard.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Feedback</h2>
        <p>If you encounter any accessibility barriers on Money OS, please contact us immediately at support@moneyos.com.</p>
      </main>
    </div>
  );
}
