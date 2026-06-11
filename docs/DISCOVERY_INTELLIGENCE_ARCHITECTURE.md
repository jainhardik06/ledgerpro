# Discovery Intelligence Architecture

## System Context
The Discovery Intelligence Center lives within the `ledger` repository (Next.js App Router) but queries data originating from the `money-os-discovery` repository (Astro) and external tracking services. It acts as a read-heavy dashboard aggregating growth metrics.

## Data Flow
1. **Product Engine** (`/super-admin/discovery/page.tsx`) invokes `connectGrowthDb()`.
2. **MongoDB** (`money_os_growth` cluster) responds with aggregate counts across all 16 growth collections.
3. **React Server Component** processes these values server-side.
4. **Client** receives fully rendered HTML via Next.js with zero client-side fetching waterfalls.

## Component Architecture

### Server Component (`page.tsx`)
- Fetches all necessary counts simultaneously using `Promise.all()` to ensure the dashboard loads instantly.
- Handled errors gracefully; if the Growth DB is down, it displays zeroes rather than crashing the Super Admin portal.

### Query Strategy
To avoid hardcoded values, we execute exact document counts:
- `directories`: `countDocuments()`
- `directory_submissions`: `countDocuments({ status: 'Approved' })`
- `backlinks`: `countDocuments()`
- `crawler_visits`: `countDocuments({ botFamily: 'GPTBot' })`
- `docs_pages`: `countDocuments()`

## Design System Compliance
- **Container**: `max-w-7xl` or `max-w-5xl`.
- **Grids**: Responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- **Cards**: `bg-[#0a0a0a] border border-[#262626] rounded-xl p-6`.
- **Typography**: Metrics strictly use `tabular-nums font-mono text-[32px] font-semibold`. Headers use `-tracking-tight`.

## Extensibility
The dashboard is designed as a foundational grid. As Product Hunt functionality, programmatic SEO generation, or AI Content Engine webhooks are built out, their respective components can be appended as new grid rows without breaking the existing layout.
