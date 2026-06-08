import { NextResponse } from 'next/server';
import { createSupportTicket } from '@/lib/db';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rateLimit';
import { firstClientIp, validateString } from '@/lib/validation';

export async function POST(req: Request) {
  const ipAddress = firstClientIp(req);

  try {
    const rate = checkRateLimit(`support:${ipAddress}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many support requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const body = await req.json();
    const { subject, workspaceId, priority, category, message, name, email, companyWebsite } = body;

    if (companyWebsite) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const cleanSubject = validateString(subject, 'Subject', { min: 3, max: 160 });
    if (cleanSubject instanceof NextResponse) return cleanSubject;
    const cleanMessage = validateString(message, 'Message', { min: 10, max: 4000 });
    if (cleanMessage instanceof NextResponse) return cleanMessage;
    const cleanWorkspaceId = validateString(workspaceId, 'Workspace ID', { max: 100, required: false });
    if (cleanWorkspaceId instanceof NextResponse) return cleanWorkspaceId;
    const cleanCategory = validateString(category, 'Category', { max: 80, required: false });
    if (cleanCategory instanceof NextResponse) return cleanCategory;
    const cleanName = validateString(name, 'Name', { max: 120, required: false });
    if (cleanName instanceof NextResponse) return cleanName;
    const cleanEmail = validateString(email, 'Email', { max: 254, required: false });
    if (cleanEmail instanceof NextResponse) return cleanEmail;

    let dbPriority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (typeof priority === 'string') {
      const p = priority.toUpperCase();
      if (p === 'LOW') dbPriority = 'LOW';
      else if (p === 'MEDIUM') dbPriority = 'MEDIUM';
      else if (p === 'HIGH' || p === 'URGENT') dbPriority = 'HIGH';
    }

    const ticket = await createSupportTicket({
      subject: cleanSubject,
      tenantId: cleanWorkspaceId || 'public',
      status: 'OPEN',
      priority: dbPriority,
      name: cleanName,
      email: cleanEmail,
      message: cleanMessage,
      category: cleanCategory,
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    logError('Support ticket creation error', error, { ipAddress });
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
