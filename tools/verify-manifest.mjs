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

/**
 * The holdout is never committed, so there is nothing here to compare against a checkout.
 * What CAN be compared is a REGENERATION: the claim is that anyone can reproduce the
 * holdout byte-identically from the committed generator and the seed frozen into this
 * manifest before any search agent existed. If a holdout is present — CI regenerates one,
 * and a developer may have one locally — check it against the frozen digests.
 *
 * A mismatch means the generator stopped being deterministic, and every holdout figure we
 * publish describes a dataset nobody else can rebuild.
 */
function verifyHoldout() {
  if (!declared.holdout) return true;
  const dir = process.env.HOLDFAST_HOLDOUT_DIR || join(ROOT, '..', 'holdfast-holdout');
  const tree = hashTree(dir);
  if (!tree || tree.files.length === 0) {
    console.log(`manifest: holdout absent at ${dir} — digests not re-verified this run`);
    return true;
  }
  if (tree.root === declared.holdout.root) {
    console.log(
      `manifest: holdout REPRODUCED — ${tree.files.length} file(s) at ${tree.root.slice(0, 12)}, ` +
      `regenerated from seed ${declared.holdout.seed} and byte-identical to the frozen digests`
    );
    return true;
  }
  console.error('\nmanifest: FAIL — the holdout did not reproduce from its frozen seed.\n');
  console.error(`  frozen root: ${declared.holdout.root}`);
  console.error(`  rebuilt root: ${tree.root}\n`);
  const byPath = new Map(declared.holdout.files.map((f) => [f.path, f.sha256]));
  for (const f of tree.files) {
    const want = byPath.get(f.path);
    if (want === undefined) console.error(`  UNEXPECTED  ${f.path}`);
    else if (want !== f.sha256) console.error(`  DIFFERS     ${f.path}`);
  }
  for (const p of byPath.keys()) if (!tree.files.some((f) => f.path === p)) console.error(`  MISSING     ${p}`);
  console.error('\nThe headline figures come from this set. If it cannot be rebuilt from the');
  console.error('committed generator and the frozen seed, nobody can check our number.');
  return false;
}

if (declared.root === actual.root) {
  console.log(`manifest: ok — ${actual.files.length} file(s) at ${actual.root.slice(0, 12)} (frozen ${declared.frozenAt})`);
  process.exit(verifyHoldout() ? 0 : 1);
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
