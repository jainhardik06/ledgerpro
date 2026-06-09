'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import PostHogPageView from './PostHogPageView';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const phHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

    if (phKey) {
      posthog.init(phKey, {
        api_host: phHost,
        person_profiles: 'identified_only',
        capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      });
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
