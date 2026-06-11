const fs = require('fs');
const path = require('path');

const routes = {
  'accounts': 'updateAccount',
  'categories': 'updateCategory',
  'recurring': 'updateRecurringTransaction',
  'clients': 'updateClient'
};

for (const [entity, updateFunc] of Object.entries(routes)) {
  const p = path.join('src', 'app', 'api', entity, '[id]', 'route.ts');
  let code = fs.readFileSync(p, 'utf8');
  if (!code.includes('export async function PUT')) {
    const putBlock = `
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { ${updateFunc} } = await import('@/lib/db');
    
    let updates = body;
    if ('${entity}' === 'categories') updates = body.name;

    const success = await ${updateFunc}(id, session.tenantId, updates);
    if (success) {
      const { createLog } = await import('@/lib/db');
      await createLog(session.username, 'Edit ${entity}', \`Edited ${entity} ID: \${id}\`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
`;
    fs.writeFileSync(p, code + '\n' + putBlock);
  }
}

const budgetDir = path.join('src', 'app', 'api', 'budgets', '[id]');
if (!fs.existsSync(budgetDir)) fs.mkdirSync(budgetDir, { recursive: true });
const budgetFile = path.join(budgetDir, 'route.ts');
if (!fs.existsSync(budgetFile)) {
  fs.writeFileSync(budgetFile, `
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteBudget, updateBudget, createLog } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const success = await deleteBudget(id, session.tenantId);
    if (success) {
      await createLog(session.username, 'Delete Budget', \`Deleted budget ID: \${id}\`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const success = await updateBudget(id, session.tenantId, body.limitAmount);
    if (success) {
      await createLog(session.username, 'Edit Budget', \`Edited budget ID: \${id}\`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
  `.trim());
}
console.log('Routes patched!');
