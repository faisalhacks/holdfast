// Orchestrator-owned. CI gate: eval/thresholds.json must still match eval/thresholds.lock.
//
// Quarantine trigger Q2. The incumbent ERP treats widening a tolerance as a legitimate way
// to make an exception disappear; a worker optimising for a green build will rediscover
// that move on its own. This is the check that makes rediscovering it useless.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './_hash.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(ROOT, 'eval', 'thresholds.json');
const LOCK = join(ROOT, 'eval', 'thresholds.lock');

if (!existsSync(SRC)) {
  console.log('thresholds: eval/thresholds.json does not exist yet (pre-Wave-2) — skipping');
  process.exit(0);
}

if (!existsSync(LOCK)) {
  // Both files are authored at Wave 0 and frozen. A missing lock means someone removed it.
  console.error('thresholds: FAIL — eval/thresholds.json exists but eval/thresholds.lock does not.');
  console.error('Both are written at Wave 0 and frozen. A missing lock means the lock was');
  console.error('removed, which is the first half of widening a floor. Restore it from git.');
  process.exit(1);
}

const declared = /^sha256:\s*([0-9a-f]{64})$/m.exec(readFileSync(LOCK, 'utf8'));
if (!declared) {
  console.error('thresholds: FAIL — eval/thresholds.lock is malformed (no sha256 line).');
  process.exit(1);
}

const actual = sha256(readFileSync(SRC));

if (declared[1] === actual) {
  console.log(`thresholds: ok — locked at ${actual.slice(0, 12)}`);
  process.exit(0);
}

console.error('\nthresholds: FAIL — QUARANTINE Q2. eval/thresholds.json was modified after locking.\n');
console.error(`  locked:  ${declared[1]}`);
console.error(`  actual:  ${actual}\n`);
console.error('A threshold is a promise about correctness, not a dial to turn when a test is red.');
console.error('If the floor is genuinely wrong, that is an orchestrator decision and it gets');
console.error('recorded — the same way we insist a tolerance change gets recorded.');
process.exit(1);
