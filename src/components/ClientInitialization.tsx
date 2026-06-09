'use client';

import { useEffect } from 'react';
import { captureUTMs, getAttribution } from '@/lib/utm';
import posthog from 'posthog-js';

export default function ClientInitialization() {
  useEffect(() => {
    // 1. Capture UTMs from URL to cookie
    captureUTMs();

    // 2. Read stored UTMs
    const attribution = getAttribution();
    if (attribution.utms) {
      // 3. Register as Super Properties in PostHog so all future events have it
      posthog.register({
        $initial_utm_source: attribution.utms.utm_source,
        $initial_utm_medium: attribution.utms.utm_medium,
        $initial_utm_campaign: attribution.utms.utm_campaign,
        $initial_utm_term: attribution.utms.utm_term,
        $initial_utm_content: attribution.utms.utm_content,
        initial_channel: attribution.channel
      });

      // 4. Send to GA4
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('set', {
          campaign_source: attribution.utms.utm_source,
          campaign_medium: attribution.utms.utm_medium,
          campaign_name: attribution.utms.utm_campaign,
          campaign_term: attribution.utms.utm_term,
          campaign_content: attribution.utms.utm_content
        });
      }
    }
  }, []);

  return null;
}
