export interface SupportArticle {
  id: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  lastUpdated: string;
  content: string;
}

export interface GuideStep {
  title: string;
  description: string;
}

export interface SupportGuide {
  id: string;
  title: string;
  description: string;
  category: string;
  audience: string;
  steps: GuideStep[];
}

export interface SupportFAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  added: string[];
  improved: string[];
  fixed: string[];
}

export const DOCS_ARTICLES: SupportArticle[] = [
  {
    id: "introduction",
    title: "Introduction to Money OS",
    description: "Welcome to your financial command center. Learn the basic principles of Money OS.",
    category: "Introduction",
    readTime: "2 min",
    lastUpdated: "June 8, 2026",
    content: `Money OS is a modern financial operating system designed to replace spreadsheet chaos with automated double-entry ledger bookkeeping. Built specifically for freelancers, agencies, student clubs, and small businesses, it delivers tenant-isolated ledger management with priority speed.

## Core Concepts
Before logging your first transaction, it is helpful to understand the key structures of the platform:
* **Workspaces**: Isolated containers representing an entity (e.g., a business or student club).
* **Ledgers**: The double-entry account ledger tracking assets, liabilities, income, and expenses.
* **Tenant Boundaries**: Full isolation at the database level to guarantee your financial privacy.

## Why Double-Entry Bookkeeping?
Every financial transaction requires an equal and opposite entry in at least two accounts. This ensures that the fundamental accounting equation remains balanced:
\`\`\`
Assets = Liabilities + Owner's Equity
\`\`\`
By mapping transactions to distinct accounts, Money OS automatically keeps your balance sheets in absolute agreement.`
  },
  {
    id: "double-entry",
    title: "Double-Entry Principles",
    description: "Deep dive into how double-entry ledger bookkeeping keeps your records perfectly balanced.",
    category: "Core Concepts",
    readTime: "4 min",
    lastUpdated: "June 8, 2026",
    content: `Double-entry bookkeeping is the foundation of modern financial accounting. In Money OS, every transaction you log is registered as a balanced entry, affecting both a source account and a destination account.

## Understanding Debits and Credits
Debits and credits are the core mechanisms of ledger entries:
1. **Debits (Dr)** increase asset or expense accounts, and decrease liability, equity, or revenue accounts.
2. **Credits (Cr)** increase liability, equity, or revenue accounts, and decrease asset or expense accounts.

For example, when you pay a monthly SaaS subscription:
* Your **Cash Account** (Asset) is credited (decreased).
* Your **Software Expense Account** (Expense) is debited (increased).

## Platform Safeguards
Money OS prevents you from saving unbalanced ledger states. All transaction updates must map to verified accounts, ensuring your reports are ready for tax compliance and audit verification.`
  },
  {
    id: "multi-tenancy",
    title: "Tenant Isolation",
    description: "Learn how Money OS secures your workspace data at the database level.",
    category: "Core Concepts",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Security is the primary directive of a financial operating system. Money OS enforces a strict multi-tenant architecture to ensure that workspace data is insulated from other tenants.

## Database-Level Isolation
Each workspace operates within its own logical tenant boundary. Database queries automatically include partition scopes that cannot be bypassed by client-side inputs.

## Access Safeguards
* **Cryptographic Session Keys**: User sessions are tied to a single tenant context.
* **Role-Based Middlewares**: APIs verify that the active user possesses permission to view the requested workspace ID before performing data lookups.
* **Immutable Audit Trail**: Changes to tenant boundaries or workspace ownership are logged instantly.`
  },
  {
    id: "logging-transactions",
    title: "Logging Transactions",
    description: "Step-by-step guide to entering expenses, income, and transfers.",
    category: "Transactions",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Logging transactions in Money OS is optimized for keyboard efficiency and quick ledger registration.

## How to Log a Transaction
1. **Press** the \`N\` key on your dashboard or click **New Transaction**.
2. **Enter** the transaction amount, payee, and date.
3. **Select** the account type (e.g., Checking Account, Expense Account).
4. **Choose** a category from your preconfigured categories.
5. **Add** optional tags (e.g., \`q2-marketing\`, \`travel\`) for granular reporting.

## Transaction Validation
Money OS automatically validates that all fields are correctly populated and that the transaction amount is positive. Uncategorized entries are automatically flagged for review.`
  },
  {
    id: "managing-transactions",
    title: "Managing Transactions",
    description: "Editing, deleting, and importing ledger records.",
    category: "Transactions",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Once transactions are recorded, they are visible in your main ledger data grids. 

## Editing Transactions
To edit an entry, hover over the transaction row in the ledger table and click the **Edit** icon (or press \`Enter\` when focused). Adjust details and click **Save**. This action is instantly logged in the workspace Audit Trail.

## Deleting Transactions
[WARNING] Deleting a transaction is permanent and will alter your historical balance metrics. If you delete a transaction, the workspace ledger will recalculate cash flow instantly. The action will be logged in the immutable Audit Logs.

## Importing Files
You can import CSV files from bank statements. Go to **Settings > Import**, map your bank columns to Money OS ledger fields, and preview the records before finalizing the bulk import.`
  },
  {
    id: "accounts",
    title: "Checking, Savings & Ledger Setups",
    description: "Setting up and balancing different financial accounts.",
    category: "Accounts",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Accounts represent the structural pillars of your ledger. You can manage multiple financial accounts in Money OS to reflect your real-world bank setups.

## Account Types
* **Checking Accounts**: For day-to-day operating expenses and income reception.
* **Savings Accounts**: For reserve capital, tax prep, and emergency balances.
* **Credit Cards**: Tracking liabilities and short-term debt repayments.
* **Equity Accounts**: For partner investments and owner capital records.

## Balancing Accounts
To reconcile your accounts, match your real-world bank statements against the transaction list on the **Accounts** screen. Mark transactions as "Reconciled" once verified.`
  },
  {
    id: "budgets",
    title: "Setting Thresholds & Alerts",
    description: "How to configure budget spending limits and receive alerts.",
    category: "Budgets",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Budgets in Money OS help you monitor spending and prevent budget overruns through proactive threshold checks.

## Creating a Budget
1. **Navigate** to the **Budgets** section.
2. **Click** **Create Budget**.
3. **Select** the category (e.g., Marketing, Hosting) and set a monthly limit.
4. **Define** threshold notifications (e.g., alert when spending hits 80%).

## Budget Alerts
When a category budget reaches your defined threshold, a notification appears on the dashboard. Admin accounts receive an alert to adjust spending immediately.`
  },
  {
    id: "recurring-transactions",
    title: "Recurring Ledgers & Automations",
    description: "Setting up auto-logging for subscriptions, salaries, and regular transfers.",
    category: "Recurring Transactions",
    readTime: "4 min",
    lastUpdated: "June 8, 2026",
    content: `Automation is key to maintaining a clean ledger without administrative overhead. Recurring transactions allow you to schedule ledger updates for monthly SaaS tools, rent, or recurring invoices.

## Scheduling a Recurring Transaction
1. **Go** to **Recurring** in the dashboard.
2. **Click** **New Recurring Flow**.
3. **Define** the frequency (e.g., monthly, weekly, annually).
4. **Input** accounts, categories, and amount.
5. **Set** the start date and end rules.

## Auto-Log vs Draft Approval
* **Auto-Log**: Money OS logs the transaction on the scheduled day without user intervention.
* **Draft Approval**: The system creates a draft transaction on the scheduled day and flags it on your dashboard for manual review before appending it to the ledger.`
  },
  {
    id: "teams",
    title: "Workspace Invites & Roles",
    description: "How to collaborate with team members, contractors, and accountants.",
    category: "Teams",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Money OS is a multi-player system. Invite team members to collaborate on your financial logs without compromising access boundaries.

## Inviting Members
1. **Navigate** to **Settings > Team**.
2. **Enter** the email address of the team member.
3. **Choose** their role context:
   * **Admin**: Full read/write access, billing management, and user invites.
   * **User**: Read/write access to transactions, but cannot view settings or modify configurations.
   * **Viewer**: Read-only access for auditing purposes (useful for external accountants).

## Invitation Lifecycle
Invites are sent via email containing secure single-use tokens. Unused invites can be revoked at any time from the Team Settings screen.`
  },
  {
    id: "audit-logs",
    title: "Immutable Activity Logs",
    description: "Using the security audit log to review workspace changes.",
    category: "Audit Logs",
    readTime: "2 min",
    lastUpdated: "June 8, 2026",
    content: `For compliance and internal control, Money OS logs every administrative action. Audit logs cannot be deleted or modified by any user.

## What is Logged?
* User logins, logouts, and failed authentication attempts.
* Transaction modifications, deletions, and CSV imports.
* Budget threshold adjustments.
* Team invitation dispatches and role updates.

## Reviewing Logs
Admins can access audit logs under **Settings > Audit Logs**. Use filters to isolate events by user, action type, or time frame.`
  },
  {
    id: "reports",
    title: "Profit & Loss Statements & Exports",
    description: "Generating financial reports and exporting clean data formats.",
    category: "Reports",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Analyze your organization's performance with integrated reporting modules.

## Generating Reports
* **Profit & Loss (P&L)**: Real-time summaries of revenue, expenses, and net profit margins.
* **Cash Flow Reports**: Visual tracking of cash inflows versus outflows.
* **Category Distribution**: Breakdown of expenses across operational categories.

## Exporting Data
Click the **Export** button on any report to download clean files. Money OS supports exports in **CSV** (for spreadsheet manipulation) and **PDF** (for sharing with stakeholders).`
  },
  {
    id: "security",
    title: "Data Protection & Security Best Practices",
    description: "How Money OS protects your financial logs.",
    category: "Security",
    readTime: "3 min",
    lastUpdated: "June 8, 2026",
    content: `Money OS employs modern security standards to protect your ledger records.

## Data Encryption
* **Encryption in Transit**: All connection sessions use TLS 1.3 encryption.
* **Encryption at Rest**: Databases are encrypted using AES-256 standards.

## Workspace Security Checklist
* Enforce strong passwords for all team invites.
* Regularly review the active session lists in **Settings > Sessions**.
* Configure webhook logs for suspicious workspace exports.`
  }
];

export const SUPPORT_GUIDES: SupportGuide[] = [
  {
    id: "freelancer-setup",
    title: "Freelancer Setup Guide",
    description: "Learn how to manage business expenses, client invoices, and tax preparation as a solo creator.",
    category: "Freelancer Guides",
    audience: "Freelancers, Contractors, Independent Creators",
    steps: [
      {
        title: "Create separate accounts",
        description: "Set up a Checking Account for client invoices and a separate Tax Prep Savings Account."
      },
      {
        title: "Log client payments",
        description: "Add each paid invoice to the ledger under the Income category, mapping it to your Checking Account."
      },
      {
        title: "Automate quarterly tax allocations",
        description: "Configure a recurring transaction that moves 30% of each invoice to your Tax Prep savings account."
      }
    ]
  },
  {
    id: "agency-setup",
    title: "Agency Ledger Setup",
    description: "Manage client retainers, payroll distributions, and operational category structures.",
    category: "Agency Guides",
    audience: "Agencies, Consultants, Multi-member Teams",
    steps: [
      {
        title: "Configure multi-currency clients",
        description: "Define accounts matching client retainer denominations. Money OS normalizes reporting in your primary base currency."
      },
      {
        title: "Configure operational categories",
        description: "Divide expenses into Contractor Fees, Hosting, SaaS, and Travel to monitor project margins."
      },
      {
        title: "Invite your accountant",
        description: "Add your accountant with the Viewer role to allow easy exporting of tax summaries without edit access."
      }
    ]
  },
  {
    id: "student-club-setup",
    title: "Student Club & Nonprofit Budgeting",
    description: "Track membership dues, event spending, and club budgets with absolute transparency.",
    category: "Student Club Guides",
    audience: "Student Clubs, Nonprofits, Community Groups",
    steps: [
      {
        title: "Set up membership dues log",
        description: "Log each member's dues as an Income transaction to your Cash Account."
      },
      {
        title: "Create event budgets",
        description: "Create distinct budgets for each club event (e.g., Annual Hackathon, Catering) to prevent spending overruns."
      },
      {
        title: "Enable public read-only logs",
        description: "Generate read-only viewer accounts for university auditors to verify spending transparency."
      }
    ]
  },
  {
    id: "small-business-budgeting",
    title: "Small Business Budgeting Guide",
    description: "Track inventory costs, monthly payroll, and overhead expenses with strict controls.",
    category: "Small Business Guides",
    audience: "Small Businesses, E-commerce, Retailers",
    steps: [
      {
        title: "Connect inventory accounts",
        description: "Set up inventory cost tracking under a Cost of Goods Sold (COGS) account."
      },
      {
        title: "Configure monthly payroll automation",
        description: "Create a recurring transaction schedule that deducts salaries and office lease expenses on the 1st of each month."
      },
      {
        title: "Monitor budget thresholds",
        description: "Configure alerts at 85% of office supply budgets to control administrative overhead."
      }
    ]
  }
];

export const SUPPORT_FAQS: SupportFAQ[] = [
  {
    id: "faq-1",
    question: "Is Money OS really free?",
    answer: "Yes! Money OS is currently in active Beta and is 100% free for all onboarded users. There are no limits on features, workspaces, or transactions during the Beta period.",
    category: "Account"
  },
  {
    id: "faq-2",
    question: "What is double-entry bookkeeping?",
    answer: "Double-entry bookkeeping means every financial transaction has a dual effect on your accounts: one account is debited (increased or decreased based on type) and another is credited. This ensures your ledger remains mathematically balanced at all times.",
    category: "Transactions"
  },
  {
    id: "faq-3",
    question: "Can I invite external auditors to my workspace?",
    answer: "Yes. You can invite team members with the 'Viewer' role. Viewers can see transaction tables, run reports, and export CSV lists, but are restricted from editing or deleting ledger records.",
    category: "Teams"
  },
  {
    id: "faq-4",
    question: "How is my financial data protected?",
    answer: "All workspace data is isolated at the database level. Connection sessions are encrypted via TLS 1.3, and databases are encrypted using AES-256 at rest. We also generate an immutable audit trail for all workspace actions.",
    category: "Security"
  },
  {
    id: "faq-5",
    question: "How do I export my data for tax season?",
    answer: "Navigate to the Reports page, choose the period filter, and click the 'Export' button. You can download your ledger records and profit & loss statements in clean, structured CSV or print-ready PDF formats.",
    category: "Reports"
  }
];

export const CHANGELOGS: ChangelogEntry[] = [
  {
    version: "v2.2.0",
    date: "June 8, 2026",
    title: "Refined brand system and navigation sizing",
    added: [
      "Custom theme-aware SVG favicon utilizing browser dark-mode queries.",
      "High-precision interlocking chevron brandmark system.",
      "Workspace switcher icon scaling for legibility."
    ],
    improved: [
      "Responsive layout rendering on ultrawide and mobile displays.",
      "Layout balancing of navigation header elements."
    ],
    fixed: [
      "Removed legacy triangle icons across workspace switchers and dashboard headers.",
      "Standardized metadata fields from legacy title entries."
    ]
  },
  {
    version: "v2.1.0",
    date: "May 20, 2026",
    title: "Enhanced recurring transactions engine",
    added: [
      "Automated draft transaction reviews before appending to the ledger.",
      "Support for daily and quarterly transaction interval frequencies."
    ],
    improved: [
      "Fuzzy search queries in the workspace switcher drop-down.",
      "Keyboard shortcut response times on the main ledger data table."
    ],
    fixed: [
      "Corrected calculation bug on savings account interest records.",
      "Fixed alignment offset in column layout."
    ]
  }
];
