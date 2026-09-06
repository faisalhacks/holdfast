// Orchestrator-owned. `pnpm migrate` — applies db/migrations/*.sql in order, from scratch.
//
// The migrations gate exists because two of our claims live in the schema rather than in
// application code: money is BIGINT paise, and the audit journal is append-only by GRANT.
// Neither survives a schema that does not actually apply.
//
// Migrations run in one transaction. A partial schema is worse than no schema.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIGRATIONS = join(ROOT, 'db', 'migrations');

if (!existsSync(MIGRATIONS)) {
  console.log('migrate: db/migrations/ does not exist yet (pre-Wave-1) — skipping');
  process.exit(0);
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) {
  console.log('migrate: no .sql files in db/migrations/ — skipping');
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('migrate: FAIL — DATABASE_URL is not set.');
  console.error('  local:  docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=holdfast --name holdfast-pg postgres:16');
  console.error('          DATABASE_URL=postgres://postgres:holdfast@localhost:5432/postgres pnpm migrate');
  console.error('  CI:     provided by the postgres service container');
  process.exit(1);
}

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
} catch (err) {
  console.error(`migrate: FAIL — cannot connect to DATABASE_URL: ${err.message}`);
  process.exit(1);
}

let applied = 0;
try {
  await client.query('BEGIN');
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    process.stdout.write(`  ${f} ... `);
    await client.query(sql);
    console.log('ok');
    applied++;
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.log('FAILED');
  console.error(`\nmigrate: FAIL in ${files[applied]} — ${err.message}`);
  if (err.position) console.error(`  at character position ${err.position}`);
  await client.end();
  process.exit(1);
}

// The append-only claim is a GRANT, not a convention. Verify it actually took effect
// rather than trusting that the migration said the words.
try {
  const { rows } = await client.query(`
    SELECT privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'audit_journal'
  `);
  if (rows.length > 0) {
    const privs = new Set(rows.map((r) => r.privilege_type));
    const forbidden = ['UPDATE', 'DELETE'].filter((p) => privs.has(p));
    if (forbidden.length) {
      console.error(`\nmigrate: FAIL — audit_journal still grants ${forbidden.join(', ')}.`);
      console.error('Append-only is enforced by GRANT, not by convention. REVOKE it in the migration.');
      await client.end();
      process.exit(1);
    }
    console.log('  audit_journal: UPDATE/DELETE revoked ✓');
  }
} catch {
  // Table not created yet (pre-W01 completion). The gate tightens once it exists.
}

await client.end();
console.log(`migrate: applied ${applied} migration(s) from scratch`);
