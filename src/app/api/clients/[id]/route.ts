import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteClient, createLog, updateClient } from '@/lib/db';
import { validateString } from '@/lib/validation';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const success = await deleteClient(id, session.tenantId);
    if (success) {
      await createLog(session.username, 'Delete Client', `Deleted client ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name, email } = await req.json();
    const updates: { name?: string; email?: string } = {};

    if (name !== undefined) {
      const cleanName = validateString(name, 'Client name', { min: 1, max: 120 });
      if (cleanName instanceof NextResponse) return cleanName;
      updates.name = cleanName;
    }
    if (email !== undefined) {
      const cleanEmail = validateString(email, 'Email', { max: 254, required: false });
      if (cleanEmail instanceof NextResponse) return cleanEmail;
      updates.email = cleanEmail || undefined;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid client fields provided' }, { status: 400 });
    }

    const success = await updateClient(id, session.tenantId, updates);
    if (success) {
      await createLog(session.username, 'Edit clients', `Edited clients ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
