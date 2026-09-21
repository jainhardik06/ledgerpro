/**
 * Agency Vertical — Types: screen state contract (Step 0.14)
 *
 * CLIENT-SAFE: types and pure helpers only. No server imports.
 *
 * Every Agency screen is a state machine over these six states — never a
 * bare `loading` boolean:
 *
 *   LOADING       request in flight (skeleton UI, no numbers)
 *   SUCCESS       data rendered
 *   EMPTY         success + no data yet (onboarding copy, not zeros)
 *   PARTIAL       some sections loaded, some failed (show loaded parts,
 *                 inline error on the rest — never a blank screen)
 *   ERROR         request failed (error copy + Retry — NEVER zeros)
 *   UNAUTHORIZED  session/tenant/capability rejected (401/403 — sign-in or
 *                 permission message, never financial data)
 *
 * THE CARDINAL RULE: zero and unavailable are different states. A failed
 * request must never render "₹0 / 0 Projects / 0 Profit". Metrics are
 * rendered ONLY from a SUCCESS/PARTIAL/EMPTY payload. `sourceReady: false`
 * (metrics.ts) is the "wired but no data yet" state — also not a failure.
 */
export type ScreenState =
  | { status: 'LOADING' }
  | { status: 'SUCCESS' }
  | { status: 'EMPTY'; message?: string }
  | { status: 'PARTIAL'; failedSections: readonly string[] }
  | { status: 'ERROR'; message?: string; canRetry: boolean }
  | { status: 'UNAUTHORIZED'; reason: 'AUTH' | 'TENANT' | 'CAPABILITY' };

// ---------- derivation from an API response ----------

/** Map an HTTP status to the unauthorized reason (only 401/403 qualify). */
export function unauthorizedReason(httpStatus: number): 'AUTH' | 'TENANT' | 'CAPABILITY' | null {
  if (httpStatus === 401) return 'AUTH';
  if (httpStatus === 403) return 'CAPABILITY'; // 403 body may refine: TENANT | CAPABILITY
  return null;
}

/**
 * Derive the state for a data section from its fetch outcome + payload.
 * `isEmpty` is domain-supplied (e.g. no projects) — emptiness is a SUCCESS
 * variant, never an ERROR.
 */
export function deriveSectionState<T>(
  loaded: boolean,
  error: string | null,
  data: T | null,
  isEmpty: (data: T) => boolean,
  emptyMessage?: string
): ScreenState {
  if (error) return { status: 'ERROR', message: error, canRetry: true };
  if (!loaded) return { status: 'LOADING' };
  if (data === null) return { status: 'ERROR', message: 'Data unavailable', canRetry: true };
  if (isEmpty(data)) return { status: 'EMPTY', message: emptyMessage };
  return { status: 'SUCCESS' };
}

// ---------- canonical copy (single source; components may not diverge) ----------

export const STATE_COPY = {
  EMPTY_AGENCY: 'No agency activity yet. Create your first client and project to start seeing profitability data.',
  EMPTY_PROJECTS: 'No projects yet. Create your first project to see its financial baseline.',
  EMPTY_ALERTS: 'No alerts. Everything is within thresholds.',
  ERROR_SUMMARY: "We couldn't load your agency summary.",
  RETRY: 'Retry',
  UNAUTHORIZED_AUTH: 'Please sign in to view your agency workspace.',
  UNAUTHORIZED_TENANT: 'Your workspace is not available. Contact your administrator.',
  UNAUTHORIZED_CAPABILITY: 'This feature requires an Agency workspace with the right permissions.',
} as const;

/**
 * Module 1.21 — Empty Agency onboarding copy (single source). A brand-new
 * Agency tenant must not look broken: a welcome, what appears once clients
 * and projects exist, and ONE primary action. The action's destination
 * (client creation) ships with Module 2 — until then the button renders
 * disabled with an honest note, never fake functionality.
 */
export const EMPTY_AGENCY_ONBOARDING = {
  title: 'Welcome to your Agency Command Center',
  subtitle: 'Once you add clients and projects, you’ll see:',
  /** The six capabilities that light up — mirrors the dashboard sections. */
  highlights: [
    'Revenue',
    'Billing',
    'Collection',
    'Unbilled work',
    'Project health',
    'Profitability',
  ] as readonly string[],
  actionLabel: 'Create your first client',
  /** §28 — client creation is admin-only; read-only USERs see this note. */
  actionNote: 'Client creation requires workspace admin access',
} as const;

/**
 * Module 1.22 — Partial data state (single source). Implementation is
 * incremental: at any moment some sources exist and others don't
 * (e.g. Projects 8, Invoices —, Time —, Profitability —). A metric whose
 * source is not wired yet renders its pending note — NEVER zero:
 * an unwired capability is not ₹0, 0h, or 0%.
 *
 * Components render these notes wherever sourceReady is false.
 */
export type PendingSource = 'projects' | 'time' | 'invoices' | 'payments';

export const PENDING_SOURCE_COPY: Readonly<Record<PendingSource, string>> = {
  projects: 'Waiting for projects',
  time: 'Waiting for time tracking',
  invoices: 'Waiting for invoicing',
  payments: 'Waiting for payment records',
};

/** Generic note for capabilities without a single owning source. */
export const NOT_AVAILABLE_YET = 'Not available yet';

// ---------- component helper ----------

/**
 * Render-state reducer for components: maps a ScreenState to which view to
 * render — exactly one of skeleton | content | empty | error | unauthorized.
 * PARTIAL renders content (with inline error markers) — never a blank page.
 */
export type RenderView = 'skeleton' | 'content' | 'empty' | 'error' | 'unauthorized';

export function renderViewFor(state: ScreenState): RenderView {
  switch (state.status) {
    case 'LOADING': return 'skeleton';
    case 'SUCCESS': return 'content';
    case 'EMPTY': return 'empty';
    case 'PARTIAL': return 'content';
    case 'ERROR': return 'error';
    case 'UNAUTHORIZED': return 'unauthorized';
  }
}
