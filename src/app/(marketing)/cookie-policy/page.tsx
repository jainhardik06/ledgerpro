import React from 'react';

export default function CookiePolicyPage() {
  return (
    <div className="w-full pt-32 pb-24 px-6">
      <main className="max-w-3xl mx-auto prose prose-invert prose-neutral">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Cookie Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: October 24, 2026</p>

        <p>This Cookie Policy explains how Money OS uses cookies and similar technologies.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">What Are Cookies?</h2>
        <p>Cookies are small text files stored on your device when you visit a website. We use them to ensure the application functions correctly.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Strictly Necessary Cookies</h2>
        <p>Money OS relies heavily on strictly necessary cookies (such as HttpOnly session cookies for JWT authentication). You cannot opt out of these cookies as the application will not function without them.</p>

        <h2 className="text-xl font-semibold text-white mt-8 mb-4">Analytics Cookies</h2>
        <p>We use minimal, privacy-focused analytics to understand how users interact with the marketing site. We do not use intrusive tracking cookies or sell your browsing data.</p>
      </main>
    </div>
  );
}
