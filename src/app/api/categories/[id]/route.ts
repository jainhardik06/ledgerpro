import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { deleteCategory, createLog, updateCategory } from '@/lib/db';
import { validateString } from '@/lib/validation';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { id } = await params;
    const success = await deleteCategory(id, session.tenantId);

    if (!success) {
      return NextResponse.json(
        { error: 'Category not found or unauthorized' },
        { status: 404 }
      );
    }

    await createLog(session.username, 'Delete Category', `Deleted category (ID: ${id})`, session.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json(
      { error: 'An error occurred deleting the category' },
      { status: 500 }
    );
  }
}


export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name } = await req.json();
    const cleanName = validateString(name, 'Category name', { min: 1, max: 80 });
    if (cleanName instanceof NextResponse) return cleanName;

    const success = await updateCategory(id, session.tenantId, cleanName);
    if (success) {
      await createLog(session.username, 'Edit categories', `Edited categories ID: ${id}`, session.tenantId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
