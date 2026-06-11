const fs = require('fs');
const path = require('path');

// 1. Delete Dashboard API route
const dashboardPath = path.join('src', 'app', 'api', 'dashboard', 'route.ts');
if (fs.existsSync(dashboardPath)) {
  fs.unlinkSync(dashboardPath);
  console.log('Deleted dashboard route');
}

const dashboardDir = path.join('src', 'app', 'api', 'dashboard');
if (fs.existsSync(dashboardDir)) {
  fs.rmdirSync(dashboardDir);
  console.log('Deleted dashboard directory');
}

// 2. Fix tenant API route
const tenantPath = path.join('src', 'app', 'api', 'tenant', 'route.ts');
if (fs.existsSync(tenantPath)) {
  let code = fs.readFileSync(tenantPath, 'utf8');

  code = code.replace("import { connectDb, initLocalDb } from '@/lib/db';", "import { connectDb, initLocalDb, safeObjectId } from '@/lib/db';");
  code = code.replace("tenant = await db.collection('tenants').findOne({ _id: new (require('mongodb').ObjectId)(session.tenantId) });", "tenant = await db.collection('tenants').findOne({ _id: safeObjectId(session.tenantId) });");

  fs.writeFileSync(tenantPath, code);
  console.log('Fixed tenant route');
}
