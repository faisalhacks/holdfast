// THE BOUNDARY TEST — one of exactly three tests in this repository.
//
// It backs one claim, made on camera: THE LLM PROPOSES, DETERMINISTIC CODE VERIFIES. No
// output of a model reaches a hold release or a cleared state, directly or transitively.
//
// A test that asserted a comment says so would be worthless. This one has to FAIL if
// somebody later wires a proposal into a release path, so it is built to catch the four
// shapes that would take:
//
//   1  IMPORT      llm/ starts importing a hold family, the engine entry point, an export
//                  path or a database client. Checked by walking the VALUE-import graph out
//                  of every file in llm/ and refusing anything outside engine/match,
//                  engine/normalise, lib/ and llm/ itself.
//   2  VOCABULARY  the release is written inline instead — a `released_by` assignment, a
//                  `cleared` flag, a hold policy consulted. Checked by scanning the source
//                  of everything reachable, comments stripped.
//   3  BEHAVIOUR   the gate is loosened so a nomination that does not stand is admitted
//                  anyway. Checked by running a real residual pass over a fixture ledger
//                  with a transport that names the WRONG payment, and requiring it to be
//                  discarded.
//   4  RECORD      a model actor is recorded doing something it may not do. Checked against
//                  the events the database itself permits, read out of the migration.
//
// Run it:  node_modules/.bin/tsx llm/boundary.test.ts
// No framework, no runner, no script in the frozen package.json. Exit 0 or exit 1.
//
// SCOPE NOTE. `lib/types.ts` is in the reachable graph and is exempt from the vocabulary
// scan, because it is the frozen contract and declaring the SHAPE of a release is not
// performing one. The exemption is not taken on trust: the test first proves that file
// contains no executable export at all.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MATCH_SPEC_V1, parsePolicy, prepareLedger } from '@/engine/match';
import type { MatchContext } from '@/engine/match';
import type {
  Invoice,
  InvoiceId,
  IsoDate,
  IsoTimestamp,
  Paise,
  Payment,
  PaymentId,
  RunId,
  VendorId,
} from '@/lib/types';

import { admitProposals } from './gate';
import { MODEL_JOURNAL_EVENTS } from './journal';
import { proposeResiduals } from './propose';
import type { ModelTransport } from './client';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (abs: string): string => relative(ROOT, abs).split(sep).join('/');

// ─────────────────────────────────────────────────────────────────────────────
// A runner, in twenty lines
// ─────────────────────────────────────────────────────────────────────────────

