# PostHog Implementation Guide

This guide details the technical implementation of PostHog Analytics in the Money OS codebase.

## Overview
We track both client-side and server-side events to ensure reliable capture of crucial business metrics.
- **Client-Side:** Page views, clicks, and non-critical product engagement. Uses `posthog-js`.
- **Server-Side:** Critical business events (Signups, transactions, workspace creation). Uses `posthog-node`.

## Setup & Configuration
1. **Dependencies**: `posthog-js` (Client) and `posthog-node` (Server)
2. **Environment Variables**:
   - `NEXT_PUBLIC_POSTHOG_KEY`: Public API key for both environments
   - `NEXT_PUBLIC_POSTHOG_HOST`: Usually `https://us.i.posthog.com`

## Code Structure

### 1. `src/lib/posthog.ts`
Provides a unified interface for analytics, separating client-side logic from server-side singletons.
- `captureEvent(eventName, properties)`
- `identifyUser(userId, traits)`
- Server-side `PostHogClient()` instantiation for reliable Node.js tracking.

### 2. `src/components/analytics/posthog-provider.tsx`
Wraps the application in a `PostHogProvider` ensuring client-side initialization via `posthog-js/react`. Disables automatic pageview capture.

### 3. Page View Tracking
Handled by `PostHogPageView` (integrated with App Router) which manually triggers `$pageview` when the route or search parameters change.

### 4. Injecting into App Router
`src/app/layout.tsx` is wrapped with `PostHogProvider` to enable Session Replay and React hooks integration globally.

## Implementation Steps

1. Install `posthog-node` for server-side event capture.
2. Refactor existing `PostHogProvider` to `src/components/analytics/posthog-provider.tsx`.
3. Create `src/lib/posthog.ts` wrapper.
4. Integrate `captureEvent` into core API Routes (auth, transactions, budgets, etc.) using `posthog-node` for high reliability.
5. Integrate `captureEvent` into frontend components (`CommandPalette`, `Reports`) using `posthog-js`.
6. Ensure duplicate events are mitigated by only triggering upon successful API actions (e.g. tracking `TRANSACTION_CREATED` only after DB insertion succeeds).
