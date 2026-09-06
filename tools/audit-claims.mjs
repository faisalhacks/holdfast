// Orchestrator-owned. `pnpm audit:claims` — the check that makes a no-human-loop build honest.
//
// Extracts every numeric token from the submission prose and passes it in three cases only
// (AMENDMENT 01 §6):
//   MEASURED   — the number appears in eval/report.json (our harness produced it)
//   CITED      — the number appears in docs/citations.json with a named source
//   STRUCTURAL — versions, dates, worker ids, list numbering, fenced code, URLs
//
// Anything else fails the build, printing token, file and line. A number cannot reach the
// submission unless we measured it or can say where it came from. This is the difference
// between "we measured it" and "an agent wrote a confident sentence".
//
// Both eval/report.json and docs/citations.json are frozen paths. W11 owns docs/** but
// cannot edit its own citation list — the frozen check runs before the scope check.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const REPORT = join(ROOT, 'eval', 'report.json');
const CITATIONS = join(ROOT, 'docs', 'citations.json');

// Prose counts, wave and worker ids, list numbering. Small integers a writeup cannot avoid
// ("three resolution paths", "the four judging questions"). Deliberately excludes every
// decimal and every value above 12 — the shapes a metric actually takes.
const STRUCTURAL = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

// ── which prose we audit ────────────────────────────────────────────────────────
function submissionFiles() {
  const out = [];
  for (const f of ['README.md', 'DEVPOST.md']) {
    if (existsSync(join(ROOT, f))) out.push(f);
  }
  const docs = join(ROOT, 'docs');
  if (existsSync(docs)) {
    const walk = (d) => {
      for (const e of readdirSync(d).sort()) {
        const full = join(d, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.md$/.test(e)) out.push(relative(ROOT, full).split(sep).join('/'));
      }
    };
    walk(docs);
  }
  return out;
}

// ── strip the parts of a document that are not claims ───────────────────────────
// Fenced code blocks hold commands and versions. URLs and commit hashes hold digits that
// mean nothing. Inline code is NOT stripped — `70%` in backticks is still a claim.
function stripNonClaims(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[0-9a-f]{7,}\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T\S+)?/g, ' ')
    .replace(/\bW\d{2}\b/g, ' ')
    .replace(/\bICAIF\s*\d{4}\b/gi, ' ');
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

function extractNumbers(md) {
  const found = [];
  const text = stripNonClaims(md);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(NUMBER)) {
      const raw = m[0];
      const value = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(value)) continue;
      found.push({ raw, value, line: i + 1, context: line.trim().slice(0, 110) });
    }
  });
  return found;
}

// ── everything the harness produced, in every form it could reasonably be written ─
function harvest(node, into) {
  if (node === null || node === undefined) return;
  if (typeof node === 'number') {
    into.add(round(node));
    // A rate of 0.715 may legitimately be written as 71.5 or 72 or 71.
    if (node > 0 && node <= 1) {
      into.add(round(node * 100));
      into.add(round(Math.round(node * 1000) / 10));
      into.add(Math.round(node * 100));
      into.add(Math.floor(node * 100));
    }
    // Paise may legitimately be written as rupees.
    if (Number.isInteger(node) && Math.abs(node) >= 100) {
      into.add(round(node / 100));
      into.add(Math.round(node / 100));
      into.add(Math.round(node / 100000));
    }
    return;
  }
  if (typeof node === 'string') {
    for (const m of node.matchAll(NUMBER)) into.add(round(Number(m[0].replace(/,/g, ''))));
    return;
  }
  if (Array.isArray(node)) { for (const v of node) harvest(v, into); return; }
  if (typeof node === 'object') { for (const v of Object.values(node)) harvest(v, into); }
}

const round = (n) => Math.round(n * 1e6) / 1e6;

function main() {
  const files = submissionFiles();
  if (files.length === 0) {
    console.log('audit:claims: no README.md/DEVPOST.md/docs yet (pre-Wave-5) — skipping');
    return 0;
  }

  if (!existsSync(REPORT)) {
    console.error('audit:claims: FAIL — submission prose exists but eval/report.json does not.');
    console.error('Every number we publish comes from the harness. Run `pnpm eval` first.');
    return 1;
  }

  const allowed = new Set();
  harvest(JSON.parse(readFileSync(REPORT, 'utf8')), allowed);

  const cited = new Map();
  if (existsSync(CITATIONS)) {
    const doc = JSON.parse(readFileSync(CITATIONS, 'utf8'));
    for (const [k, entry] of Object.entries(doc.citations || {})) {
      const v = round(Number(k));
      if (Number.isFinite(v)) cited.set(v, entry.source || String(entry));
    }
  }

  const unsourced = [];
  const usedCitations = new Set();

  for (const file of files) {
    const md = readFileSync(join(ROOT, file), 'utf8');
    for (const n of extractNumbers(md)) {
      if (allowed.has(n.value)) continue;                       // MEASURED
      if (cited.has(n.value)) { usedCitations.add(n.value); continue; } // CITED
      if (STRUCTURAL.has(n.value)) continue;                    // STRUCTURAL
      unsourced.push({ file, ...n });
    }
  }

  if (unsourced.length === 0) {
    console.log(`audit:claims: clean — every number in ${files.length} file(s) is measured, cited or structural`);
    if (usedCitations.size) {
      console.log('\n  externally cited figures used:');
      for (const v of [...usedCitations].sort((a, b) => a - b)) {
        console.log(`    ${v}  — ${cited.get(v)}`);
      }
    }
    return 0;
  }

  console.error(`\naudit:claims: FAIL — ${unsourced.length} number(s) with no provenance\n`);
  for (const u of unsourced) {
    console.error(`  ${u.file}:${u.line}  "${u.raw}"`);
    console.error(`    ${u.context}`);
  }
  console.error('\nEvery number must be MEASURED (present in eval/report.json), CITED');
  console.error('(present in docs/citations.json with a source), or STRUCTURAL.');
  console.error('Do not type a metric by hand. If the figure is real, run the harness and');
  console.error('read it from the report. docs/citations.json is frozen — you cannot add to it.');
  return 1;
}

process.exit(main());
