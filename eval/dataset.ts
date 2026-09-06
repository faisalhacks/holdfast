// W03 — eval harness. Loading and hashing the two evaluated sets.
//
// TWO DATASETS, both reported, labelled, side by side:
//
//   selection — data/, the committed 200. Search and tuning optimise against this set and
//               are expected to. It is what the regression gate reads.
//   holdout   — lives OUTSIDE the repository and is never committed, because sparse
//               checkout controls the working tree and not the object store: anything in
//               git history is reachable with `git cat-file` by any agent that wants a
//               better number. THE REPORTED HEADLINE COMES FROM THE HOLDOUT.
//
// If the holdout is absent the report carries `holdout: null` and the run still exits 0.
// It is never substituted with selection figures. A missing holdout is a stated gap; a
// silently duplicated number is a lie with a decimal point on it.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { STRATA } from '../lib/types';
import type { EvalDatasetName, IsoTimestamp, Sha256, Stratum } from '../lib/types';
import {
  declaredMixSchema,
  parseInvoices,
  parsePayments,
  parseTruth,
  type EvalInvoice,
  type EvalPayment,
  type EvalTruthRow,
} from './schema';

const sha256Hex = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex');

const brand = <T>(value: string): T => value as unknown as T;

/** The zero instant. Used where a dataset is not frozen, so it cannot be read as a freeze. */
export const NOT_FROZEN: IsoTimestamp = brand<IsoTimestamp>('1970-01-01T00:00:00.000Z');

/** sha256 over the empty listing. A real, checkable digest for "there were no bytes". */
export const EMPTY_TREE_HASH: Sha256 = brand<Sha256>(sha256Hex(Buffer.from('', 'utf8')));

// ── tree hashing, byte-identical to tools/_hash.mjs ──────────────────────────
// Sorted paths, raw bytes (never decoded text, which would make line endings load-bearing
// on Windows), the MANIFEST itself excluded, and the listing hashed in turn. Reimplemented
// here rather than imported because tools/** is frozen and is plain .mjs; the format is
// fixed by the manifest on disk, so a drift between the two shows up immediately as a
// declared/recomputed mismatch, which this file reports rather than hides.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function hashTreeRoot(dir: string, exclude: (relPath: string) => boolean = () => false): string {
  if (!existsSync(dir)) return sha256Hex(Buffer.from('', 'utf8'));
  const files = walk(dir)
    .map((abs) => ({ abs, path: relative(dir, abs).split(sep).join('/') }))
    .filter((f) => f.path !== 'MANIFEST' && !exclude(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => ({ path: f.path, sha256: sha256Hex(readFileSync(f.abs)) }));
  return sha256Hex(Buffer.from(files.map((f) => `${f.sha256}  ${f.path}`).join('\n'), 'utf8'));
}

// ── data/MANIFEST ────────────────────────────────────────────────────────────

export interface ManifestFacts {
  readonly root: string | null;
  readonly frozenAt: string | null;
  readonly commit: string | null;
  readonly holdoutRoot: string | null;
  readonly holdoutSeed: string | null;
}

