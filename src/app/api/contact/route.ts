import { NextResponse } from 'next/server';
import { createSupportTicket } from '@/lib/db';
import { logError } from '@/lib/logger';
import { firstClientIp, validateString } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  const ipAddress = firstClientIp(req);

  try {
    const rate = checkRateLimit(`contact:${ipAddress}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many contact submissions. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
      );
    }

    const body = await req.json();
    const { firstName, lastName, email, message } = body;
    const cleanFirstName = validateString(firstName, 'First name', { min: 1, max: 80 });
    if (cleanFirstName instanceof NextResponse) return cleanFirstName;
    const cleanLastName = validateString(lastName, 'Last name', { min: 1, max: 80 });
    if (cleanLastName instanceof NextResponse) return cleanLastName;
    const cleanEmail = validateString(email, 'Email', { min: 3, max: 254 });
    if (cleanEmail instanceof NextResponse) return cleanEmail;
    const cleanMessage = validateString(message, 'Message', { min: 10, max: 4000 });
    if (cleanMessage instanceof NextResponse) return cleanMessage;

    const subject = `[Contact Form] ${cleanFirstName} ${cleanLastName} (${cleanEmail})`;

    await createSupportTicket({
      subject,
      tenantId: 'public',
      status: 'OPEN',
      priority: 'MEDIUM',
      name: `${cleanFirstName} ${cleanLastName}`,
      email: cleanEmail,
      message: cleanMessage,
      category: 'Sales',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError('Contact submission error', error, { ipAddress });
    return NextResponse.json({ error: 'Failed to submit contact message' }, { status: 500 });
  }
}
