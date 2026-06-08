import { NextResponse } from 'next/server';
import { createNewsletterSubscriber } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const subscriber = await createNewsletterSubscriber(email);
    return NextResponse.json(subscriber, { status: 201 });
  } catch (error: any) {
    console.error('Newsletter subscription error:', error);
    return NextResponse.json({ error: 'Failed to subscribe to newsletter.' }, { status: 500 });
  }
}
