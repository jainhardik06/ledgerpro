# Growth Intelligence Center Architecture

## System Overview
The Growth Intelligence Center acts as an aggregation and visualization layer on top of multiple internal and external data sources. It is accessible exclusively by users with the `SUPER_ADMIN` role at the `/super-admin/growth` route.

## Architectural Components

### 1. Data Aggregation Layer
**Path**: `src/lib/external-apis.ts`
- **Role**: Serves as the central data orchestrator for Growth Intelligence. It exposes asynchronous server functions that fetch, sanitize, and aggregate data from PostHog, GA4, and Google Search Console APIs.
- **Functions**:
  - `fetchPostHogFunnels()`
  - `fetchPostHogRetention()`
  - `fetchGA4Traffic()`
  - `fetchPostHogEvents()`
  - `fetchGSCSearch()`
- **Usage**: These functions are called directly within Next.js Server Components (e.g., `src/app/super-admin/growth/page.tsx`) to render dashboards, rather than exposing an intermediate REST API.

### 2. External API Clients
- **PostHog Client**: Utilizes the PostHog REST API (via Personal API Key) to fetch funnel conversions, retention cohorts, feature usage metrics, and active user stats.
- **Google Analytics Data API**: Connects via a Google Service Account to fetch top-of-funnel traffic, UTM attribution, and campaign data.
- **Google Search Console API**: Fetches organic search performance metrics (impressions, clicks, CTR, position).
- **Bing Webmaster Tools API**: Fetches Bing-specific search performance and indexing metrics.

### 3. Database Aggregation
- **Role**: The internal MongoDB (or local file-based DB) serves as the ground truth for Workspace health, Financial aggregate statistics, Real-time entity creation (transactions, budgets), and AI Bot access logs.

### 4. Caching & Performance
- **Strategy**: 
  - External API calls (GA4, GSC, PostHog) are cached using Next.js `unstable_cache` or standard in-memory caching to prevent rate-limiting and improve load times.
  - Cache TTLs vary by section: Real-Time (0s), Executive (5m), SEO/Acquisition (1h).
- **Loading States**: The frontend uses SWR or React Query with granular loading skeletons per widget to ensure the dashboard remains responsive while heavy aggregations load.

### 5. Frontend Architecture
- **Framework**: React / Next.js App Router.
- **State Management**: `useState` and `useMemo` for client-side filtering (date ranges).
- **Visualizations**: `recharts` for complex charts (Funnel, Cohort Heatmaps, Timeseries).
- **Error Handling**: Graceful fallbacks and empty states for missing API credentials or rate-limited external services.

## Security & Permissions
- Strict server-side verification ensuring only `SUPER_ADMIN` users can access the API routes.
- Sanitization of all aggregated financial metrics to ensure zero exposure of tenant-specific PII or raw financial data.
