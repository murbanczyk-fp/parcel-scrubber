import { config } from 'dotenv';

import { resolveEnvFilePaths } from '../src/config/env-files';

const shellE2eDatabaseUrl = process.env.E2E_DATABASE_URL;

for (const envFile of resolveEnvFilePaths()) {
  config({ path: envFile, override: true });
}

if (shellE2eDatabaseUrl !== undefined) {
  process.env.E2E_DATABASE_URL = shellE2eDatabaseUrl;
}
