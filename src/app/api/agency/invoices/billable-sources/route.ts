import { NextRequest, NextResponse } from 'next/server';
import { requireAgencyPermission } from '@/lib/agency/permissions/authorization';
import { getProjectById, getProjects } from '@/lib/db';
import { logError } from '@/lib/logger';
import {
  getBillableTimeDetailed, getBillableExpenses, getBillableMilestones,
} from '@/lib/agency/domain/billing-sources';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agency/invoices/billable-sources (Module 9 §69/§70/§144)
 *
 * The invoice wizard's Source Selector: exactly the items that may be added
 * to a draft RIGHT NOW (§70 eligibility, evaluated by the 9C services — this
 * route never re-derives eligibility). Scope: one project (projectId) or a
 * client's whole engagement (clientId — time/milestones walk the client's
 * non-archived projects; expenses carry the backfilled clientId). Admin/
 * finance only (agency.invoices.write — the wizard is an invoicing surface).
 *
 * §97 — unvaluableMilestones is COUNTED, never hidden: percentage milestones
 * on projects without a contract value surface as an honest number.
 * Similarly, unpricedTime surfaces hours blocked by missing rate configuration (§96).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAgencyPermission('agency.invoices.write');
  if (!gate.ok) {
    const { status, error, code, redirectTo } = gate;
    return NextResponse.json(code ? { error, code, redirectTo } : { error }, { status });
  }
  const tenantId = gate.context.tenant.id || (gate.context.tenant._id ? gate.context.tenant._id.toString() : undefined);
  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;
    if (!projectId && !clientId) {
      return NextResponse.json({ error: 'A clientId or projectId is required' }, { status: 400 });
    }

    // The engagement scope: one project, or the client's non-archived projects.
    const projects = projectId !== undefined
      ? [await getProjectById(projectId, tenantId)].filter(p => p !== null)
      : (await getProjects(tenantId, {}, { clientId })).filter(p => p.status !== 'ARCHIVED');
    const projectNames: Record<string, string> = {};
    for (const p of projects) projectNames[p.id] = p.name;

    // §70 time — one call per project, concatenated (one line per entry).
    const timeResults = await Promise.all(
      projects.map(p => getBillableTimeDetailed(tenantId, { projectId: p.id }))
    );
    const time = timeResults.flatMap(r => r.items);
    const unpricedTime = timeResults.reduce(
      (acc, r) => ({
        count: acc.count + r.unpriced.count,
        durationMinutes: acc.durationMinutes + r.unpriced.durationMinutes,
        roles: Array.from(new Set([...acc.roles, ...r.unpriced.roles])),
      }),
      { count: 0, durationMinutes: 0, roles: [] as string[] }
    );

    // §70 expenses — project expenses carry the backfilled clientId, so the
    // client scope (and the project scope) is one filtered query.
    const expenses = await getBillableExpenses(tenantId, projectId !== undefined ? { projectId } : { clientId: clientId! });

    // §70/§73 milestones — one call per project; §97 unvaluable is summed.
    let unvaluableMilestones = 0;
    const milestones = [];
    for (const p of projects) {
      const result = await getBillableMilestones(tenantId, { projectId: p.id });
      unvaluableMilestones += result.unvaluable;
      milestones.push(...result.items);
    }

    return NextResponse.json({
      success: true,
      time: time.map(({ entry, amount }) => ({
        id: entry.id,
        date: entry.date,
        durationMinutes: entry.durationMinutes,
        notes: entry.notes ?? null,
        amount,
        projectId: entry.projectId,
        projectName: projectNames[entry.projectId] ?? null,
      })),
      expenses: expenses.map(({ expense, amount }) => ({
        id: expense.id,
        vendorName: expense.vendorName,
        description: expense.description,
        expenseDate: expense.expenseDate,
        amount,
        projectId: expense.projectId ?? null,
      })),
      milestones: milestones.map(({ milestone, amount }) => ({
        id: milestone.id,
        name: milestone.name,
        sequence: milestone.sequence,
        amount,
        projectId: milestone.projectId,
        projectName: projectNames[milestone.projectId] ?? null,
      })),
      unvaluableMilestones,
      unpricedTime,
    });
  } catch (error) {
    logError('agency:billable sources error', error, { tenantId });
    return NextResponse.json({ error: 'Failed to fetch billable sources' }, { status: 500 });
  }
}
