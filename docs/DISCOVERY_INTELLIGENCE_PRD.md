# Discovery Intelligence Center PRD

## Overview
The **Discovery Intelligence Center** is the operational command center located at `/super-admin/discovery` within the Money OS Product Engine. 
It acts as the master control room for all top-of-funnel (ToFu) activities, providing real-time visibility into the performance of the separate Discovery Engine (Astro repository).

## Purpose
- **Eliminate Fragmented Tools**: Replace Notion, Google Sheets, and isolated analytics platforms.
- **Centralize Operations**: Track SEO efforts, AI crawler penetration, and directory distribution from a single interface.
- **Ensure Database Isolation**: Display data strictly pulled from the `money_os_growth` database cluster.

## Target Users
- Solo Founder
- Future Marketing & Growth Leads
- Super Admins

## Core Features & Sections

### 1. Infrastructure Status
Monitors the health of the split architecture.
- **Growth DB Status**: Connected / Disconnected.
- **Content Engine Status**: Build status of the Astro repository.
- **SEO Engine Status**: API integration health for search console/analytics.

### 2. Directory Tracking
Monitors global directory distribution.
- **Total Targets**: Count of identified potential directories.
- **Submitted**: Count of active applications.
- **Approved**: Count of successful listings.
- **Rejected**: Count of failed applications.
- **Backlinks Earned**: Verified referring domains generated.

### 3. Content Tracking
Measures the scale of the static content footprint.
- **Docs Pages**: Total technical documentation pages.
- **SEO Pages**: Programmatic programmatic landing pages.
- **Blog Posts**: Editorial content.
- **Comparison Pages**: Alternative-to pages.

### 4. AI Discovery (Crawler Penetration)
Tracks the frequency of Large Language Model (LLM) bots indexing the site.
- **GPTBot** (OpenAI)
- **ClaudeBot** (Anthropic)
- **Perplexity**
- **Gemini**
- **Copilot**

## Non-Functional Requirements
- **No Mock Data**: Every metric must be a live database count or derived calculation.
- **Aesthetic Fidelity**: Must strictly adhere to the `Money OS Discovery Design Constitution v2`.
- **Zero Impact**: Queries must execute against the isolated `money_os_growth` cluster only.
