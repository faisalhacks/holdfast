// Orchestrator-owned. `pnpm freeze` — the Wave 2 gate.
//
// Run ONCE, after the generator lands and before anything is tuned. Writes data/MANIFEST
// with a sha256 over data/. Everything downstream cites this hash: eval/report.json, the
// README, the demo. Freezing before tuning is what makes the headline number a
// measurement rather than a target.

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { hashTree, renderManifest, parseManifest, MANIFEST_NAME } from './_hash.mjs';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DATA = join(ROOT, 'data');
const MANIFEST_PATH = join(DATA, MANIFEST_NAME);

const force = process.argv.includes('--force');

// The holdout lives OUTSIDE the repository. Default is a sibling directory; override with
// --holdout <dir> or HOLDFAST_HOLDOUT_DIR. Its bytes are never committed — only its
// digests, into data/MANIFEST, before any sweep agent spawns.
const holdoutFlag = process.argv.indexOf('--holdout');
const HOLDOUT_DIR =
  (holdoutFlag !== -1 && process.argv[holdoutFlag + 1]) ||
  process.env.HOLDFAST_HOLDOUT_DIR ||
  join(ROOT, '..', 'holdfast-holdout');

// The spec IS committed, so a judge can regenerate the holdout byte-identically.
const HOLDOUT_SPEC = join(ROOT, 'data', 'holdout.spec.json');

function commitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execSync('git status --porcelain data', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return dirty ? `${sha} (data/ uncommitted at freeze time)` : sha;
  } catch {
    return 'no-git';
  }
}

const tree = hashTree(DATA);
if (!tree) {
  console.error('freeze: FAIL — data/ does not exist. The generator (W02) must land first.');
  process.exit(1);
}
if (tree.files.length === 0) {
  console.error('freeze: FAIL — data/ is empty. Nothing to freeze.');
  process.exit(1);
}

if (existsSync(MANIFEST_PATH) && !force) {
  const prev = parseManifest(readFileSync(MANIFEST_PATH, 'utf8'));
  if (prev.root === tree.root) {
    console.log(`freeze: already frozen at ${tree.root.slice(0, 12)} — ${tree.files.length} file(s), unchanged`);
    process.exit(0);
  }
  console.error('freeze: FAIL — data/ has changed since it was frozen.');
  console.error(`  manifest root: ${prev.root}`);
  console.error(`  actual root:   ${tree.root}`);
  console.error('\nRe-freezing after tuning has begun invalidates every number we publish.');
  console.error('If the dataset genuinely must change, that is an orchestrator decision:');
  console.error('re-run with --force, and re-run the full eval afterwards.');
  process.exit(1);
}

// ── the holdout, hashed but not held ────────────────────────────────────────────
let holdout = null;
const holdoutTree = hashTree(HOLDOUT_DIR);

if (holdoutTree && holdoutTree.files.length > 0) {
  if (!existsSync(HOLDOUT_SPEC)) {
    console.error('freeze: FAIL — holdout files exist but data/holdout.spec.json does not.');
    console.error('The spec is the committed half: seed, stratification and generator entrypoint.');
    console.error('Without it nobody can regenerate the holdout, and the hashes prove nothing.');
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(HOLDOUT_SPEC, 'utf8'));
  holdout = {
    seed: spec.seed,
    specPath: 'data/holdout.spec.json',
    root: holdoutTree.root,
    files: holdoutTree.files,
  };
} else {
  console.warn(`freeze: WARNING — no holdout found at ${HOLDOUT_DIR}`);
  console.warn('The headline number is reported from the holdout. Without one, the sweep');
  console.warn('selects and reports on the same data, which is the methodological sin we');
  console.warn('accuse the category of. Generate it before the sweep, or the number is');
  console.warn('contaminated and a competent critic will say so.');
}

writeFileSync(
  MANIFEST_PATH,
  renderManifest(tree, { frozenAt: new Date().toISOString(), commit: commitSha(), holdout }),
  'utf8'
);

console.log(`freeze: wrote data/MANIFEST — ${tree.files.length} file(s)`);
console.log(`freeze: root ${tree.root}`);
if (holdout) {
  console.log(`freeze: holdout ${holdout.files.length} file(s) at ${HOLDOUT_DIR}`);
  console.log(`freeze: holdout root ${holdout.root} (seed ${holdout.seed}, files NOT committed)`);
}
console.log('\nThis hash is now cited by eval/report.json and the submission. Do not regenerate data/.');
