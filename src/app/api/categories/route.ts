import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getCategories, createCategory, createLog } from '@/lib/db';

const DEFAULT_CATEGORIES = ['Salary', 'Rent', 'Food', 'Utilities', 'Sales', 'Investment', 'Others'];

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    let categories = await getCategories(session.tenantId);

    // Seed default categories if none exist for the user
    if (categories.length === 0) {
      for (const catName of DEFAULT_CATEGORIES) {
        await createCategory(session.tenantId, session.userId, catName);
      }
      categories = await getCategories(session.tenantId);
    }

    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error('Fetch categories error:', error);
    return NextResponse.json(
      { error: 'An error occurred fetching categories' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    if (!session || !session.tenantId) {
      return NextResponse.json({ error: 'Unauthorized or missing tenant' }, { status: 401 });
    }

    const { name } = await req.json();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    
    // Check if category name already exists
    const existing = await getCategories(session.tenantId);
    const exists = existing.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (exists) {
      return NextResponse.json(
        { error: 'Category already exists' },
        { status: 400 }
      );
    }

    const newCategory = await createCategory(session.tenantId, session.userId, trimmedName);

    await createLog(session.username, 'Add Category', `Created category: ${trimmedName}`, session.tenantId);

    return NextResponse.json({ success: true, category: newCategory });
  } catch (error) {
    console.error('Create category error:', error);
    return NextResponse.json(
      { error: 'An error occurred creating the category' },
      { status: 500 }
    );
  }
}
