import React from 'react';
import { fetchPostHogEvents } from '@/lib/external-apis';

export const metadata = {
  title: 'Event Audit | Money OS',
};

export default async function EventAuditPage() {
  const events = await fetchPostHogEvents();
  const hasEvents = events && events.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto text-zinc-100 font-sans">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Event Validation Suite</h1>
          <p className="text-zinc-400">Audit the last 100 raw events captured by PostHog telemetry.</p>
        </div>
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 overflow-hidden">
        {hasEvents ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-400">
              <thead className="text-xs text-zinc-500 uppercase bg-zinc-950/50">
                <tr>
                  <th className="px-4 py-3 border-b border-zinc-800">Timestamp</th>
                  <th className="px-4 py-3 border-b border-zinc-800">Event</th>
                  <th className="px-4 py-3 border-b border-zinc-800">Distinct ID (User)</th>
                  <th className="px-4 py-3 border-b border-zinc-800">URL / Location</th>
                  <th className="px-4 py-3 border-b border-zinc-800 text-right">Properties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {events.map((evt: any, i: number) => (
                  <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-300">
                      {new Date(evt.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-emerald-400">
                      {evt.event}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {evt.distinct_id}
                    </td>
                    <td className="px-4 py-3 truncate max-w-[200px]" title={evt.properties?.$current_url}>
                      {evt.properties?.$current_url || 'Server-side Event'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs">
                        {Object.keys(evt.properties || {}).length} keys
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-200 mb-2">No Event Data Found</h3>
            <p className="text-zinc-500 max-w-md">
              We couldn't retrieve the latest events. Ensure your <code>POSTHOG_PERSONAL_API_KEY</code> is configured and your application is actively sending data.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
