import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { createLog, getUserById, getProjectById, getClientById } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp } from '@/lib/validation';
import { createExpense, listExpenses, getUnbilledExpenses } from '@/lib/agency/domain/agency.expenses';
import { redactExpenseCost, type Expense } from '@/lib/agency/types/expense';
import { validateExpenseFilters } from '@/lib/agency/validators/expense';

export const dynamic = 'force-dynamic';

/**
 * /api/agency/expenses (Module 8 §51/§53)
 *
 *   GET  — the expense list. Default view is the caller's own expenses;
 *          admins may list anyone's (§33 pattern). Filters: projectId,
 *          clientId, status, billingStatus, expenseType, billable, vendor
 *          (§53 by-vendor report), dateFrom/dateTo, plus view=unbilled for
 *          the §48 invoice-eligible set. Cost-side fields are redacted for
 *          non-admin consumers (§99).
 *   POST — record an expense (agency.expenses.write — a base capability of
 *          every agency member, like time §4). The client charge freezes at
 *          creation for billable expenses (§43); the core Transaction is
 *          NOT created here — only at approval (§41).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.dashboard.read');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;
  const actor = { userId: session.userId, role: session.role };
  const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';

  try {
    const { searchParams } = new URL(req.url);
    const params: Record<string, string | undefined> = {};
    for (const key of ['projectId', 'clientId', 'status', 'billingStatus', 'expenseType', 'billable', 'vendor', 'dateFrom', 'dateTo']) {
      const v = searchParams.get(key);
      if (v) params[key] = v;
    }
    const filters = validateExpenseFilters(params);
    // §33 pattern — only admins may view another user's expenses.
    if (isAdmin && searchParams.get('createdBy')) filters.createdBy = searchParams.get('createdBy')!;

    // §53 view=unbilled — the §48/§49 invoice-eligible set (APPROVED +
    // billable + UNBILLED). Admins only: it is a billing workspace view.
    let expenses: Expense[];
    if (searchParams.get('view') === 'unbilled') {
      if (!isAdmin) {
        return NextResponse.json({ error: 'You do not have permission to perform this action' }, { status: 403 });
      }
      expenses = await getUnbilledExpenses(tenantId, filters);
    } else {
      expenses = await listExpenses(tenantId, actor, filters);
    }

    // §20 spirit — labels, never raw ids; §113 — cross-tenant refs get none.
    const userLabels: Record<string, string> = {};
    for (const userId of [...new Set(expenses.map(e => e.createdBy))]) {
      const user = await getUserById(userId);
      if (user?.username) userLabels[userId] = user.username;
    }
    const projectNames: Record<string, string> = {};
    for (const projectId of [...new Set(expenses.map(e => e.projectId).filter((p): p is string => !!p))]) {
      const project = await getProjectById(projectId, tenantId);
      if (project) projectNames[projectId] = project.name;
    }
    const clientNames: Record<string, string> = {};
    for (const clientId of [...new Set(expenses.map(e => e.clientId).filter((c): c is string => !!c))]) {
      const client = await getClientById(clientId, tenantId);
      if (client) clientNames[clientId] = client.name;
    }

    // §99 — the cost side (amount, markup) is admin-only data.
    const payload: Expense[] | ReturnType<typeof redactExpenseCost>[] = isAdmin
      ? expenses
      : expenses.map(redactExpenseCost);
    return NextResponse.json({ success: true, expenses: payload, userLabels, projectNames, clientNames });
  } catch (error) {
    logError('agency:fetch expenses error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.expenses.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  const session = gate.context.session;

  try {
    const body = await req.json();
    const ipAddress = firstClientIp(req);
    const result = await createExpense(tenantId, { userId: session.userId, role: session.role }, body, {
      username: session.username,
      tenantId,
      log: (action, detail) => createLog(session.username, action, detail, tenantId, ipAddress),
    });
    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error, ...(result.code && { code: result.code }) }, { status: result.status });
    }
    const isAdmin = session.role === 'SUPER_ADMIN' || session.role === 'TENANT_ADMIN';
    return NextResponse.json({ success: true, expense: isAdmin ? result.data : redactExpenseCost(result.data) }, { status: 201 });
  } catch (error) {
    logError('agency:create expense error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
