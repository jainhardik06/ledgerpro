#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envLocalPath = path.join(rootDir, '.env.local');
const envDevPath = path.join(rootDir, '.env.development');
const envProdPath = path.join(rootDir, '.env.production');

const command = process.argv[2]?.toLowerCase() || 'status';
const targetEnv = process.argv[3]?.toLowerCase();

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const existingKeys = new Set();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      existingKeys.add(key);
      if (key in updates) {
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });

  // Append any keys that didn't exist
  for (const [key, value] of Object.entries(updates)) {
    if (!existingKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
}

function runSupabaseCli(args) {
  try {
    console.log(`\n> npx supabase ${args}`);
    execSync(`npx supabase ${args}`, { cwd: rootDir, stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`\n[Error] Supabase CLI execution failed:`, error.message);
    return false;
  }
}

function getActiveConfig() {
  const envLocal = parseEnv(envLocalPath);
  const envDev = parseEnv(envDevPath);
  const envProd = parseEnv(envProdPath);

  return {
    local: envLocal,
    dev: { ...envDev, ...envLocal },
    prod: { ...envProd, ...envLocal },
  };
}

function switchTo(mode) {
  const isDev = mode === 'dev' || mode === 'development';
  const isProd = mode === 'prod' || mode === 'production';

  if (!isDev && !isProd) {
    console.error(`[Error] Invalid environment "${mode}". Use "dev" or "prod".`);
    process.exit(1);
  }

  const envLabel = isDev ? 'DEVELOPMENT' : 'PRODUCTION';
  console.log(`\n========================================`);
  console.log(` Switching Supabase Environment -> ${envLabel}`);
  console.log(`========================================`);

  const configs = getActiveConfig();
  const sourceEnv = isDev ? parseEnv(envDevPath) : parseEnv(envProdPath);
  const localEnv = configs.local;

  // Resolve keys: look in .env.development / .env.production, or suffixed keys in .env.local
  const suffix = isDev ? '_DEV' : '_PROD';
  const projectRef =
    sourceEnv.SUPABASE_PROJECT_REF ||
    localEnv[`SUPABASE_PROJECT_REF${suffix}`] ||
    sourceEnv.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
    localEnv.SUPABASE_PROJECT_REF;

  const url =
    sourceEnv.SUPABASE_URL ||
    localEnv[`SUPABASE_URL${suffix}`] ||
    (projectRef ? `https://${projectRef}.supabase.co` : '');

  const key =
    sourceEnv.SUPABASE_SERVICE_ROLE_KEY ||
    localEnv[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] ||
    '';

  const bucket =
    sourceEnv.SUPABASE_STORAGE_BUCKET ||
    localEnv[`SUPABASE_STORAGE_BUCKET${suffix}`] ||
    'agency-assets';

  const updates = {
    SUPABASE_ENV_MODE: isDev ? 'development' : 'production',
    STORAGE_PROVIDER: 'supabase',
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    SUPABASE_STORAGE_BUCKET: bucket,
  };

  if (projectRef) {
    updates.SUPABASE_PROJECT_REF = projectRef;
  }

  updateEnvFile(envLocalPath, updates);

  console.log(`✔ Updated .env.local:`);
  console.log(`  - Mode:            ${updates.SUPABASE_ENV_MODE}`);
  console.log(`  - URL:             ${updates.SUPABASE_URL || '(not set yet)'}`);
  console.log(`  - Service Key:     ${updates.SUPABASE_SERVICE_ROLE_KEY ? '••••••••' + updates.SUPABASE_SERVICE_ROLE_KEY.slice(-6) : '(not set yet)'}`);
  console.log(`  - Storage Bucket:  ${updates.SUPABASE_STORAGE_BUCKET}`);
  console.log(`  - Project Ref:     ${projectRef || '(not set)'}`);

  // Link CLI if project ref is provided
  if (projectRef) {
    console.log(`\n🔗 Linking Supabase CLI to project "${projectRef}"...`);
    runSupabaseCli(`link --project-ref ${projectRef}`);
  } else {
    console.log(`\nℹ To link Supabase CLI automatically, configure SUPABASE_PROJECT_REF${suffix} in .env.local or .env.${mode}.`);
  }

  console.log(`\n✔ Switched active environment to ${envLabel} successfully!`);
}

function linkProject(target) {
  const configs = getActiveConfig();
  const isProd = target === 'prod' || target === 'production';
  const isDev = target === 'dev' || target === 'development';
  const suffix = isProd ? '_PROD' : isDev ? '_DEV' : '';

  const ref =
    (suffix ? configs.local[`SUPABASE_PROJECT_REF${suffix}`] : null) ||
    configs.local.SUPABASE_PROJECT_REF;

  if (!ref) {
    console.error(`\n[Error] No Supabase project ref found for ${target || 'current'}.`);
    console.log(`Please provide a project ref, e.g.:`);
    console.log(`  npx supabase link --project-ref <your-project-id>`);
    console.log(`Or set SUPABASE_PROJECT_REF${suffix || ''} in .env.local`);
    process.exit(1);
  }

  console.log(`\nLinking Supabase CLI to: ${ref}`);
  runSupabaseCli(`link --project-ref ${ref}`);
}

function pushMigrations(target) {
  if (target) {
    switchTo(target);
  }
  console.log(`\n🚀 Pushing migrations to linked Supabase database...`);
  runSupabaseCli(`db push`);
}

function printStatus() {
  const configs = getActiveConfig();
  const local = configs.local;

  console.log(`\n========================================`);
  console.log(` Current Supabase Environment Status`);
  console.log(`========================================`);
  console.log(` Active Mode:       ${local.SUPABASE_ENV_MODE || 'not set (defaults to dev)'}`);
  console.log(` Provider:          ${local.STORAGE_PROVIDER || 'supabase'}`);
  console.log(` Active URL:        ${local.SUPABASE_URL || '(empty)'}`);
  console.log(` Active ProjectRef: ${local.SUPABASE_PROJECT_REF || '(empty)'}`);
  console.log(` Active Bucket:     ${local.SUPABASE_STORAGE_BUCKET || 'agency-assets'}`);
  console.log(` Service Role Key:  ${local.SUPABASE_SERVICE_ROLE_KEY ? 'Present (valid length: ' + local.SUPABASE_SERVICE_ROLE_KEY.length + ' chars)' : '(empty)'}`);
  console.log(`----------------------------------------`);
  console.log(` Available Switching Commands:`);
  console.log(`   npm run env:dev          -> Switch .env.local & CLI to Development`);
  console.log(`   npm run env:prod         -> Switch .env.local & CLI to Production`);
  console.log(`   npm run supabase:migrate -> Push migrations to active linked database`);
  console.log(`   npm run supabase:status  -> Print this status`);
  console.log(`========================================\n`);
}

// Router
switch (command) {
  case 'dev':
  case 'development':
    switchTo('dev');
    break;
  case 'prod':
  case 'production':
    switchTo('prod');
    break;
  case 'link':
    linkProject(targetEnv);
    break;
  case 'push':
  case 'migrate':
    pushMigrations(targetEnv);
    break;
  case 'status':
  default:
    printStatus();
    break;
}
