import { existsSync } from 'fs';
import { join } from 'path';

/** Repo root whether running from `src/` or `dist/`. */
export const repoRoot = join(__dirname, '..', '..', '..', '..');

/** Later entries override earlier ones. Missing files are skipped. */
export function resolveEnvFilePaths(): string[] {
  const candidates = [
    join(repoRoot, '.env'),
    join(repoRoot, 'apps', 'api', '.env'),
    join(repoRoot, '.env.local'),
    join(repoRoot, 'apps', 'api', '.env.local'),
  ];

  return candidates.filter((path) => existsSync(path));
}
