import { NextResponse } from 'next/server';
import { createSupportTicket } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, message } = body;

    if (!firstName || !lastName || !email || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Embed name, email, and message content into the ticket subject for dashboard visibility
    const subject = `[Contact Form] ${firstName} ${lastName} (${email}): ${message}`;

    const ticket = await createSupportTicket({
      subject,
      tenantId: 'public_contact',
      status: 'OPEN',
      priority: 'LOW',
      name: `${firstName} ${lastName}`,
      email,
      message,
      category: 'General Contact'
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    console.error('Contact submission error:', error);
    return NextResponse.json({ error: 'Failed to submit contact message' }, { status: 500 });
  }
}
