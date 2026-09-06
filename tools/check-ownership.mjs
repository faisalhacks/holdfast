// Orchestrator-owned. CI gate: a PR may touch only the paths its branch owns.
//
// This replaces the human scope review. It also mechanically enforces quarantine
// trigger Q1 (a worker modifying a frozen file), so the contract holds even if GitHub
// branch protection and CODEOWNERS are never wired up.
//
// Worker branches are named `W01-contract-schema`, `W02-data-generator`, ... The branch
// name IS the ownership claim; there is nowhere else for a worker to declare scope.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { matchesAny } from './_glob.mjs';

// W01-, W02- ... and the AMENDMENT 01 splits: W04a-, W04b-, W05a-, W05b-, W05c-.
// A branch that does not match this is not a worker: the frontend collaborator and the
// orchestrator both fall through and skip the check.
const WORKER_BRANCH = /^W[0-9]{2}[a-c]?-/;

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const trySh = (cmd) => { try { return sh(cmd); } catch { return null; } };

function currentBranch() {
  // In a GitHub PR, GITHUB_REF_NAME is "123/merge" — GITHUB_HEAD_REF is the real branch.
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.HOLDFAST_BRANCH) return process.env.HOLDFAST_BRANCH;
  const ref = trySh('git rev-parse --abbrev-ref HEAD');
  return ref && ref !== 'HEAD' ? ref : null;
}

function touchedFiles(base) {
  for (const ref of [`origin/${base}`, base]) {
    const out = trySh(`git diff --name-only ${ref}...HEAD`);
    if (out !== null) return out ? out.split('\n').filter(Boolean) : [];
  }
  return null;
}

function main() {
  const cfg = JSON.parse(readFileSync(new URL('../.github/ownership.json', import.meta.url), 'utf8'));
  const branch = currentBranch();
  const base = process.env.GITHUB_BASE_REF || 'main';

  if (!branch) {
    console.log('ownership: no branch resolved (detached HEAD) — skipping');
    return 0;
  }

  if (!WORKER_BRANCH.test(branch)) {
    console.log(`ownership: "${branch}" is not a worker branch — orchestrator scope, skipping`);
    return 0;
  }

  // AMENDMENT 02 §2 races several agents on one brief, on branches suffixed -A/-B/-C/...
  // A racer is scored against the base worker's globs and the same frozen list. Without
  // this, no racer could ever go green and the race would be unwinnable by construction.
  // Only a single trailing uppercase letter is stripped, so `W04a-engine-normalise` and
  // every other declared name is untouched.
  const RACE_SUFFIX = /-[A-Z]$/;
  const baseWorker = RACE_SUFFIX.test(branch) ? branch.replace(RACE_SUFFIX, '') : branch;
  if (baseWorker !== branch && cfg.workers[baseWorker]) {
    console.log(`ownership: "${branch}" is a race entry — scoring against "${baseWorker}"`);
  }

  const owned = cfg.workers[baseWorker];
  if (!owned) {
    console.error(`ownership: FAIL — branch "${branch}" is not a declared worker.`);
    if (baseWorker !== branch) console.error(`  (race suffix stripped to "${baseWorker}", also undeclared)`);
    console.error('Declared workers:');
    for (const w of Object.keys(cfg.workers)) console.error(`  ${w}`);
    console.error('\nA worker branch must match its id exactly. Rename the branch; do not edit ownership.json.');
    return 1;
  }

  const files = touchedFiles(base);
  if (files === null) {
    console.error(`ownership: FAIL — cannot diff against "${base}". Fetch the base branch before this check.`);
    return 1;
  }
  if (files.length === 0) {
    console.log(`ownership: ${branch} touched no files — nothing to check`);
    return 0;
  }

  const exempt = (cfg.frozen_exceptions && cfg.frozen_exceptions[baseWorker]) || [];
  const frozenViolations = [];
  const scopeViolations = [];

  for (const f of files) {
    if (matchesAny(f, cfg.frozen) && !matchesAny(f, exempt)) { frozenViolations.push(f); continue; }
    if (!matchesAny(f, owned)) scopeViolations.push(f);
  }

  if (frozenViolations.length === 0 && scopeViolations.length === 0) {
    console.log(`ownership: ${branch} — ${files.length} file(s), all within ${baseWorker}'s declared scope`);
    return 0;
  }

  if (frozenViolations.length) {
    console.error(`\nownership: FAIL — QUARANTINE Q1. ${branch} modified frozen file(s):`);
    for (const f of frozenViolations) console.error(`  ${f}`);
    console.error('\nFrozen files are the contract. Do not work around this. Open an issue titled');
    console.error('`CONTRACT: <what and why>` and end the session.');
  }

  if (scopeViolations.length) {
    console.error(`\nownership: FAIL — ${branch} touched path(s) outside its scope:`);
    for (const f of scopeViolations) console.error(`  ${f}`);
    console.error(`\n${branch} owns only:`);
    for (const g of owned) console.error(`  ${g}`);
    console.error('\nA change outside scope fails even if it is correct. Another worker owns it.');
  }

  return 1;
}

process.exit(main());