let failed = 0;
let ran = 0;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function check(name: string, body: () => void): void {
  ran += 1;
  try {
    body();
    console.log(`  pass  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Source reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Comments removed, code and string literals kept.
 *
 * A scanner rather than a pair of regexes, because the regex version was wrong in a way
 * that mattered: this file's own prose contains `llm/**`, which opens a block comment as
 * far as a regex is concerned, and stripping to the next `*` + `/` swallowed the imports it
 * was supposed to be reading. A check that silently reads half a file is worse than no
 * check, so the scanner tracks quotes and comment state properly.
 *
 * String literals are deliberately KEPT. A release written as a column name in a query is
 * still a release.
 */
function stripComments(source: string): string {
  const out: string[] = [];
  let quote: string | null = null;
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? '';
    const next = source[i + 1] ?? '';
    if (quote !== null) {
      out.push(ch);
      if (ch === '\\') {
        out.push(next);
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      out.push(' ');
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

/** Every `.ts` file directly under llm/, minus this test. */
function llmSourceFiles(): string[] {
  const dir = join(ROOT, 'llm');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

interface Edge {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

/**
 * Import edges out of one file.
 *
 * A statement beginning `import type` or `export type` is TYPE-ONLY: it is erased before
 * anything runs and cannot execute a line of the module it names. Everything else —
 * including `import { type X }`, deliberately — counts as a value edge, because being
 * conservative here makes the graph larger and the test stricter.
 */
function edgesOf(source: string): Edge[] {
  const code = stripComments(source);
  const edges: Edge[] = [];

  const named = /(?:^|[;{}\n])\s*(?:import|export)\s+([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(named)) {
    const clause = match[1] ?? '';
    const specifier = match[2];
    if (specifier === undefined) continue;
    edges.push({ specifier, typeOnly: /^\s*type\b/.test(clause) });
  }

  const bare = /(?:^|[;{}\n])\s*import\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(bare)) {
    const specifier = match[1];
    if (specifier !== undefined) edges.push({ specifier, typeOnly: false });
  }

  const dynamic = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of code.matchAll(dynamic)) {
    const specifier = match[1];
    if (specifier !== undefined) edges.push({ specifier, typeOnly: false });
  }

  return edges;
}

function resolveInternal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return `${base}.ts`; // unresolved; reported by the caller rather than skipped
}

interface Closure {
  readonly internal: Set<string>;
  readonly external: Set<string>;
  readonly unresolved: Set<string>;
}

/** Every module that can EXECUTE as a consequence of entering llm/. */
function valueClosure(): Closure {
  const internal = new Set<string>();
  const external = new Set<string>();
  const unresolved = new Set<string>();
  const queue = llmSourceFiles();
  for (const file of queue) internal.add(file);

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined) continue;
    if (!existsSync(file)) {
      unresolved.add(rel(file));
      continue;
    }
    for (const edge of edgesOf(readFileSync(file, 'utf8'))) {
      if (edge.typeOnly) continue;
      const target = resolveInternal(file, edge.specifier);
      if (target === null) {
        external.add(edge.specifier);
        continue;
      }
      if (!existsSync(target)) {
        unresolved.add(`${rel(file)} -> ${edge.specifier}`);
        continue;
      }
      if (internal.has(target)) continue;
      internal.add(target);
      queue.push(target);
    }
  }

  return { internal, external, unresolved };
}

const CLOSURE = valueClosure();

// ─────────────────────────────────────────────────────────────────────────────
// 1 — the import graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The only internal code llm/ may cause to run.
 *
 * `engine/match` is the verifier and must be reachable — that is the whole design. Every
 * path to a hold, a release, a decision, a tolerance change, an export or a database sits
 * outside this list, and so does the answer key the eval harness alone is allowed to read.
 */
const ALLOWED_INTERNAL = ['llm/', 'engine/match/', 'engine/normalise/', 'lib/'];

/**
 * Third-party code llm/ may cause to run. `pg` is absent on purpose: a database client in
 * this graph is a hand that can write `released_by` on a hold row, whatever the code around
 * it currently says.
 */
const ALLOWED_EXTERNAL = new Set([
  'zod',
  '@anthropic-ai/sdk',
  'fuzzball',
  'node:crypto',
  'node:fs',
  'node:path',
  'node:url',
]);

check('the value-import graph out of llm/ reaches the verifier and nothing that can release', () => {
  assert(CLOSURE.unresolved.size === 0, `unresolved import(s): ${[...CLOSURE.unresolved].join(', ')}`);

  // Anti-vacuity: a walker that returned nothing would pass every assertion below it.
  const paths = [...CLOSURE.internal].map(rel).sort();
  assert(paths.length >= 6, `the graph walk found only ${paths.length} module(s); it is not walking`);
  assert(
    paths.includes('engine/match/candidates.ts'),
    'engine/match/candidates.ts is not in the graph — reverify is not actually reachable, so this ' +
      'test would be proving nothing',
  );

  const strays = paths.filter((path) => !ALLOWED_INTERNAL.some((prefix) => path.startsWith(prefix)));
  assert(
    strays.length === 0,
    `llm/ can execute code outside the verifier: ${strays.join(', ')}. A hold family, the engine ` +
      'entry point, an export path or a database repository in this graph is a path from a ' +
      'generated answer to a hold release.',
  );

  const badExternals = [...CLOSURE.external].filter((name) => !ALLOWED_EXTERNAL.has(name));
  assert(
    badExternals.length === 0,
    `llm/ pulls in undeclared third-party module(s): ${badExternals.join(', ')}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 — the vocabulary, in everything reachable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokens that only appear in code that releases a hold, settles an invoice, or reads the
 * policy that decides either. Matched on word boundaries against source with comments
 * stripped, so a file may DISCUSS the prohibition and may not perform it.
 */
const RELEASE_VOCABULARY = [
  'released_by',
  'released_at',
  'release_reason',
  'ReleasedHold',
  'hold_released',
  'hold_applied',
  'auto_releasable',
  'auto_clear',
  'cleared',
  'decision_recorded',
  'tolerance_changed',
  'HOLD_POLICY',
  'HoldProposal',
  'HoldContext',
  'applyAll',
  'registeredFamilies',
  'runEngine',
];

check('nothing reachable from llm/ names a hold release, a clear, or a hold policy', () => {
  // The one exemption, and the proof that it is safe to take.
  const contract = join(ROOT, 'lib', 'types.ts');
  const contractSource = readFileSync(contract, 'utf8');
  assert(
    !/export\s+(?:async\s+)?function\b/.test(contractSource) && !/export\s+class\b/.test(contractSource),
    'lib/types.ts has grown an executable export, so exempting it from the vocabulary scan is no ' +
      'longer safe. Narrow the exemption or fail.',
  );

  const scanned = [...CLOSURE.internal].filter((file) => file !== contract).sort();
  assert(scanned.length >= 6, `only ${scanned.length} module(s) scanned; the closure is not populated`);

  const hits: string[] = [];
  for (const file of scanned) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const token of RELEASE_VOCABULARY) {
      const pattern = new RegExp(`\\b${token}\\b`);
      if (pattern.test(code)) hits.push(`${rel(file)}: ${token}`);
    }
  }

  assert(
    hits.length === 0,
    `release vocabulary in code reachable from llm/: ${hits.join('; ')}. Either this code can ` +
      'release a hold or settle an invoice, or the claim we make on camera is wrong.',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// A fixture ledger — two invoices, three statement lines
// ─────────────────────────────────────────────────────────────────────────────

const paise = (n: number): Paise => n as Paise;
const day = (s: string): IsoDate => s as IsoDate;
const stamp = (s: string): IsoTimestamp => s as IsoTimestamp;

function invoice(id: string, reference: string, vendor: string, gross: number, date: string): Invoice {
  return {
    id: id as InvoiceId,
    reference,
    normalised_reference: reference.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    vendor_id: `VEN-${vendor.slice(0, 4).toUpperCase()}` as VendorId,
    vendor_name_raw: vendor,
    invoice_date: day(date),
    received_date: day(date),
    due_date: null,
    period: date.slice(0, 7),
    gross_paise: paise(gross),
    net_paise: paise(gross),
    tax: {
      total_paise: paise(0),
      igst_paise: paise(0),
      cgst_paise: paise(0),
      sgst_paise: paise(0),
      cess_paise: paise(0),
    },
    currency: 'INR',
    is_credit_note: false,
    recurrence: null,
    purchase_order_reference: null,
    created_at: stamp(`${date}T00:00:00.000Z`),
  };
}

function payment(id: string, amount: number, narration: string, date: string): Payment {
  return {
    id: id as PaymentId,
    value_date: day(date),
    amount_paise: paise(amount),
    currency: 'INR',
    narration_raw: narration,
    narration_normalised: narration.toUpperCase(),
    reference_extracted: null,
    vendor_name_extracted: null,
    vendor_id: null,
    application_status: 'unapplied',
    bank_transaction_id: `BTX-${id}`,
    created_at: stamp(`${date}T00:00:00.000Z`),
  };
}

const INV_MATCHED = invoice('INV-1', 'INV/2024/0042', 'Northwind Components Private Limited', 125000, '2024-04-01');
const INV_STRAY = invoice('INV-2', 'INV/2024/0043', 'Sundar Metalworks LLP', 990000, '2024-04-02');

const PAY_RIGHT = payment('PAY-A', 125000, 'NEFT INV/2024/0042 NORTHWIND COMPONENTS PRIVATE LIMITED', '2024-04-05');
const PAY_OTHER = payment('PAY-B', 990000, 'RTGS INV/2024/0043 SUNDAR METALWORKS LLP', '2024-04-07');
const PAY_NOISE = payment('PAY-C', 4321, 'UPI MISC ZZ9 UNKNOWN PAYER', '2024-11-30');

const INVOICES = [INV_MATCHED, INV_STRAY];
const STATEMENT = [PAY_RIGHT, PAY_OTHER, PAY_NOISE];

const LEDGER = prepareLedger(INVOICES, STATEMENT);
const CTX: MatchContext = {
  run_id: 'run_boundary_test' as RunId,
  spec: MATCH_SPEC_V1,
  policy: parsePolicy({ amount_cap_paise: 50_000_000, date_window_days: 45, max_subset_size: 40 }),
  now: stamp('2024-05-01T00:00:00.000Z'),
};

/**
 * A transport that nominates confidently and wrongly for one row, and correctly for the
 * other. This stands in for the model so the pass can be exercised offline; what happens to
 * an answer AFTER it is parsed is the thing under test, and that code is identical either
 * way.
 */
const TRANSPORT: ModelTransport = async ({ user }) => {
  if (user.includes('INV-1')) return '{"payment_ids": ["PAY-C"], "cites": ["narration"]}';
  return 'Here you go: {"payment_ids": ["PAY-B"], "cites": ["reference", "amount"]}';
};

// ─────────────────────────────────────────────────────────────────────────────
// 3, 4, 5, 6 — the pass, end to end
// ─────────────────────────────────────────────────────────────────────────────

const batch = await proposeResiduals(INVOICES, STATEMENT, {
  transport: TRANSPORT,
  now: CTX.now,
});
const admission = admitProposals(batch.nominations, LEDGER, CTX);

check('a nomination that does not stand on its own merits is discarded by the gate', () => {
  assert(batch.ran, 'the residual pass did not run, so nothing downstream was exercised');
  assert(
    batch.nominations.length === 2,
    `expected 2 nominations from the transport, got ${batch.nominations.length}`,
  );

  const wrong = admission.discarded.find((d) => String(d.invoice_id) === 'INV-1');
  assert(
    wrong !== undefined,
    'the model nominated PAY-C for INV-1 and the gate did NOT discard it. A generated pairing ' +
      'that does not clear on its own merits survived re-verification.',
  );
  assert(
    wrong.reason === 'below_accept_min',
    `expected the wrong pairing to be discarded for scoring below accept_min, got "${wrong.reason}"`,
  );
  assert(
    wrong.observed_composite !== null && wrong.observed_composite < CTX.spec.ranking.accept_min,
    'the discard record does not show a score below the bar it was held to',
  );

  assert(
    admission.admitted.length === 1,
    `expected exactly the one sound nomination to survive, got ${admission.admitted.length}`,
  );
  const survivor = admission.admitted[0];
  assert(survivor !== undefined, 'no surviving candidate to inspect');
  assert(
    survivor.reverified === true,
    'an admitted candidate is not marked reverified — it did not come from the deterministic scorer',
  );
  assert(
    survivor.proposed_by === 'model_proposal',
    'the surviving candidate lost its provenance; a model proposal must stay labelled as one',
  );
  assert(
    survivor.score.composite >= CTX.spec.ranking.accept_min,
    'a candidate below accept_min was admitted',
  );
  assert(
    survivor.score.scorer_version === MATCH_SPEC_V1.id,
    `the surviving candidate was not scored by ${MATCH_SPEC_V1.id}`,
  );
});

check('nothing the boundary returns can express a release, a clear, or a hold', () => {
  assert(
    JSON.stringify([...admission.admitted].sort()) !== '[]',
    'nothing was admitted, so this check would be vacuous',
  );

  // `tolerance` on its own is legitimate — it is the bound the scorer judged a delta
  // against, and a reviewer needs to see it. `tolerance_change` is a decision and is not.
  const forbiddenKey = /^(released?_|release_reason|cleared|auto_clear|hold|decision|tolerance_change)/;
  const walk = (value: unknown, path: string, seen: Set<unknown>): void => {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, i) => { walk(item, `${path}[${i}]`, seen); });
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assert(
        !forbiddenKey.test(key),
        `${path}.${key} — the boundary is handing back a field that decides something. A ` +
          'nomination becomes an eligible candidate and nothing more.',
      );
      walk(child, `${path}.${key}`, seen);
    }
  };

  walk(admission.admitted, 'admitted', new Set());
  walk(batch.nominations, 'nominations', new Set());
  assert(
    Object.keys(admission).sort().join(',') === 'admitted,discarded,journal,notes',
    `the gate's result grew a surface: ${Object.keys(admission).join(', ')}`,
  );
});

check('a model actor is recorded only on the events the database itself permits', () => {
  const migration = readFileSync(join(ROOT, 'db', 'migrations', '011_audit_journal.sql'), 'utf8');
  const constraint = /audit_journal_model_actor_only_proposes[\s\S]*?event\s+IN\s*\(([\s\S]*?)\)/i.exec(
    migration,
  );
  assert(
    constraint !== null && constraint[1] !== undefined,
    'the schema constraint that restricts a model actor could not be found. This test is only ' +
      'worth running while that constraint exists.',
  );
  const permittedBySchema = new Set(
    [...constraint[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? ''),
  );
  assert(
    !permittedBySchema.has('hold_released'),
    'the database now lets a model actor be recorded on hold_released. The chain this code sits ' +
      'in has been broken upstream.',
  );
  for (const event of MODEL_JOURNAL_EVENTS) {
    assert(
      permittedBySchema.has(event),
      `llm/ can author "${event}" and the schema does not permit it for a model actor`,
    );
  }

  const entries = [...batch.journal, ...admission.journal];
  assert(entries.length > 0, 'no journal rows were produced, so this check would be vacuous');
  const permitted: readonly string[] = MODEL_JOURNAL_EVENTS;
  for (const entry of entries) {
    if (entry.actor.kind === 'model') {
      assert(
        permitted.includes(entry.event),
        `a model actor was recorded on "${entry.event}"`,
      );
      assert(
        permittedBySchema.has(entry.event),
        `a model actor was recorded on "${entry.event}", which the schema would refuse`,
      );
    }
    // Widened to `string` on purpose. TypeScript refuses the comparison outright — the
    // union llm/ can produce has no overlap with these three, which is the type-level half
    // of the same claim — and this is the runtime half, for a row that arrived as data.
    const event: string = entry.event;
    assert(
      !['hold_released', 'decision_recorded', 'tolerance_changed', 'hold_applied'].includes(event),
      `the boundary produced a "${event}" row. It decides nothing and releases nothing.`,
    );
  }
});

const savedKey = process.env['ANTHROPIC_API_KEY'];
const savedToken = process.env['ANTHROPIC_AUTH_TOKEN'];
delete process.env['ANTHROPIC_API_KEY'];
delete process.env['ANTHROPIC_AUTH_TOKEN'];
const degraded = await proposeResiduals(INVOICES, STATEMENT, { now: CTX.now });
if (savedKey !== undefined) process.env['ANTHROPIC_API_KEY'] = savedKey;
if (savedToken !== undefined) process.env['ANTHROPIC_AUTH_TOKEN'] = savedToken;

check('with no credentials the pass proposes nothing rather than something', () => {
  assert(!degraded.ran, 'the pass claims to have run without credentials');
  assert(
    degraded.nominations.length === 0,
    'a pairing was produced with no model to produce it. Nothing here may be invented.',
  );
  assert(
    degraded.unresolved.length === INVOICES.length,
    'rows were dropped instead of being left unresolved for a person',
  );
  assert(
    degraded.notes.some((note) => note.includes('ANTHROPIC_API_KEY')),
    'the degraded pass does not say why it did not run',
  );
  const nothing = admitProposals(degraded.nominations, LEDGER, CTX);
  assert(nothing.admitted.length === 0, 'the gate admitted something out of an empty pass');
});

console.log('');
if (failed > 0) {
  console.error(`llm/boundary: ${failed} of ${ran} FAILING.`);
  console.error('An LLM code path can reach a hold release, or the boundary no longer holds.');
  process.exit(1);
}
console.log(`llm/boundary: ${ran} checks pass. The LLM proposes; deterministic code verifies.`);
process.exit(0);
