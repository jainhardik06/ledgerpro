import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { connectDb, safeObjectId, initLocalDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    
    // 1. Authenticate user session
    const session = await getSessionUser();
    
    // We will collect result groups
    const results: any = {
      transactions: [],
      accounts: [],
      clients: [],
      budgets: [],
      tenants: [],
      users: [],
      help: []
    };

    // Safe regex for search query
    const cleanQuery = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(cleanQuery, 'i');

    const { db } = await connectDb();

    // 2. Search logic based on active role
    if (session) {
      const tenantId = session.tenantId;

      if (tenantId) {
        if (db) {
          // Search transactions
          const txs = await db.collection('transactions')
            .find({ tenantId, $or: [{ description: regex }, { category: regex }] })
            .limit(5)
            .toArray();
          results.transactions = txs.map(t => ({ id: t._id.toString(), description: t.description, amount: t.amount, category: t.category, date: t.date }));

          // Search accounts
          const accs = await db.collection('accounts')
            .find({ tenantId, name: regex })
            .limit(5)
            .toArray();
          results.accounts = accs.map(a => ({ id: a._id.toString(), name: a.name, type: a.type }));

          // Search clients
          const cls = await db.collection('clients')
            .find({ tenantId, name: regex })
            .limit(5)
            .toArray();
          results.clients = cls.map(c => ({ id: c._id.toString(), name: c.name, email: c.email }));

          // Search budgets
          const bdgs = await db.collection('budgets')
            .find({ tenantId, category: regex })
            .limit(5)
            .toArray();
          results.budgets = bdgs.map(b => ({ id: b._id.toString(), category: b.category, limitAmount: b.limitAmount }));
        } else {
          // Fallback to local JSON database query matching
          const localDb = initLocalDb();

          results.transactions = (localDb.transactions || [])
            .filter(t => t.tenantId === tenantId && (regex.test(t.description) || (t.category && regex.test(t.category))))
            .slice(0, 5)
            .map(t => ({ id: t.id, description: t.description, amount: t.amount, category: t.category, date: t.date }));

          results.accounts = (localDb.accounts || [])
            .filter(a => a.tenantId === tenantId && regex.test(a.name))
            .slice(0, 5)
            .map(a => ({ id: a.id, name: a.name, type: a.type }));

          results.clients = (localDb.clients || [])
            .filter(c => c.tenantId === tenantId && regex.test(c.name))
            .slice(0, 5)
            .map(c => ({ id: c.id, name: c.name, email: c.email }));

          results.budgets = (localDb.budgets || [])
            .filter(b => b.tenantId === tenantId && regex.test(b.category))
            .slice(0, 5)
            .map(b => ({ id: b.id, category: b.category, limitAmount: b.limitAmount }));
        }
      }

      // If Super Admin
      if (session.role === 'SUPER_ADMIN') {
        if (db) {
          // Search tenants
          const tnts = await db.collection('tenants')
            .find({ name: regex })
            .limit(5)
            .toArray();
          results.tenants = tnts.map(t => ({ id: t._id.toString(), name: t.name, status: t.status }));

          // Search all users
          const usrs = await db.collection('users')
            .find({ username: regex })
            .limit(5)
            .toArray();
          results.users = usrs.map(u => ({ id: u._id.toString(), username: u.username, role: u.role, tenantId: u.tenantId }));
        } else {
          // Fallback to local JSON database query matching for Super Admin
          const localDb = initLocalDb();

          results.tenants = (localDb.tenants || [])
            .filter(t => regex.test(t.name))
            .slice(0, 5)
            .map(t => ({ id: t.id, name: t.name, status: t.status }));

          results.users = (localDb.users || [])
            .filter(u => regex.test(u.username))
            .slice(0, 5)
            .map(u => ({ id: u.id, username: u.username, role: u.role, tenantId: u.tenantId }));
        }
      }
    }

    // Help & Documentation results (available to everyone)
    const helpArticles = [
      { title: 'Getting Started with Ledgers', path: '/support/getting-started', desc: 'Introduction to double-entry ledger inputs.' },
      { title: 'Designing Budgets & Limits', path: '/docs', desc: 'Control monthly limits per categories.' },
      { title: 'Multi-tenant Permissions & Settings', path: '/docs', desc: 'Invites and roles setup guide.' },
      { title: 'Audit Trail Logs', path: '/features/audit-logs', desc: 'Accessing immutable compliance entries.' },
      { title: 'Security Protocol Overview', path: '/security', desc: 'Data isolation and safety compliance.' },
      { title: 'System Status History', path: '/status', desc: 'Live latency and service telemetry.' }
    ];

    results.help = helpArticles.filter(art => 
      art.title.toLowerCase().includes(query.toLowerCase()) || 
      art.desc.toLowerCase().includes(query.toLowerCase())
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search API failure:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
