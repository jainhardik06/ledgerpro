<div align="center">

# 💼 Money OS (LedgerPro SaaS Edition)
### *The Premium, Zero-Cost Financial Command Center for Modern Teams*

[![GitHub Release](https://img.shields.io/github/v/release/jainhardik06/ledgerpro?color=6366f1&style=for-the-badge)](https://github.com/jainhardik06/ledgerpro)
[![Build Status](https://img.shields.io/badge/Build-Passing-emerald?style=for-the-badge)](https://github.com/jainhardik06/ledgerpro)
[![License](https://img.shields.io/badge/License-MIT-violet?style=for-the-badge)](https://github.com/jainhardik06/ledgerpro)
[![Security Log](https://img.shields.io/badge/Audit--Logs-Immutable-indigo?style=for-the-badge)](https://github.com/jainhardik06/ledgerpro)
[![Architecture](https://img.shields.io/badge/Architecture-App--Router-blue?style=for-the-badge)](https://github.com/jainhardik06/ledgerpro)

<br>

<p align="center">
  <a href="#-the-money-os-concept">Concept</a> •
  <a href="#-features">Key Features</a> •
  <a href="#%EF%B8%8F-architecture">System Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-installation">Getting Started</a> •
  <a href="#-security">Security</a>
</p>

---

</div>

## 🌌 The Money OS Concept
Most people don't want an accounting software—they want answers. "How much money do I have?", "Where did it go?", and "Am I profitable?". **Money OS** answers these instantly.

Money OS transforms accounting from a simple chore into an **audit-proof, high-resiliency multi-tenant SaaS financial command center**. Completely re-architected on **Next.js App Router** with an obsession for premium aesthetics (Emil Kowalski / Linear inspired), it features dynamic application modes (Standard, Student Club, Agency), slide-over Drawers, universal Command Palette navigation, and complete multi-tenant data isolation.

It is designed specifically for **Small Businesses, Freelancers, Student Clubs, and Agencies** who need enterprise-grade tracking at **$0 operational cost**.

---

## ✨ Features

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0;">
  <div style="border: 1px solid #38b2ac30; padding: 15px; border-radius: 12px; background: rgba(56, 178, 172, 0.05);">
    <h3>📊 Premium Glassmorphism Dashboard</h3>
    <p>A beautifully designed, premium UI featuring real-time Cash Flow charts, Top Spending breakdowns, and rich metric cards powered by Recharts, encased in subtle gradients and floating elements.</p>
  </div>
  <div style="border: 1px solid #6366f130; padding: 15px; border-radius: 12px; background: rgba(99, 102, 241, 0.05);">
    <h3>⌨️ Universal Command Palette</h3>
    <p>Hit Cmd+K from anywhere in the application to instantly search, navigate, and take actions. Full keyboard navigation built natively into the core layout.</p>
  </div>
  <div style="border: 1px solid #ec489930; padding: 15px; border-radius: 12px; background: rgba(236, 72, 153, 0.05);">
    <h3>🔄 Zero-Cost Recurring Engine</h3>
    <p>Automate your fixed expenses. Uses a brilliant "Login-Evaluated Trigger" system to back-post missed transactions seamlessly without paying for a 24/7 backend cron server.</p>
  </div>
  <div style="border: 1px solid #eab30830; padding: 15px; border-radius: 12px; background: rgba(234, 179, 8, 0.05);">
    <h3>🏢 Multi-Tenant & Self-Serve Onboarding</h3>
    <p>A true SaaS solution. Users can autonomously sign up and instantly provision their own isolated Tenant. Organizations can toggle their "App Mode" to instantly switch terminology (e.g., Student Club mode).</p>
  </div>
  <div style="border: 1px solid #8b5cf630; padding: 15px; border-radius: 12px; background: rgba(139, 92, 246, 0.05);">
    <h3>🔒 Immutable Audit System</h3>
    <p>Every login, transaction modification, and category update creates an un-deletable log entry tied to the active user session and their specific tenant. Viewable inside the Audit Center.</p>
  </div>
  <div style="border: 1px solid #f43f5e30; padding: 15px; border-radius: 12px; background: rgba(244, 63, 94, 0.05);">
    <h3>👥 Role-Based Access Control</h3>
    <p>Hierarchical access model: Super Admin (Global Mission Control) > Tenant Admin (Organization Management) > User (Ledger Operations). Usernames are strictly guaranteed to be globally unique.</p>
  </div>
  <div style="border: 1px solid #10b98130; padding: 15px; border-radius: 12px; background: rgba(16, 185, 129, 0.05);">
    <h3>📈 Measurement Infrastructure</h3>
    <p>Integrated GA4 and PostHog for real-time traffic and behavioral analytics. Includes UTM persistence, a dedicated Growth Dashboard, and full SEO configuration (dynamic sitemap, tailored robots.txt).</p>
  </div>
  <div style="border: 1px solid #14b8a630; padding: 15px; border-radius: 12px; background: rgba(20, 184, 166, 0.05);">
    <h3>🧠 Growth Intelligence Center</h3>
    <p>A founder-grade mission control center pulling from real DB aggregations, PostHog Funnels, GA4, and Google Search Console. Includes Real-time AI crawler detection via Next.js Proxy.</p>
  </div>
  <div style="border: 1px solid #10b98130; padding: 15px; border-radius: 12px; background: rgba(16, 185, 129, 0.05);">
    <h3>🏢 Agency Vertical (Phase 1)</h3>
    <p>A complete agency financial loop on top of core Money OS: Clients → Projects → Budgets → Team → Time & Expenses → Cost → Invoicing (GST/HSN/TDS-ready) → Payments (manual + Razorpay) → Profitability — with versioned rate cards, deterministic alerts, receivables aging, and per-tenant analytics in the Platform Console.</p>
  </div>
  <div style="border: 1px solid #6366f130; padding: 15px; border-radius: 12px; background: rgba(99, 102, 241, 0.05);">
    <h3>📱 Installable PWA</h3>
    <p>Install Money OS to your home screen (Android/desktop via manifest, iOS via apple-touch-icon). A service worker caches the app shell and public pages; authenticated surfaces and APIs are never cached, and an offline page covers lost connections.</p>
  </div>
</div>

### More Superpowers
* **Edge-to-Edge Drawers**: Say goodbye to clunky center modals. All data entry is handled via smooth right-side sliding Drawers.
* **Accounts Abstraction**: Track money across Bank, Cash, UPI, Paytm, and Petty Cash individually.
* **Smart Pre-Seeding**: New organizations are automatically initialized with Core Accounts and Smart Categories.
* **Zero-Cost Receipts**: Attach Google Drive links or receipt notes directly to transactions to avoid expensive S3 bucket hosting.
* **Team Leaderboards**: Track exactly who spent what within an organization.
* **Real-Time System Telemetry**: A dedicated, high-resiliency status center (`/status`) tracking live database latency, Node.js memory heaps, and API response speeds.
* **Export & Reporting Suite**: 1-click CSV exports across all modules, plus print-ready native PDF summary generation directly from the Reports intelligence center.
* **Budget Intelligence Engine**: Set categorical limits with dynamic visual risk indicators (Warning, Critical) when spending approaches defined thresholds.
* **Client & Sponsor CRM**: Built-in directory to track and attribute specific incoming revenue/funds to designated clients, complete with their own revenue leaderboards.
### 📱 Mobile-First Design & Ergonomics
Money OS has been meticulously audited and rebuilt for **flawless cross-device fluidity** using advanced responsive design patterns:
* **Progressive Disclosure Tables**: Data-dense modules (Transactions, Recurring, Audit, Team) auto-collapse non-critical columns on mobile displays. Context is intelligently nested directly into the primary row, completely eliminating horizontal scrolling while preserving data integrity.
* **Fluid Grid Stacks**: Card layouts (Dashboard, Accounts, Budgets, Reports) instantly stack and dynamically adapt padding, truncation, and typography to viewport bounds (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
* **Interactive Slide-over Drawers**: Say goodbye to clunky center modals. All data entry, user invitations, and deep-dive audits are handled via smooth right-side sliding Drawers. On mobile, these feature prominent bottom-anchored "Close" actions designed specifically for 1-handed thumb operation.
* **Mobile Drawer Navigation**: A dedicated responsive layout system hides the desktop sidebar on viewports `< 768px`, replacing it with an accessible TopBar and hidden drawer toggle, ensuring smooth application traversal on phones.
* **Strict Overflow Boundaries**: Native text truncation (`min-w-0`, `truncate`) and flex-shrink logic guarantees that large currency numbers or extremely long email addresses will never break the grid or cause horizontal blowout.

---

## ⚙️ Architecture

Money OS enforces strict data separation logic before hitting the database adapter, now operating entirely on Next.js App Router.

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#6366f1', 'edgeLabelBackground':'#1e1b4b', 'tertiaryColor': '#0f172a'}}}%%
graph TD
    %% Clients
    Client([💻 Money OS Dashboard]) -- "HTTP API Requests (HttpOnly JWT Cookie)" --> API[⚙️ Next.js App Router API]
    
    %% Routing logic
    API -- "Authentication & Security Verification" --> Auth{Valid Session?}
    Auth -- "No" --> Unauth[🚫 401 Unauthorized Response]
    Auth -- "Yes" --> TenantCheck{Role Check & Tenant Isolation}
    
    %% Data Isolation
    TenantCheck -- "Extract tenantId" --> Routing{Database Router}
    
    %% DB Failover
    Routing -- "Primary Connection OK" --> Mongo[(🍃 MongoDB Atlas Cluster)]
    Routing -- "Primary Connection Timeout/Error" --> LocalDB[(📁 Local File local_db.json)]
    
    %% Output
    Mongo --> Return[✅ Return Isolated Tenant Data]
    LocalDB --> Return
```

---

## 🛠️ Tech Stack

```text
  🧠 React 19 Engine  ━━━► ⚡ Next.js 16 (App Router) ━━━► 🛡️ JWT & BCrypt Security
                                                               ┃
  🧪 Vitest + Bruno  ◄━━━  🍃 Native MongoDB Driver  ◄━━━━━━━━━━┛
```

* **Client**: React 19, Next.js 16 (App Router), Lucide React
* **Data Visualization**: Recharts, d3-color
* **Styling**: Tailwind CSS v4, custom glassmorphism, responsive grid layout
* **Persistence**: MongoDB Native Driver (separate primary + growth clusters), Node File System (`fs`) local fallback for dev/CI
* **Authentication**: Signed HTTP-Only session cookies (JWT, 7-day lifetime)
* **Encryption**: BCrypt password hashing (12 salt rounds); AES-256-GCM for tenant-stored payment credentials
* **Testing**: Vitest (unit/integration), Bruno CLI (API E2E regression), gitleaks (secret scanning)

---

## 🔒 Security

Money OS mitigates modern security risks using these strategies:

| Threat Vector | Security Strategy | Implementation Detail |
| :--- | :--- | :--- |
| **Data Leakage** | Tenant ID Isolation | Every DB query explicitly requires and filters by `tenantId`. Users absolutely cannot query outside their organization. |
| **BSON Exceptions** | Safe Object Mapping | All API endpoints use resilient `safeObjectId` wrappers to prevent invalid ID inputs from crashing the node environment. |
| **XSS & Cookie Stealing** | Token Confidentiality | Session JWTs are saved inside `HttpOnly` cookies, preventing client JavaScript access. |
| **Cross-Origin CSRF** | Domain Locking | Session cookies carry `SameSite=Strict`, blocking unauthorized cross-origin requests. |
| **Database Tampering** | Immutable Audit Trail | Audit logs have no update (PUT) or delete (DELETE) routes, establishing a permanent log. |
| **Password Theft** | Cryptographic Hashing | Client passwords are salted and hashed using `bcryptjs` before storage. |
| **Brute Force Login** | Per-IP Rate Limiting | `/api/auth/login` allows 10 attempts per 15-minute window. |
| **Super Admin Secrets** | Hash-Only Admin Password | Super Admin authentication reads `SUPER_ADMIN_PASSWORD_HASH`; plaintext admin passwords are not accepted in production. |
| **Clickjacking & XSS** | Security Headers | `proxy.ts` applies CSP, `X-Frame-Options`, `X-Content-Type-Options`, Referrer Policy, Permissions Policy, and HSTS in production. |
| **Forged Webhooks** | Signature + Tenant Binding | Razorpay webhooks verify HMAC-SHA256 signatures, and a delivery may only act on a tenant whose OWN stored (or the deployment's) webhook secret verifies it. Duplicate deliveries are idempotent via `gatewayPaymentId`. |
| **Credential Theft at Rest** | AES-256-GCM Encryption | Tenant-stored Razorpay credentials are encrypted with `AGENCY_MASTER_KEY`; without the key the app refuses secret storage (503) rather than storing plaintext. |
| **Misconfigured Deploys** | Fail-Closed Startup | Production refuses to start without `MONGODB_URI`, `MONGODB_GROWTH_URI`, `JWT_SECRET`, and `SUPER_ADMIN_PASSWORD_HASH`; the local JSON DB is dev/CI-only. |
| **Dependency Vulnerabilities** | Audited Supply Chain | `npm audit` clean (0 vulnerabilities); risky transitive versions pinned via `package.json` overrides; gitleaks runs in CI. |

---

## 🏁 Getting Started

### Prerequisites
- Node.js v22+ (the `engines` field pins `22.x`)
- NPM v9.0.0+
- Optional: MongoDB Atlas cluster URIs (primary + growth)

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/jainhardik06/ledgerpro.git
cd ledgerpro
npm install
```

### 2. Configuration
Create a `.env.local` file in the project root — the full, documented variable
inventory lives in [`.env.example`](./.env.example) (copy it and fill in real
values; never commit a populated env file). The essentials:

```env
# MongoDB (required in production — the app refuses to start without them;
# leave blank locally to use the .data/local_db.json fallback)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/ledger_db
MONGODB_GROWTH_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/money_os_growth

# JWT signing secret (required in production) — generate: openssl rand -base64 48
JWT_SECRET=<long-random-secret>

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Super Admin credentials (hash generated with bcrypt — required in production)
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD_HASH=$2b$12$replace_this_with_a_bcrypt_hash

# Agency vertical — payment gateway + credential encryption (optional)
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
AGENCY_MASTER_KEY=   # openssl rand -base64 32 — encrypts tenant-stored secrets

# Analytics & measurement (optional — features degrade to null when unset)
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_PERSONAL_API_KEY=
POSTHOG_PROJECT_ID=
GA4_PROPERTY_ID=
GOOGLE_APPLICATION_CREDENTIALS_JSON=
```

Generate a local Super Admin hash:
```bash
node -e "require('bcryptjs').hash('your-strong-password', 12).then(h => console.log(h))"
```

Use a unique 64+ character `JWT_SECRET` for every environment. The app refuses to start in production without `MONGODB_URI`, `MONGODB_GROWTH_URI`, `JWT_SECRET`, and `SUPER_ADMIN_PASSWORD_HASH`.

### 3. Spin Up Workspace
Run in development mode:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the application.

To compile the optimized production bundle:
```bash
npm run build
npm run start
```

---

## 🔑 Initial Setup Flow

### Option A: Self-Serve Registration
1. Navigate to the Login screen.
2. Click **"Don't have an account? Sign up"**.
3. Create your Organization, and the backend will automatically pre-seed your accounts and log you into your new isolated Money OS instance.

### Option B: Super Admin Deployment
1. Log in with your **Super Admin** credentials (from `.env.local`).
2. You will be routed to the Global Super Admin Mission Control `/super-admin`.
3. Click "Provision Organization" to forcefully provision a new Organization and its primary Tenant Admin.
4. Distribute the generated credentials to the client.

### Next Steps (For Tenant Admins)
* In the **Settings Center**, configure your **App Mode** (Standard, Student Club, or Agency) to dynamically update terminology.
* In the **Accounts Center**, add more asset Accounts (e.g., Paytm, Petty Cash).
* In the **Team Workspace**, securely invite internal users.

---

## 📦 System Schema Definitions

<details>
<summary><b>📐 Show Database Interfaces</b></summary>

### 1. Tenant Interface
```typescript
interface Tenant {
  id?: string;
  _id?: any;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  plan: 'FREE' | 'STARTER' | 'ENTERPRISE';
  appMode?: 'Standard' | 'Student_Club' | 'Agency';
  // Agency vertical expansions (present when configured):
  billingProfile?: AgencyBillingProfile;   // issuer identity, invoice prefix
  agencySettings?: AgencySettings;         // timezone, tax, Razorpay (encrypted)
  createdAt: Date;
}
```

### 2. User Interface
```typescript
interface User {
  id?: string;
  _id?: any;
  username: string;
  passwordHash: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId: string;
  attribution?: Record<string, string>;   // UTM captured at signup
  createdAt: Date;
}
```

### 3. Transaction Interface
```typescript
interface Transaction {
  id?: string;
  _id?: any;
  tenantId: string;
  userId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category?: string;
  accountId?: string;
  clientId?: string;
  notes?: string;
  // Agency expense expansion (§26 — agency metadata enriches core finance):
  projectId?: string;
  billable?: boolean;
  expenseStatus?: string;
  createdAt: Date;
}
```

### 4. Category, Account & Client Interfaces
```typescript
interface Category {
  id?: string;
  tenantId: string;
  name: string;
}

interface Account {
  id?: string;
  tenantId: string;
  name: string;
  initialBalance: number;
}

interface Client {
  id?: string;
  tenantId: string;
  name: string;
  email?: string;
}
```

### 5. Budget & Recurring Interfaces
```typescript
interface Budget {
  id?: string;
  tenantId: string;
  category: string;
  limitAmount: number;
  month: string; // YYYY-MM
}

interface RecurringTransaction {
  id?: string;
  tenantId: string;
  accountId: string;
  type: 'Credit' | 'Debit';
  description: string;
  amount: number;
  interval: 'Daily' | 'Weekly' | 'Monthly';
  nextRunDate: string; // YYYY-MM-DD
}
```

### 6. System Activity Log Interface
```typescript
interface SystemLog {
  id?: string;
  _id?: any;
  tenantId?: string;
  username: string;
  action: string;
  details: string;
  timestamp: Date;
}
```
</details>

## 🧪 Testing

Money OS ships with a three-layer verification suite (all green) — see
[TESTING.md](./TESTING.md) for how to run everything and what each layer
covers:

| Layer | Tool | Command | Scale |
| :--- | :--- | :--- | :--- |
| Unit + Integration | Vitest 5 | `npm run test:unit` | 55 files, 1251 tests |
| API E2E Regression | Bruno CLI (49 suites) | `npm run test:api` (needs the prod build running on :3000) | 731 requests, 2161 assertions |
| Secret Scanning | gitleaks | runs in CI | — |

The Bruno suites cover every agency module end-to-end — signup → agency mode →
client → project → rates → time (timer + manual + approval) → expenses →
invoices (GST/HSN/TDS) → payments (manual + Razorpay webhook attack proofs)
→ profitability → receivables → reconciliation across six read surfaces —
plus tenant-isolation and privilege-escalation negatives. Dependency
vulnerabilities are audited to zero via the `security-auditor` skill
(`~/.claude/skills/security-auditor`).

## Production Hardening Notes

* List endpoints for transactions, clients, and audit logs support `page` and `limit` query parameters, capped at 100 records per request.
* MongoDB startup creates indexes for every core AND agency collection (tenant-scoped compound indexes per query contract).
* Local fallback data is stored at `.data/local_db.json`, outside `src/`, and local IDs use `crypto.randomUUID()`.
* Super Admin tenant impersonation is represented only in the server-signed JWT, never `localStorage`.
* Public contact and support endpoints include rate limiting and bounded input validation.
* `proxy.ts` applies application security headers before page rendering.

<details>
<summary><b>📂 Show Directory Layout (Next.js App Router)</b></summary>

```text
ledgerpro/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/                 # Auth Gateway
│   │   │   ├── super-admin/          # Super Admin APIs (+ agency analytics)
│   │   │   ├── agency/               # Agency vertical APIs (17 modules)
│   │   │   ├── webhooks/razorpay/    # Signed gateway webhooks
│   │   │   ├── tenant/               # Organization API Routes
│   │   │   ├── transactions/         # Live ledger API
│   │   │   ├── accounts/             # Bank/Asset endpoints
│   │   │   ├── budgets/              # Limit controls
│   │   │   ├── recurring/            # Zero-cost cron logic
│   │   │   ├── clients/              # CRM API
│   │   │   ├── settings/             # Dynamic app state
│   │   │   └── logs/                 # Immutable audit trail
│   │   │
│   │   ├── dashboard/                # Main Post-Login Experience
│   │   │   ├── layout.tsx            # Nested sidebar + context provider
│   │   │   ├── page.tsx              # Command Center Snapshot
│   │   │   ├── agency/               # Agency vertical UI (dashboard, clients,
│   │   │   │                         #   projects, time, expenses, invoices,
│   │   │   │                         #   payments, receivables, profitability,
│   │   │   │                         #   rate cards, alerts, reports, settings)
│   │   │   ├── transactions/         # Data table & Drawer
│   │   │   ├── accounts/             # Visual account tracking
│   │   │   ├── budgets/              # Progress bars & limits
│   │   │   ├── recurring/            # Obligations tracker
│   │   │   ├── clients/              # Directory
│   │   │   ├── reports/              # Advanced charts
│   │   │   ├── team/                 # RBAC directory
│   │   │   ├── audit/                # Log viewing
│   │   │   └── settings/             # Tenant global settings
│   │   │
│   │   └── super-admin/              # Super Admin Global Experience
│   │       ├── layout.tsx            # Global admin layout
│   │       ├── page.tsx              # Mission Control Dashboard
│   │       ├── tenants/              # Tenant provisioner
│   │       ├── agency/               # Agency Intelligence (platform analytics)
│   │       ├── growth/               # Growth Intelligence Center
│   │       └── ...
│   │
│   ├── components/
│   │   ├── ui/                       # Reusable primitives
│   │   │   ├── Drawer.tsx            # Slide-over overlay
│   │   │   └── CommandPalette.tsx    # Cmd+K fuzzy search navigator
│   │   ├── agency/                   # Agency vertical components
│   │   └── dashboard/
│   │       └── DashboardProvider.tsx # Global state orchestrator
│   │
│   └── lib/
│       ├── auth.ts                   # JWT & Encryption
│       ├── db.ts                     # MongoDB + Fallback File DB
│       └── agency/                   # Agency domain layer (domain, queries,
│                                     #   profitability engine, alerts, reports,
│                                     #   permissions, validators)
```
</details>
