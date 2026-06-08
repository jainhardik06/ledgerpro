import { NextResponse } from 'next/server';
import { createSupportTicket } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subject, workspaceId, priority, category, message, name, email } = body;

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    // Map priority to database enum ('LOW' | 'MEDIUM' | 'HIGH')
    let dbPriority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (priority) {
      const p = priority.toUpperCase();
      if (p === 'LOW') dbPriority = 'LOW';
      else if (p === 'MEDIUM') dbPriority = 'MEDIUM';
      else if (p === 'HIGH' || p === 'URGENT') dbPriority = 'HIGH';
    }

    // Save ticket into database
    const ticket = await createSupportTicket({
      subject,
      tenantId: workspaceId || 'public',
      status: 'OPEN',
      priority: dbPriority,
      name,
      email,
      message,
      category
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    console.error('Support ticket creation error:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
