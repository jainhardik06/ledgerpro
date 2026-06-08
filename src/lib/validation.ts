import { NextResponse } from 'next/server';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateString(
  value: unknown,
  label: string,
  options: { min?: number; max: number; required?: boolean } = { max: 255, required: true }
): string | NextResponse {
  const cleaned = cleanString(value);
  if (options.required !== false && cleaned.length === 0) {
    return NextResponse.json({ error: `${label} is required` }, { status: 400 });
  }
  if (cleaned.length > 0 && options.min && cleaned.length < options.min) {
    return NextResponse.json({ error: `${label} must be at least ${options.min} characters` }, { status: 400 });
  }
  if (cleaned.length > options.max) {
    return NextResponse.json({ error: `${label} must not exceed ${options.max} characters` }, { status: 400 });
  }
  return cleaned;
}

export function validatePassword(value: unknown): string | NextResponse {
  if (typeof value !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` }, { status: 400 });
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return NextResponse.json({ error: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters` }, { status: 400 });
  }
  return value;
}

export function validateAmount(value: unknown, label = 'Amount'): number | NextResponse {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999999999) {
    return NextResponse.json({ error: `${label} must be a positive number below 1,000,000,000` }, { status: 400 });
  }
  return parsed;
}

export function validateDateString(value: unknown, label = 'Date'): string | NextResponse {
  const cleaned = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || Number.isNaN(Date.parse(`${cleaned}T00:00:00Z`))) {
    return NextResponse.json({ error: `${label} must use YYYY-MM-DD format` }, { status: 400 });
  }
  return cleaned;
}

export function validateMonthString(value: unknown, label = 'Month'): string | NextResponse {
  const cleaned = cleanString(value);
  if (!/^\d{4}-\d{2}$/.test(cleaned)) {
    return NextResponse.json({ error: `${label} must use YYYY-MM format` }, { status: 400 });
  }
  return cleaned;
}

export function firstClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') || req.headers.get('remote-addr') || 'unknown';
}
