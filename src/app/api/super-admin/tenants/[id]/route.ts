import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getTenantById, getUsersByTenant, updateTenant, createLog } from '@/lib/db';
import { validateEnum } from '@/lib/validation';
import { TENANT_PLANS } from '@/lib/plans';

/**
 * GET /api/super-admin/tenants/[id] — one tenant's detail record.
 *
 * The Organizations list is the only tenant surface the console had; opening a
 * single organization needs its own read. SUPER_ADMIN only, 404 for an unknown
 * id. Everything returned here is the stored record: no derived or estimated
 * numbers (the agency-specific metrics already have their own privileged route,
 * /api/super-admin/tenants/[id]/agency, built on the tenant-side engines).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tenant = await getTenantById(id);
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenantId = tenant.id || tenant._id?.toString() || id;

    // getUsersByTenant returns whole user documents, passwordHash included (it
    // is a DAL-level read shared with tenant-scoped code). A platform-console
    // response must never carry a credential, so the projection is explicit
    // rather than a spread — new User fields cannot leak in by default.
    const users = await getUsersByTenant(tenantId);
    const members = users.map(u => ({
      id: u.id || u._id?.toString() || '',
      username: u.username,
      role: u.role,
      status: u.status || 'ACTIVE',
      createdAt: u.createdAt ?? null,
    }));

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenantId,
        name: tenant.name,
        status: tenant.status,
        plan: tenant.plan,
        appMode: tenant.appMode ?? 'Standard',
        settings: tenant.settings ?? {},
        limits: tenant.limits ?? { maxUsers: 5 },
        attribution: tenant.attribution ?? null,
        createdAt: tenant.createdAt ?? null,
      },
      team: {
        total: members.length,
        admins: members.filter(m => m.role === 'TENANT_ADMIN').length,
        active: members.filter(m => m.status === 'ACTIVE').length,
        members,
      },
    });
  } catch (error) {
    console.error('Tenant detail error:', error);
    return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 });
  }
}

/**
 * PUT /api/super-admin/tenants/[id] — apply a platform-operator change.
 *
 * The body is an ALLOWLIST, not a spread. It used to be handed straight to
 * updateTenant, which $set the parsed JSON onto the tenant document — so a
 * caller could rename a tenant, rewrite its limits or settings, or plant
 * arbitrary keys. Only the two fields the console actually offers are honored,
 * each validated against its real domain (status is enforced at login and by
 * the agency vertical; plan drives the revenue estimate), and unknown keys are
 * ignored rather than written. A body carrying nothing recognized is a 400, so
 * a silent no-op can never look like a successful change.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'A JSON object body is required' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates: { status?: 'ACTIVE' | 'SUSPENDED'; plan?: (typeof TENANT_PLANS)[number] } = {};

    if (body.status !== undefined) {
      const status = validateEnum(body.status, 'Status', ['ACTIVE', 'SUSPENDED'] as const);
      if (status instanceof NextResponse) return status;
      updates.status = status;
    }
    if (body.plan !== undefined) {
      const plan = validateEnum(body.plan, 'Plan', TENANT_PLANS);
      if (plan instanceof NextResponse) return plan;
      updates.plan = plan;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No supported fields to update (expected status or plan)' },
        { status: 400 }
      );
    }

    const success = await updateTenant(id, updates);
    if (!success) {
      return NextResponse.json({ error: 'Failed to update tenant' }, { status: 400 });
    }

    await createLog(
      session.username,
      'Update Tenant',
      `Updated tenant ${id}: ${JSON.stringify(updates)}`
    );

    return NextResponse.json({ success: true, applied: updates });
  } catch (error) {
    console.error('Tenant update error:', error);
    return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
  }
}
