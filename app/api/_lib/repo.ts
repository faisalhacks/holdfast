// Which repository answers.
//
//   HOLDFAST_REPO=memory   (default) seeded rows, no database required
//   HOLDFAST_REPO=pg       Postgres over DATABASE_URL
//
// The default stays `memory` until the schema lands, so the API is never blocked on
// `db/**` and neither is anyone building against it. `pg` is loaded dynamically, so the
// driver is not even imported in the default mode.

import type { Repository } from './repository';
import { memoryRepository } from './memory-repository';

export type RepoMode = 'memory' | 'pg';

export function configuredMode(): RepoMode {
  const raw = (process.env['HOLDFAST_REPO'] ?? 'memory').trim().toLowerCase();
  return raw === 'pg' || raw === 'postgres' ? 'pg' : 'memory';
}

export async function repository(): Promise<Repository> {
  if (configuredMode() === 'pg') {
    const mod = await import('./pg-repository');
    return mod.pgRepository();
  }
  return memoryRepository();
}

/**
 * The repository name every response carries in `meta.repository`, resolved without
 * touching the database — a caller can always tell which store answered.
 */
export function repositoryLabel(): string {
  return configuredMode() === 'pg' ? 'postgres' : 'memory';
}
