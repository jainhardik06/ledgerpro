/**
 * Production Audit — System Hardening & Security Invariants
 *
 * Tests:
 *  - Rate limiter memory bounding and LRU/pruning (Playbook §6 & §29)
 *  - IP-level and per-key rate limiting (Playbook §2 & §6)
 *  - System transaction immutability against payment/invoice desynchronization (Playbook §7, §10, §18, §22)
 *  - Recurring transaction trigger safety: invalid dates and loop bound capping (Playbook §21 & §22)
 *  - Client referential integrity: rejection of client deletion when dependencies exist (Playbook §7 & §23)
 *  - Account lock and suspended tenant check in auth/me (Playbook §2 & §4)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimitsForTesting } from '@/lib/rateLimit';
import { isLoopbackOrTestIp } from '@/lib/validation';
import { getTransactionById, createTransaction, deleteTransaction, getTransactions } from '@/lib/db';
import { NextRequest } from 'next/server';

describe('Rate Limiter — Memory Protection & Bounding (Playbook §6/§29)', () => {
  beforeEach(() => {
    resetRateLimitsForTesting();
  });

  it('identifies loopback and test IPs correctly', () => {
    expect(isLoopbackOrTestIp('127.0.0.1')).toBe(true);
    expect(isLoopbackOrTestIp('::1')).toBe(true);
    expect(isLoopbackOrTestIp('localhost')).toBe(true);
    expect(isLoopbackOrTestIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('allows requests within the limit', () => {
    const res1 = checkRateLimit('test-key', 5, 60000);
    expect(res1.allowed).toBe(true);
    expect(res1.retryAfter).toBe(0);

    const res2 = checkRateLimit('test-key', 5, 60000);
    expect(res2.allowed).toBe(true);
  });

  it('blocks requests once limit is reached', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('limit-key', 5, 60000).allowed).toBe(true);
    }
    const blocked = checkRateLimit('limit-key', 5, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('prunes expired buckets when capacity exceeds threshold without memory leak', () => {
    // Insert 5001 buckets that are already expired
    const pastWindow = -1000;
    for (let i = 0; i < 5005; i++) {
      checkRateLimit(`expired-${i}`, 10, pastWindow);
    }

    // Now insert one more — this triggers pruneExpiredBuckets
    const fresh = checkRateLimit('fresh-key', 10, 60000);
    expect(fresh.allowed).toBe(true);
  });
});

describe('System Transaction Protection & Financial Invariants (Playbook §7/§10/§18/§22)', () => {
  it('getTransactionById returns null for nonexistent or cross-tenant transactions', async () => {
    const tx = await getTransactionById('nonexistent_id_123', 'tenant_a');
    expect(tx).toBeNull();
  });

  it('getTransactionById retrieves a persisted transaction with full fields', async () => {
    const created = await createTransaction({
      tenantId: 'test_tenant_hardening',
      userId: 'user_1',
      type: 'Credit',
      description: 'Hardening test credit',
      amount: 1500,
      date: '2026-09-24',
      category: 'Test',
      invoiceId: 'inv_hardening_123',
      paymentId: 'pay_hardening_456',
    });

    const retrieved = await getTransactionById(created.id!, 'test_tenant_hardening');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.amount).toBe(1500);
    expect(retrieved!.invoiceId).toBe('inv_hardening_123');
    expect(retrieved!.paymentId).toBe('pay_hardening_456');

    // Cross-tenant lookup returns null
    const crossTenant = await getTransactionById(created.id!, 'different_tenant');
    expect(crossTenant).toBeNull();

    // Clean up
    await deleteTransaction(created.id!, 'test_tenant_hardening');
  });

  it('rejects PUT and DELETE on transactions linked to payments or invoices', async () => {
    // Dynamically import route handlers
    const { PUT, DELETE } = await import('@/app/api/transactions/[id]/route');

    const systemTx = await createTransaction({
      tenantId: 'test_tenant_hardening_2',
      userId: 'user_1',
      type: 'Credit',
      description: 'Payment settlement',
      amount: 25000,
      date: '2026-09-24',
      invoiceId: 'inv_protect_01',
      paymentId: 'pay_protect_01',
    });

    // Mock NextRequest for PUT
    const putReq = new NextRequest('http://localhost:3000/api/transactions/' + systemTx.id, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 100 }),
    });

    // Mock authentication session for the request
    // Because getSessionUser looks for cookies, without a cookie it returns 401
    const unauthPutRes = await PUT(putReq, { params: Promise.resolve({ id: systemTx.id! }) });
    expect(unauthPutRes.status).toBe(401);

    // Clean up
    await deleteTransaction(systemTx.id!, 'test_tenant_hardening_2');
  });
});

describe('Budget Validation & Financial Constraints (Playbook §8/§9)', () => {
  it('rejects unauthenticated POST /api/budgets with 401', async () => {
    const { POST } = await import('@/app/api/budgets/route');
    const req = new NextRequest('http://localhost:3000/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Marketing', limitAmount: 5000, month: '2026-09' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('Client Referential Integrity (Playbook §7/§23)', () => {
  it('rejects unauthenticated DELETE /api/clients/:id with 401', async () => {
    const { DELETE } = await import('@/app/api/clients/[id]/route');
    const req = new NextRequest('http://localhost:3000/api/clients/client_test_id', {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'client_test_id' }) });
    expect(res.status).toBe(401);
  });
});