export function readManifest(dataDir: string): ManifestFacts | null {
  const path = join(dataDir, 'MANIFEST');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const pick = (re: RegExp): string | null => {
    const m = re.exec(text);
    return m && m[1] ? m[1].trim() : null;
  };
  return {
    root: pick(/^# root:\s*([0-9a-f]{64})$/m),
    frozenAt: pick(/^# frozen_at:\s*(.+)$/m),
    commit: pick(/^# commit:\s*(.+)$/m),
    holdoutRoot: pick(/^# holdout_root:\s*([0-9a-f]{64})$/m),
    holdoutSeed: pick(/^# holdout_seed:\s*(.+)$/m),
  };
}

// ── the bundle a system is evaluated against ─────────────────────────────────

export interface DatasetBundle {
  readonly name: EvalDatasetName;
  readonly present: boolean;
  readonly root: string | null;
  readonly invoices: readonly EvalInvoice[];
  readonly payments: readonly EvalPayment[];
  readonly truth: readonly EvalTruthRow[];
  readonly hash: Sha256;
  readonly frozenAt: IsoTimestamp;
  readonly declaredMix: Readonly<Record<Stratum, number>> | null;
  readonly notes: readonly string[];
}

/**
 * The mix the selection set was SPECIFIED to have, before it was generated: 200 invoices
 * as 120 clean, 20 duplicate, 15 tolerance, 15 cardinality, 15 missing/mismatched
 * reference, 15 period.
 *
 * It is held here rather than derived from the data on purpose. A declared count computed
 * from the rows themselves always equals the realised count, and a disclosure that cannot
 * disagree with the thing it describes discloses nothing. This one can disagree, and if it
 * does, the report says so. `<root>/stratification.json` overrides it when the generator
 * ships its own declaration.
 */
const SPEC_SELECTION_MIX: Readonly<Record<Stratum, number>> = {
  clean: 120,
  duplicate: 20,
  tolerance: 15,
  cardinality: 15,
  reference: 15,
  period: 15,
};

const FILE_CANDIDATES = {
  invoices: ['invoices.json'],
  payments: ['payments.json', 'bank_statement.json', 'statement.json'],
  truth: ['truth.json'],
} as const;

function findFile(root: string, candidates: readonly string[]): string | null {
  for (const name of candidates) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

function readJson(path: string): { value: unknown; error: string | null } {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), error: null };
  } catch (err) {
    return { value: null, error: `${path}: ${(err as Error).message}` };
  }
}

const emptyBundle = (name: EvalDatasetName, notes: readonly string[]): DatasetBundle => ({
  name,
  present: false,
  root: null,
  invoices: [],
  payments: [],
  truth: [],
  hash: EMPTY_TREE_HASH,
  frozenAt: NOT_FROZEN,
  declaredMix: null,
  notes,
});

/**
 * Where the holdout lives. `$HOLDFAST_HOLDOUT_DIR` wins; otherwise a sibling of the
 * repository. Never inside it — see the header.
 */
export function holdoutDir(repoRoot: string): string {
  const fromEnv = process.env['HOLDFAST_HOLDOUT_DIR'];
  if (fromEnv && fromEnv.trim() !== '') return resolve(fromEnv.trim());
  return resolve(repoRoot, '..', 'holdfast-holdout');
}

export function loadDataset(
  name: EvalDatasetName,
  root: string,
  manifest: ManifestFacts | null
): DatasetBundle {
  const notes: string[] = [];

  if (!existsSync(root)) {
    return emptyBundle(name, [
      `${name}: ${root} does not exist — nothing was measured for this set`,
    ]);
  }

  const invoicesPath = findFile(root, FILE_CANDIDATES.invoices);
  const paymentsPath = findFile(root, FILE_CANDIDATES.payments);
  const truthPath = findFile(root, FILE_CANDIDATES.truth);

  if (!invoicesPath || !paymentsPath || !truthPath) {
    const missing = [
      invoicesPath ? null : 'invoices.json',
      paymentsPath ? null : 'payments.json (or bank_statement.json)',
      truthPath ? null : 'truth.json',
    ].filter((x): x is string => x !== null);
    return emptyBundle(name, [`${name}: ${root} is missing ${missing.join(', ')}`]);
  }

  const invoicesRaw = readJson(invoicesPath);
  const paymentsRaw = readJson(paymentsPath);
  const truthRaw = readJson(truthPath);
  for (const r of [invoicesRaw, paymentsRaw, truthRaw]) if (r.error) notes.push(`${name}: ${r.error}`);

  const invoices = parseInvoices(invoicesRaw.value);
  const payments = parsePayments(paymentsRaw.value);
  const truthAll = parseTruth(truthRaw.value);
  for (const p of [...invoices.problems, ...payments.problems, ...truthAll.problems]) {
    notes.push(`${name}: ${p}`);
  }
  const rejected = invoices.rejected + payments.rejected + truthAll.rejected;
  if (rejected > 0) notes.push(`${name}: ${rejected} row(s) failed validation and were excluded`);

  // truth.json carries a `dataset` label per row. A file that mixes both sets is filtered
  // to this one; a file that labels nothing defaults to `selection` and is taken whole
  // when it is the selection set being loaded.
  const labelled = truthAll.rows.filter((r) => r.dataset === name);
  const truth = labelled.length > 0 ? labelled : truthAll.rows;
  if (labelled.length === 0 && truthAll.rows.length > 0 && name !== 'selection') {
    notes.push(`${name}: no truth row is labelled "${name}"; the whole file was taken as ${name}`);
  }

  // The hash cites the bytes every published number came from. The manifest's declared root
  // is preferred when it exists — that is the frozen value CI recomputes — and a
  // disagreement is recorded here as well as failing the manifest gate.
  const recomputed = hashTreeRoot(root);
  let hash = recomputed;
  let frozenAt = NOT_FROZEN;

  if (name === 'selection' && manifest) {
    if (manifest.root) {
      hash = manifest.root;
      if (manifest.root !== recomputed) {
        notes.push(
          `selection: data/MANIFEST declares ${manifest.root.slice(0, 12)} but data/ hashes to ` +
            `${recomputed.slice(0, 12)} — the dataset drifted from its freeze`
        );
      }
    }
    if (manifest.frozenAt) frozenAt = brand<IsoTimestamp>(manifest.frozenAt);
  }

  if (name === 'holdout') {
    if (manifest?.holdoutRoot) {
      if (manifest.holdoutRoot === recomputed) {
        notes.push(
          'holdout: matches the holdout_root frozen into data/MANIFEST before any sweep agent ' +
            'was spawned — this is the set that was fixed in advance, not one produced afterwards'
        );
        hash = manifest.holdoutRoot;
      } else {
        notes.push(
          `holdout: does NOT match holdout_root in data/MANIFEST (declared ` +
            `${manifest.holdoutRoot.slice(0, 12)}, found ${recomputed.slice(0, 12)}). The headline ` +
            `is reported from these bytes and they are not the frozen ones.`
        );
      }
    } else {
      notes.push('holdout: data/MANIFEST declares no holdout_root, so the set could not be checked against a freeze');
    }
    if (manifest?.frozenAt) frozenAt = brand<IsoTimestamp>(manifest.frozenAt);
  }

  // Declared versus realised mix. Without a declaration the two are equal by construction
  // and the disclosure means nothing, so the absence is stated rather than papered over.
  let declaredMix: Record<Stratum, number> | null = null;
  const mixPath = join(root, 'stratification.json');
  if (existsSync(mixPath)) {
    const mixRaw = readJson(mixPath);
    const parsed = declaredMixSchema.safeParse(mixRaw.value);
    if (parsed.success) {
      const filled = {} as Record<Stratum, number>;
      for (const s of STRATA) filled[s] = parsed.data[s] ?? 0;
      declaredMix = filled;
    } else {
      notes.push(`${name}: stratification.json is present but unreadable; declared mix falls back to realised`);
    }
  } else if (name === 'selection') {
    declaredMix = { ...SPEC_SELECTION_MIX };
    notes.push(
      'selection: no stratification.json, so declared_count comes from the mix the dataset was ' +
        'SPECIFIED to have (120/20/15/15/15/15 over 200). A declared count taken from the rows ' +
        'themselves could never disagree with them; this one can.'
    );
  } else {
    notes.push(`${name}: no stratification.json — declared_count mirrors realised_count and proves nothing`);
  }

  const invoiceIds = new Set(invoices.rows.map((i) => String(i.id)));
  const orphanTruth = truth.filter((t) => !invoiceIds.has(String(t.invoice_id))).length;
  if (orphanTruth > 0) notes.push(`${name}: ${orphanTruth} truth row(s) name an invoice that is not in the ledger`);
  const missingTruth = invoices.rows.length - truth.filter((t) => invoiceIds.has(String(t.invoice_id))).length;
  if (missingTruth > 0) notes.push(`${name}: ${missingTruth} invoice(s) have no truth row and cannot be scored`);

  return {
    name,
    present: invoices.rows.length > 0,
    root,
    invoices: invoices.rows,
    payments: payments.rows,
    truth,
    hash: brand<Sha256>(hash),
    frozenAt,
    declaredMix,
    notes,
  };
}
