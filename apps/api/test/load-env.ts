import { config } from 'dotenv';

import { resolveEnvFilePaths } from '../src/config/env-files';

for (const envFile of resolveEnvFilePaths()) {
  config({ path: envFile, override: true });
}
