import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSupportTickets, createSupportTicket } from '@/lib/db';

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tickets = await getSupportTickets();

    return NextResponse.json(tickets);
  } catch (error: any) {
    console.error('Support fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch support tickets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { subject, tenantId, priority } = body;

    const ticket = await createSupportTicket({ subject, tenantId, status: 'OPEN', priority: priority || 'LOW' });
    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    console.error('Ticket creation error:', error);
    return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 });
  }
}
