import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy | Money OS',
  description: 'How Money OS uses cookies and similar storage technologies, and the strict privacy and data minimization principles behind it.',
  alternates: { canonical: '/cookie-policy' },
  openGraph: { title: 'Cookie Policy | Money OS', description: 'How Money OS uses cookies and similar storage technologies.', url: '/cookie-policy', type: 'website' },
  twitter: { card: 'summary', title: 'Cookie Policy | Money OS', description: 'How Money OS uses cookies and similar storage technologies.' },
};

export default function CookiePolicyPage() {
  return (
    <div className="w-full pt-24 sm:pt-24 sm:pt-32 pb-24 px-4 sm:px-6">
      <main className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">Cookie Policy</h1>
        <p className="text-[14px] text-neutral-500 mb-8">Last Updated: June 8, 2026</p>

        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-6">
          This Cookie Policy explains how Money OS uses cookies and similar storage technologies. We believe in strict privacy and data minimization.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">1. Strictly Necessary Cookies</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          To maintain user sessions securely, the platform utilizes essential system cookies.
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>JWT Auth Token:</strong> We set a secure, browser-level <code>session</code> cookie. This cookie contains the JSON Web Token required to verify your permissions when requesting data from our API endpoints.</li>
          <li><strong>Security Settings:</strong> The cookie is configured with <code>HttpOnly</code>, <code>Secure</code>, and <code>SameSite=Lax</code> properties to mitigate cross-site scripting (XSS) and request forgery (CSRF) attempts.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">2. Zero Tracker Policy</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          We respect user privacy and employ a clean interface policy.
        </p>
        <ul className="list-disc list-inside space-y-2 text-[14.5px] text-neutral-300 mb-6 pl-4">
          <li><strong>No Marketing Pixels:</strong> We do not load Meta pixels, Google Analytics tracker networks, advertising identifiers, or third-party cookies that trace your browser footprint across other internet sites.</li>
        </ul>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">3. Managing Cookies</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          You can block or purge cookies through your browser configurations. However, disabling cookies will prevent you from authenticating or logging into Money OS workspaces as session states cannot be maintained.
        </p>

        <h2 className="text-lg font-medium text-white mt-10 mb-4 pb-2 border-b border-white/[0.05]">4. Contact Us</h2>
        <p className="text-[14.5px] leading-relaxed text-neutral-300 mb-4">
          If you have questions about our session management architecture, contact us at <a href="mailto:moneyos@webasthetic.in" className="text-indigo-400 hover:underline">moneyos@webasthetic.in</a>.
        </p>
      </main>
    </div>
  );
}
