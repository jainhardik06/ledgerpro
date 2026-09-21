# Money OS - Event Taxonomy

This document outlines the standard taxonomy for business and product events tracked via PostHog in Money OS.

## 1. Global Events

| Event Name | Description | Properties | Trigger Location |
|------------|-------------|------------|------------------|
| `PAGE_VIEW` | User views any page. | `$current_url`, `pathname`, `searchParams` | `PostHogPageView` component |

## 2. Authentication & User Lifecycle

| Event Name | Description | Properties | Trigger Location |
|------------|-------------|------------|------------------|
| `USER_SIGNUP` | New user registers an account. | `email`, `userId` | `/api/auth/signup` |
| `USER_LOGIN` | User successfully logs in. | `email`, `userId` | `/api/auth/login` |
| `USER_LOGOUT` | User logs out. | `userId` | `/api/auth/logout` |

## 3. Workspace & Team

| Event Name | Description | Properties | Trigger Location |
|------------|-------------|------------|------------------|
| `WORKSPACE_CREATED` | New workspace/tenant is created. | `workspaceId`, `workspaceName` | `/api/auth/signup` / `/api/tenant` |
| `TEAM_MEMBER_INVITED` | A new team member is invited to workspace. | `workspaceId`, `role`, `inviteeEmail` | `/api/tenant/users` |

## 4. Core Business Objects (CRUD)

| Event Name | Description | Properties | Trigger Location |
|------------|-------------|------------|------------------|
| `TRANSACTION_CREATED` | New transaction logged. | `transactionId`, `amount`, `type` | `/api/transactions` (POST) |
| `TRANSACTION_UPDATED` | Existing transaction modified. | `transactionId` | `/api/transactions/[id]` (PUT) |
| `TRANSACTION_DELETED` | Transaction deleted. | `transactionId` | `/api/transactions/[id]` (DELETE) |
| `BUDGET_CREATED` | New budget created. | `budgetId`, `amount`, `period` | `/api/budgets` (POST) |
| `BUDGET_UPDATED` | Existing budget modified. | `budgetId` | `/api/budgets/[id]` (PUT) |
| `CLIENT_CREATED` | New client profile created. | `clientId` | `/api/clients` (POST) |

## 5. Product Usage & Engagement

| Event Name | Description | Properties | Trigger Location |
|------------|-------------|------------|------------------|
| `REPORT_VIEWED` | User views a financial report. | `tab`, `dateRange`, `compareEnabled` | `src/app/dashboard/reports/page.tsx` |
| `REPORT_EXPORTED` | User exports report data (CSV or print-ready PDF). | `format` (`CSV`/`PDF`), `tab`, `rowCount` (CSV) | `src/app/dashboard/reports/page.tsx` export handlers |
| `COMMAND_PALETTE_OPENED` | User invokes command palette. | `trigger` (e.g. 'shortcut', 'click') | `src/components/ui/CommandPalette.tsx` |
| `COMMAND_EXECUTED` | User executed a command. | `commandId`, `commandName` | `src/components/ui/CommandPalette.tsx` |

## 6. User Properties (Identification)
When a user is authenticated, they should be identified with:
- `email`: User's email
- `role`: Their role in the current workspace
- `tenantId` / `workspaceId`: The active workspace ID
