# Growth Intelligence Center Data Map

This document maps every required metric in the Growth Intelligence Center to its definitive "Source of Truth" to ensure zero mock data is used.

## 1. Executive Overview
- **Total Visitors / Unique Visitors**: PostHog API / GA4 API.
- **Active Users**: PostHog API (DAU / WAU / MAU) or inferred from Internal DB `logs`.
- **Signups**: Internal DB (`users` collection where role is TENANT_ADMIN).
- **New Workspaces**: Internal DB (`tenants` collection).
- **Transactions Created**: Internal DB (`transactions` collection).
- **Budgets Created**: Internal DB (`budgets` collection).
- **Reports Generated**: Internal DB (`logs` collection where action = "Report Exported").
- **Team Invites Sent**: Internal DB (`logs` collection where action = "Team Member Invited").

## 2. Acquisition Intelligence
- **UTM Data (Source, Medium, Campaign)**: Internal DB (`attribution` field on `Tenant` and `User` models) + PostHog Analytics.
- **Traffic Timeline/Heatmap**: PostHog API / GA4 API.

## 3. Activation Funnel
- **Data Source**: PostHog Funnel API.
- **Steps**:
  1. `$pageview`
  2. `USER_SIGNUP`
  3. `WORKSPACE_CREATED`
  4. `TRANSACTION_CREATED`
  5. `BUDGET_CREATED`
  6. `REPORT_VIEWED` / `REPORT_EXPORTED`
  7. `TEAM_MEMBER_INVITED`

## 4. Retention Center
- **Retention Cohorts**: PostHog Retention API (grouped by `WORKSPACE_CREATED` or `USER_SIGNUP` event returning for `$pageview`).
- **Stickiness**: PostHog Stickiness API.

## 5. Product Usage Intelligence
- **Feature Events**: PostHog Events API mapping.
  - Transactions: `TRANSACTION_CREATED`, `TRANSACTION_UPDATED`, `TRANSACTION_DELETED`
  - Budgets: `BUDGET_CREATED`, `BUDGET_UPDATED`
  - Reports: `REPORT_VIEWED`, `REPORT_EXPORTED`
  - Command Palette: `COMMAND_PALETTE_OPENED`, `COMMAND_EXECUTED`

## 6. Workspace Intelligence
- **Total / Active / Dormant Workspaces**: Internal DB (`tenants` combined with `logs` for recent activity).
- **Average Users Per Workspace**: Internal DB (count `users` grouped by `tenantId`).

## 7. Financial Intelligence
- **Platform-Level Financials**: Internal DB (`transactions` collection aggregated for total volume and counts).

## 8. SEO Intelligence
- **Data Source**: Google Search Console API (searchAnalytics.query).
- **Metrics**: Clicks, Impressions, CTR, Position.

## 9. AI Discovery Intelligence
- **Data Source**: Internal DB Middleware or Server Logs parsing User-Agents (e.g., `GPTBot`, `ClaudeBot`, `PerplexityBot`).

## 10. System Health
- **Data Source**: Internal DB (`incidents`, `maintenances`, `logs`) and direct health-check pings to external APIs (PostHog, GA4, GSC).

## 11. Real-Time Operations
- **Data Source**: Internal DB (`logs` and recent entities) + PostHog Live Events.

## 12. Predictive Insights
- **Data Source**: Custom linear regression/forecasting applied to internal DB timeseries data (Signups over last 90 days extrapolated for next 30 days).

## Missing Data Fallbacks
In environments where external API Keys (GA4, GSC, PostHog API) are unavailable:
1. Show a beautiful "Configuration Required" empty state for that specific widget/section.
2. Provide instructions on where to add the respective `POSTHOG_PERSONAL_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, etc., in the `.env.local` file.
3. Fallback to Internal DB approximations where logically possible (e.g., using DB signups for traffic proxies, DB `logs` for active users).
