// Orchestrator-owned. CI gate: data/ must still hash to what data/MANIFEST says.
//
// Quarantine trigger Q7. This is the check that stops a worker from quietly regenerating
// the dataset into something its matcher happens to do well on.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashTree, parseManifest, MANIFEST_NAME } from './_hash.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DATA = join(ROOT, 'data');
const MANIFEST_PATH = join(DATA, MANIFEST_NAME);

if (!existsSync(DATA)) {
  console.log('manifest: data/ does not exist yet (pre-Wave-2) — skipping');
  process.exit(0);
}

if (!existsSync(MANIFEST_PATH)) {
  // data/ exists but is unfrozen. Legal only for W02's own PR, which lands the generator
  // output; the orchestrator runs `pnpm freeze` at the Wave 2 gate immediately after.
  const branch = process.env.GITHUB_HEAD_REF || process.env.HOLDFAST_BRANCH || '';
  if (branch.startsWith('W02-')) {
    console.log('manifest: data/ present but unfrozen on the generator branch — expected, skipping');
    process.exit(0);
  }
  console.error('manifest: FAIL — data/ exists but data/MANIFEST does not.');
  console.error('Run `pnpm freeze` at the Wave 2 gate. Nothing is tuned before that moment.');
  process.exit(1);
}

const declared = parseManifest(readFileSync(MANIFEST_PATH, 'utf8'));
const actual = hashTree(DATA);

if (declared.root === actual.root) {
  console.log(`manifest: ok — ${actual.files.length} file(s) at ${actual.root.slice(0, 12)} (frozen ${declared.frozenAt})`);
  process.exit(0);
}

const declaredByPath = new Map(declared.files.map((f) => [f.path, f.sha256]));
const actualByPath = new Map(actual.files.map((f) => [f.path, f.sha256]));

console.error('\nmanifest: FAIL — QUARANTINE Q7. data/ no longer matches data/MANIFEST.\n');
console.error(`  declared root: ${declared.root}`);
console.error(`  actual root:   ${actual.root}\n`);

for (const [path, sha] of actualByPath) {
  if (!declaredByPath.has(path)) console.error(`  ADDED     ${path}`);
  else if (declaredByPath.get(path) !== sha) console.error(`  MODIFIED  ${path}`);
}
for (const path of declaredByPath.keys()) {
  if (!actualByPath.has(path)) console.error(`  REMOVED   ${path}`);
}

console.error('\nThe dataset is frozen. Every number we publish cites this hash.');
console.error('Do not regenerate data/ to make a test pass.');
process.exit(1);
