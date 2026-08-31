import { loadEnvConfig } from '@next/env';
const projectDir = process.cwd();
loadEnvConfig(projectDir);
console.log('HASH:', process.env.SUPER_ADMIN_PASSWORD_HASH);
console.log('LENGTH:', process.env.SUPER_ADMIN_PASSWORD_HASH?.length);
