# Growth Intelligence Center PRD

## Overview
Money OS is evolving from a single-tenant application into a full SaaS platform. To manage and accelerate this growth, the Super Admin requires a "Growth Intelligence Center" – a founder-grade command center that consolidates data from internal databases, PostHog, GA4, Google Search Console, and Bing Webmaster Tools.

## Current Implementation Status
> **Note**: This is a Product Requirements Document (PRD). Not all features listed below are currently implemented.
> 
> **Currently Built & Active**:
> - PostHog Funnels and Retention cohorts via `fetchPostHogFunnels()` and `fetchPostHogRetention()`
> - Google Analytics 4 active traffic via `fetchGA4Traffic()`
> - Google Search Console organic queries via `fetchGSCSearch()`
> 
> **Aspirational / Backlog**:
> - Real-time Websockets for live operations feeds
> - Predictive ML models for projection metrics
> - Granular AI crawler/bot identification logs

## Core Objectives
- Answer key growth questions: Where do users come from? What do they do? What converts? What retains?
- Provide actionable, dense, and beautifully visualized data using real metrics only.
- Serve as the mission control for all marketing and growth decisions.

## Sections & Requirements

### 1. Executive Overview
- **Metrics**: Total Visitors, Unique Visitors, Active Users, Signups, New Workspaces, Transactions Created, Budgets Created, Reports Generated, Team Invites Sent, Growth Rate.
- **Comparisons**: Today vs 7 Days vs 30 Days vs 90 Days.
- **Visuals**: Trend indicators, growth percentages, anomaly alerts.

### 2. Acquisition Intelligence
- **Metrics**: Visitors, Signups, Activation Rate, Retention Rate broken down by Source (Google, Bing, Direct, Referral, Socials).
- **Sub-sections**: Top Campaigns, Top UTM Sources/Mediums, Top Referrers.
- **Visuals**: Traffic Timeline, Traffic Heatmap.

### 3. Activation Funnel
- **Stages**: Visitor -> Signup -> Workspace Created -> First Transaction -> First Budget -> First Report -> Team Invite.
- **Metrics**: Conversion %, Dropoff %, Time to Complete, Largest Dropoff Stage.
- **Visuals**: Funnel Visualization.

### 4. Retention Center
- **Cohorts**: Day 1, Day 7, Day 14, Day 30, Day 60, Day 90.
- **Metrics**: Returning Users, Retention %, Churn %, Stickiness (WAU/MAU, DAU/MAU).

### 5. Product Usage Intelligence
- **Features**: Transactions, Budgets, Reports, Clients, Recurring, Audit Logs, Command Palette, Settings.
- **Metrics**: Usage Count, Unique Users, Usage Growth, Feature Adoption %, Feature Retention %.

### 6. Workspace Intelligence
- **Metrics**: Total Workspaces, Active vs Dormant, Created vs Deleted, Average Age, Average Users per Workspace, Health Score.

### 7. Financial Intelligence
- **Metrics**: Total Transactions Processed, Total Transaction Volume, Budgets Created, Reports Generated, Clients Managed, Recurring Transactions Created, Activity Trend.
- **Constraint**: Aggregate statistics only. Never expose individual tenant data.

### 8. SEO Intelligence
- **Metrics**: Indexed Pages, Impressions, Clicks, CTR, Average Position, Top Queries, Top Landing Pages, Top Growing/Declining Pages.

### 9. AI Discovery Intelligence
- **Bots Tracked**: GPTBot, ClaudeBot, PerplexityBot, CCBot, BingBot, GoogleBot.
- **Metrics**: Crawler Activity, AI Referrals, Discovery Trend, Most Accessed Pages.

### 10. System Health
- **Metrics**: Status of GA4, PostHog, Search Console, Bing, Event Pipeline, API, Database, Background Jobs, Cron Jobs, Error Rate.

### 11. Real-Time Operations
- **Feeds**: Live Visitors, Signups, Workspace Creations, Transactions, Reports, Team Invites, Command Palette Activity.

### 12. Predictive Insights
- **Projections**: Projected Signups, Workspaces, Retention, Growth.
- **Anomaly Detection**: Traffic spikes/drops, conversion/activation issues.

## Design Requirements
- Premium SaaS aesthetic (Linear × Stripe × Vercel × PostHog).
- Dark mode first.
- Fully responsive (Mobile, Tablet, Desktop).
- Dense but readable with professional data storytelling and beautiful charts.
