import React from 'react';
import { getUTMAcquisitionStats, connectGrowthDb } from '@/lib/db';

export const metadata = {
  title: 'Analytics Diagnostics | Money OS',
};

export default async function AnalyticsDiagnosticsPage() {
  const envStatus = {
    NEXT_PUBLIC_GA_MEASUREMENT_ID: !!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_POSTHOG_KEY: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
    POSTHOG_PERSONAL_API_KEY: !!process.env.POSTHOG_PERSONAL_API_KEY,
    POSTHOG_PROJECT_ID: !!process.env.POSTHOG_PROJECT_ID,
    GA4_PROPERTY_ID: !!process.env.GA4_PROPERTY_ID,
    GOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  };

  // Get UTM stats
  const utmStats = await getUTMAcquisitionStats();
  const utmCapturedToday = Object.keys(utmStats.sources).length > 0 ? 
    Object.values(utmStats.sources).reduce((a, b) => a + b, 0) : 0;

  // Get Bot Stats — real AI crawler telemetry lives in the Growth DB's
  // crawler_visits collection (see src/app/api/internal/bot-track/route.ts),
  // not the production `logs` collection.
  let gptVisits = 0;
  let claudeVisits = 0;
  let perplexityVisits = 0;
  try {
    const { db } = await connectGrowthDb();
    if (db) {
      gptVisits = await db.collection('crawler_visits').countDocuments({ botFamily: 'GPTBot' });
      claudeVisits = await db.collection('crawler_visits').countDocuments({ botFamily: 'Claude' });
      perplexityVisits = await db.collection('crawler_visits').countDocuments({ botFamily: 'Perplexity' });
    }
  } catch (e) {
    console.error('Failed to fetch bot logs');
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto text-zinc-100 font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Analytics Diagnostics</h1>
        <p className="text-zinc-400">Environment validation and integration health checks.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8">
        {/* Environment Validation */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 md:col-span-2">
          <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">Environment Validation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(envStatus).map(([key, isValid]) => (
              <div key={key} className="flex flex-col p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <span className="text-xs text-zinc-500 mb-1 truncate">{key}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isValid ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  <span className="text-sm font-medium">{isValid ? 'Configured' : 'Missing'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* GA4 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">Google Analytics 4</h2>
          <div className="space-y-3">
            <DiagnosticRow label="Connected?" status={envStatus.NEXT_PUBLIC_GA_MEASUREMENT_ID ? 'Yes' : 'No'} isGood={envStatus.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
            <DiagnosticRow label="Property ID" value={process.env.GA4_PROPERTY_ID || 'Not Set'} />
            <DiagnosticRow label="Reporting API" status={envStatus.GOOGLE_APPLICATION_CREDENTIALS && envStatus.GA4_PROPERTY_ID ? 'Configured' : 'Missing Credentials'} isGood={envStatus.GOOGLE_APPLICATION_CREDENTIALS && envStatus.GA4_PROPERTY_ID} />
          </div>
        </section>

        {/* Search Console */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">Search Console</h2>
          <div className="space-y-3">
            <DiagnosticRow label="Connected?" status={envStatus.GOOGLE_APPLICATION_CREDENTIALS ? 'Yes' : 'No'} isGood={envStatus.GOOGLE_APPLICATION_CREDENTIALS} />
            <DiagnosticRow label="Site URL Target" value={process.env.NEXT_PUBLIC_APP_URL || 'Not Set'} />
          </div>
        </section>

        {/* PostHog */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">PostHog</h2>
          <div className="space-y-3">
            <DiagnosticRow label="Client Connected?" status={envStatus.NEXT_PUBLIC_POSTHOG_KEY ? 'Yes' : 'No'} isGood={envStatus.NEXT_PUBLIC_POSTHOG_KEY} />
            <DiagnosticRow label="Server API Key" status={envStatus.POSTHOG_PERSONAL_API_KEY ? 'Provided' : 'Missing'} isGood={envStatus.POSTHOG_PERSONAL_API_KEY} />
            <DiagnosticRow label="Project ID" value={process.env.POSTHOG_PROJECT_ID || 'Not Set'} />
          </div>
        </section>

        {/* Local Tracking & Bots */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-lg font-medium text-white mb-4 border-b border-zinc-800 pb-2">Internal Telemetry</h2>
          <div className="space-y-3">
            <DiagnosticRow label="UTMs Captured" value={utmCapturedToday.toString()} />
            <DiagnosticRow label="GPTBot Visits" value={gptVisits.toString()} />
            <DiagnosticRow label="ClaudeBot Visits" value={claudeVisits.toString()} />
            <DiagnosticRow label="Perplexity Visits" value={perplexityVisits.toString()} />
          </div>
        </section>
      </div>
    </div>
  );
}

function DiagnosticRow({ label, value, status, isGood }: { label: string, value?: string, status?: string, isGood?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-400 text-sm">{label}</span>
      {status ? (
        <span className={`text-sm font-medium ${isGood ? 'text-emerald-400' : 'text-rose-400'}`}>{status}</span>
      ) : (
        <span className="text-zinc-100 text-sm font-medium">{value}</span>
      )}
    </div>
  );
}
