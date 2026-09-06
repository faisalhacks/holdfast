// SWEEP-02 — the alias table, DERIVED from vendor co-occurrence.
//
// tables.ts ships an EMPTY alias table and says why: a shipped table would either name real
// companies or memorise our own vendors, and a headline number produced by a lookup is not a
// measurement. It also says where a real table comes from — "the vendor master the engine is
// legitimately given" — and leaves `aliasTableFromVendors` there to build one.
//
// This file finishes that sentence. `aliasTableFromVendors` closes only the case where the
// bank wrote the vendor's name the way the ledger did. What a bank actually writes is
//
//     LOMVARTI INSTRUMENTS INDUSTRIES PVT LTD   the ledger
//     LMVRT INSTRMNTS INDSTRS                   the same vendor, vowels gone
//     LOMVARTIINSTRUME                          the same vendor, spaces gone and truncated
//     KRTUHANA ELEC LLP                         the same vendor, two characters transposed
//
// and no exact table covers those. So the table is DERIVED: for a vendor spelling recovered
// from a narration, this module asks which vendor in the master it co-occurs with, under a
// declared correspondence relation, and pins the identity only when exactly one vendor
// answers. Every entry is therefore built from the ledger the engine is handed at runtime.
// NOTHING HERE IS KEYED ON A VENDOR NAME WRITTEN INTO SOURCE, and that is the point: the
// same file, run against a different ledger, produces a different table or none at all.
//
// ─── WHAT THE RELATION IS ────────────────────────────────────────────────────────────
//
// One residue token corresponds to one vendor token, or to a run of CONSECUTIVE vendor
// tokens fused together, when any of four things holds:
//
//   equal          the token survived intact
//   anagram        same characters, same length — a keying transposition, not a new name
//   skeleton       first character plus consonants agree — `tlrm` against `toolroom`
//   skeleton-prefix  one skeleton opens the other, and is at least half of it —
//                  `sndbrngnr` against `sndbrngnrngsltns`, i.e. a truncation
//
// The half-length bound on the prefix rule is what stops the relation degenerating. Without
// it `chain` corresponds to `chandreth infra projects industries` — three skeleton characters
// claiming twenty-two — and a narration naming one vendor resolves to another. That case is
// real; it was produced by an earlier version of this file, and the bound is the fix.
//
// ─── WHAT MAKES AN ENTRY, AND WHAT REFUSES ONE ───────────────────────────────────────
//
// Evidence is counted in SKELETON CHARACTERS, not in tokens, because a token is not a unit of
// evidence: `sons` and `quivandra` are one token each and are not equally distinctive. A
// candidate becomes an entry only when
//
//   * the vendor's HEAD token is covered — the descriptive tail (`enterprises`, `industries`,
//     `cold chain`) is shared by many vendors and identifies none of them,
//   * the evidence reaches `min_evidence` skeleton characters, and
//   * ONE vendor id scores strictly highest. A tie is refused, not broken. `nirvath` alone
//     stands for two different vendors in a real master and there is no honest way to pick.
//
// A value carrying a digit is refused outright. A vendor spelling does not contain a document
// number, and a whole bank line does; the guard is what keeps this table from rewriting a
// narration into a vendor name.
//
// ─── WHY THIS FILE HOLDS STATE, WHICH NOTHING ELSE IN THIS MODULE DOES ───────────────
//
// The corpus is the vendor master. `engine/run.ts` is frozen and hands the engine invoices
// and payments; it never hands anyone a vendor master, and no entry point under
// engine/normalise sees more than one record at a time. So the master is ACCUMULATED as the
// ledger is normalised: `normaliseInvoice` reports each invoice's own (canonical name,
// vendor id) pair — data that invoice already carries — and nothing else is ever recorded.
//
// The properties that make that safe are worth stating, because "no module-level mutable
// state" is written at the top of types.ts and this is the exception to it:
//
//   ACCUMULATE-ONLY   Nothing is removed or rewritten. A key claimed by two vendor ids is
//                     marked ambiguous and never resolves again — so the corpus's final
//                     content does not depend on the order it was filled in.
//   MONOTONE IN SAFETY  Resolution requires a UNIQUE strict winner. Adding vendors can only
//                     remove uniqueness. A larger corpus therefore yields fewer entries, never
//                     a different wrong one, which is why a second ledger in the same process
//                     cannot manufacture an identity for the first.
//   NO STALE MEMO     Derivations are memoised, and the whole memo is dropped the moment the
//                     corpus changes, so a value can never be answered from a smaller master
//                     than the one standing when it was asked.
//
// The one thing it does depend on is ORDER OF ARRIVAL: a payment residue resolved before the
// invoices are seen resolves against a smaller master. `engine/match/prepare.ts` normalises
// every invoice and then every payment, in that order, in a file no worker owns — so the
// master is complete before the first residue is offered to it. Where it is not, the failure
// is a MISSING alias and never a wrong one: an empty corpus resolves nothing at all.

import type { VendorId } from '@/lib/types';
import type { AliasEntry, AliasTable } from './types';
import type { AliasKeyFn } from './tables';

// ─────────────────────────────────────────────────────────────────────────────
// The relation, as data
// ─────────────────────────────────────────────────────────────────────────────

export interface CorrespondenceSpec {
  /** Shortest skeleton that may take part in a prefix correspondence. */
  readonly min_skeleton: number;
  /** Shorter skeleton over longer, below which a prefix proves nothing. */
  readonly min_prefix_ratio: number;
  /** Shortest token a transposition may be claimed for. */
  readonly min_anagram_length: number;
  /** Skeleton characters of the vendor name that must be accounted for. */
  readonly min_evidence: number;
  /** Longest run of consecutive vendor tokens one fused residue token may stand for. */
  readonly max_fused_run: number;
  /** Require the vendor's first token to be covered. The tail describes; the head names. */
  readonly require_head: boolean;
  /**
   * Fewest tokens a vendor name must have before its initials may stand for it. Two initials
   * are a coincidence waiting to happen — `TT`, `KE`, `OC` — and three are not.
   */
  readonly min_initialism_tokens: number;
}

export const DEFAULT_CORRESPONDENCE: CorrespondenceSpec = Object.freeze({
  min_skeleton: 3,
  min_prefix_ratio: 0.5,
  min_anagram_length: 5,
  min_evidence: 5,
  max_fused_run: 4,
  require_head: true,
  min_initialism_tokens: 3,
});

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * First character, then every consonant after it.
 *
 * The first character is kept whatever it is: a bank drops the vowels INSIDE a word and
 * essentially never drops the one it starts with, and a skeleton that threw the initial away
 * would merge `analytics` with `nalytics` and with nothing useful.
 */
export function skeletonOf(token: string): string {
  if (token.length === 0) return '';
  let out = token[0] as string;
  for (let i = 1; i < token.length; i += 1) {
    const ch = token[i] as string;
    if (!VOWELS.has(ch)) out += ch;
  }
  return out;
}

function sortedCharacters(token: string): string {
  return [...token].sort().join('');
}

/**
 * Skeleton characters of `vendorRun` that `residueToken` accounts for, or 0 for no
 * correspondence. The count — not a boolean — is what lets a distinctive head outweigh a
 * generic tail without either being special-cased.
 */
export function correspondence(
  vendorRun: string,
  residueToken: string,
  spec: CorrespondenceSpec,
): number {
  if (vendorRun === '' || residueToken === '') return 0;
  const sv = skeletonOf(vendorRun);
  const sr = skeletonOf(residueToken);
  if (vendorRun === residueToken) return sv.length;
  if (
    vendorRun.length === residueToken.length &&
    vendorRun.length >= spec.min_anagram_length &&
    sortedCharacters(vendorRun) === sortedCharacters(residueToken)
  ) {
    return sv.length;
  }
  if (sv.length < spec.min_skeleton || sr.length < spec.min_skeleton) return 0;
  if (sv === sr) return sv.length;
  const shorter = sv.length <= sr.length ? sv : sr;
  const longer = sv.length <= sr.length ? sr : sv;
  if (!longer.startsWith(shorter)) return 0;
  if (shorter.length / longer.length < spec.min_prefix_ratio) return 0;
  return shorter.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// The corpus
// ─────────────────────────────────────────────────────────────────────────────

interface TokenRun {
  readonly text: string;
  readonly from: number;
  readonly to: number;
}

interface VendorRecord {
  readonly key: string;
  readonly tokens: readonly string[];
  readonly runs: readonly TokenRun[];
  /** The initials of every token, or '' when the name is too short to be initialised. */
  readonly initialism: string;
  /** Null once a second vendor claims this exact key: ambiguous, and it stays ambiguous. */
  readonly vendor_id: VendorId | null;
}

/** Every contiguous run of vendor tokens, fused. Bounded so a long name stays cheap. */
function runsOf(tokens: readonly string[], maxRun: number): readonly TokenRun[] {
  const out: TokenRun[] = [];
  for (let a = 0; a < tokens.length; a += 1) {
    let text = '';
    for (let b = a; b < tokens.length && b - a < maxRun; b += 1) {
      text += tokens[b] as string;
      out.push({ text, from: a, to: b });
    }
  }
  return out;
}

function recordFor(key: string, vendorId: VendorId | null, spec: CorrespondenceSpec): VendorRecord {
  const tokens = key.split(' ').filter((t) => t.length > 0);
  const initialism =
    tokens.length >= spec.min_initialism_tokens
      ? tokens.map((t) => t[0] as string).join('')
      : '';
  return { key, tokens, runs: runsOf(tokens, spec.max_fused_run), initialism, vendor_id: vendorId };
}

interface Assessment {
  readonly evidence: number;
  readonly head_covered: boolean;
}

/**
 * How much of one vendor name the residue accounts for.
 *
 * Every (run, residue token) pair is scored, then taken greatest-evidence-first, each residue
 * token spent once and each vendor token covered once. The order among equal pairs is fixed
 * and total — fewer vendor tokens first, then position — so a residue token is attributed to
 * the smallest part of the name that explains it, and the answer does not depend on the order
 * the pairs were generated in.
 *
 * Greedy rather than optimal on purpose. A maximum-weight assignment would score marginally
 * higher on a handful of names and would be a matcher, which this module is not.
 */
function assess(
  record: VendorRecord,
  residueTokens: readonly string[],
  spec: CorrespondenceSpec,
): Assessment {
  interface Pair {
    readonly run: TokenRun;
    readonly residue: number;
    readonly evidence: number;
  }
  const pairs: Pair[] = [];
  for (const run of record.runs) {
    for (let j = 0; j < residueTokens.length; j += 1) {
      const evidence = correspondence(run.text, residueTokens[j] as string, spec);
      if (evidence > 0) pairs.push({ run, residue: j, evidence });
    }
  }
  pairs.sort(
    (a, b) =>
      b.evidence - a.evidence ||
      a.run.to - a.run.from - (b.run.to - b.run.from) ||
      a.run.from - b.run.from ||
      a.residue - b.residue,
  );

  const covered = new Array<boolean>(record.tokens.length).fill(false);
  const spent = new Array<boolean>(residueTokens.length).fill(false);
  let evidence = 0;

  for (const pair of pairs) {
    if (spent[pair.residue]) continue;
    let needed = false;
    for (let i = pair.run.from; i <= pair.run.to; i += 1) if (!covered[i]) needed = true;
    if (!needed) continue;
    spent[pair.residue] = true;
    for (let i = pair.run.from; i <= pair.run.to; i += 1) covered[i] = true;
    evidence += pair.evidence;
  }

  return { evidence, head_covered: covered[0] === true };
}

const HAS_DIGIT = /\p{N}/u;

/**
 * The single derivation. Pure: same corpus and same value, same answer.
 *
 * Returns the winning vendor record, or null when nothing qualifies or two vendors tie. The
 * tie is refused rather than broken — a coin flip here is a pinned identity nobody can defend.
 */
function derive(
  records: ReadonlyMap<string, VendorRecord>,
  value: string,
  spec: CorrespondenceSpec,
): VendorRecord | null {
  if (value === '' || HAS_DIGIT.test(value)) return null;
  const residueTokens = value.split(' ').filter((t) => t.length > 0);
  if (residueTokens.length === 0) return null;

  let best: VendorRecord | null = null;
  let bestEvidence = 0;
  let contested = false;

  for (const record of records.values()) {
    if (record.vendor_id === null) continue;
    const { evidence, head_covered } = assess(record, residueTokens, spec);
    if (evidence < spec.min_evidence) continue;
    if (spec.require_head && !head_covered) continue;
    if (evidence > bestEvidence) {
      best = record;
      bestEvidence = evidence;
      contested = false;
      continue;
    }
    if (evidence !== bestEvidence || best === null) continue;
    if (record.vendor_id !== best.vendor_id) {
      contested = true;
      continue;
    }
    // One vendor, two canonical spellings, equally well accounted for. The winner is the
    // lexicographically smaller key: a total order, so the answer does not depend on which
    // invoice happened to be normalised first.
    if (record.key < best.key) best = record;
  }

  if (best !== null) return contested ? null : best;
  return byInitialism(records, residueTokens);
}

/**
 * The fallback: a bank line that wrote the vendor's INITIALS.
 *
 *     UTR631322902 AP RUN AMSS PL BILL rct/2026/01
 *
 * `amss` shares no skeleton with `ashvarne marine services solutions` — every rule above
 * fails on it — and it is nevertheless the name, written the way a remittance advice writes
 * it beside `PL` for the company form.
 *
 * Deliberately a FALLBACK and not a scored rule. Initials are three or four characters
 * standing for thirty, which is the weakest evidence in this file, so it is consulted only
 * where nothing else spoke at all, and only where exactly ONE vendor in the master answers
 * to it. A vendor of fewer than `min_initialism_tokens` tokens has no initialism at all: two
 * letters collide with the rail vocabulary and with each other.
 */
function byInitialism(
  records: ReadonlyMap<string, VendorRecord>,
  residueTokens: readonly string[],
): VendorRecord | null {
  let found: VendorRecord | null = null;
  for (const record of records.values()) {
    if (record.vendor_id === null || record.initialism === '') continue;
    if (!residueTokens.includes(record.initialism)) continue;
    if (found !== null && found.vendor_id !== record.vendor_id) return null;
    if (found === null || record.key < found.key) found = record;
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// The table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An alias table over a vendor master that is filled in as the ledger is normalised.
 *
 * It IS a `ReadonlyMap<string, AliasEntry>` — `aliasMapStep` reads it through exactly that
 * interface and knows nothing about this class — but only the observed vendor keys are
 * enumerable. A derived entry has no key until something asks for it, which is what keeps the
 * table the size of the vendor master rather than the size of the bank feed.
 */
export class VendorCooccurrenceTable implements AliasTable {
  private readonly spec: CorrespondenceSpec;
  private readonly records = new Map<string, VendorRecord>();
  private readonly derived = new Map<string, AliasEntry | null>();

  constructor(spec: CorrespondenceSpec = DEFAULT_CORRESPONDENCE) {
    this.spec = spec;
  }

  /**
   * Record one (canonical vendor name, vendor id) pair from the ledger.
   *
   * `key` must come from `aliasKeyFor('vendor')`, which is the profile's own output with the
   * alias step switched off — so the table and the lookup agree by construction and not
   * because two people remembered the same rule.
   */
  observe(key: string, vendorId: VendorId): void {
    if (key === '') return;
    const existing = this.records.get(key);
    if (existing !== undefined) {
      if (existing.vendor_id === null || existing.vendor_id === vendorId) return;
      // Two vendors, one canonical spelling. Neither may be pinned from this key again.
      this.records.set(key, recordFor(key, null, this.spec));
      this.derived.clear();
      return;
    }
    this.records.set(key, recordFor(key, vendorId, this.spec));
    this.derived.clear();
  }

  /** How many vendor spellings the master has yielded. Derived entries are not counted. */
  get size(): number {
    return this.records.size;
  }

  get(key: string): AliasEntry | undefined {
    const exact = this.records.get(key);
    if (exact !== undefined) {
      if (exact.vendor_id === null) return undefined;
      return { canonical: exact.key, vendor_id: exact.vendor_id, feedback_rule_id: null };
    }
    const memo = this.derived.get(key);
    if (memo !== undefined) return memo ?? undefined;
    const won = derive(this.records, key, this.spec);
    const entry: AliasEntry | null =
      won === null || won.vendor_id === null
        ? null
        : { canonical: won.key, vendor_id: won.vendor_id, feedback_rule_id: null };
    this.derived.set(key, entry);
    return entry ?? undefined;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  *entries(): IterableIterator<[string, AliasEntry]> {
    for (const key of this.records.keys()) {
      const entry = this.get(key);
      if (entry !== undefined) yield [key, entry];
    }
  }

  *keys(): IterableIterator<string> {
    for (const [key] of this.entries()) yield key;
  }

  *values(): IterableIterator<AliasEntry> {
    for (const [, entry] of this.entries()) yield entry;
  }

  forEach(
    callback: (value: AliasEntry, key: string, map: ReadonlyMap<string, AliasEntry>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, entry] of this.entries()) callback.call(thisArg, entry, key, this);
  }

  [Symbol.iterator](): IterableIterator<[string, AliasEntry]> {
    return this.entries();
  }
}

/** True when this table accumulates a vendor master rather than holding a fixed one. */
export function isObservableAliasTable(table: AliasTable): table is VendorCooccurrenceTable {
  return table instanceof VendorCooccurrenceTable;
}

/**
 * The same derivation with the corpus handed over explicitly, for a caller that HAS the whole
 * vendor master and the whole set of narration spellings at once. Nothing in the engine's own
 * path takes this route — `engine/run.ts` never sees a vendor master — but the strategy is
 * not allowed to exist only as a side effect, so it is also available as a plain function
 * over plain data, and the entries it produces are identical.
 */
export function aliasTableFromCooccurrence(
  vendors: readonly { readonly id: VendorId; readonly name: string }[],
  spellings: readonly string[],
  key: AliasKeyFn,
  spec: CorrespondenceSpec = DEFAULT_CORRESPONDENCE,
): AliasTable {
  const table = new VendorCooccurrenceTable(spec);
  for (const vendor of vendors) table.observe(key(vendor.name), vendor.id);
  const out = new Map<string, AliasEntry>(table.entries());
  for (const raw of spellings) {
    const spelling = key(raw);
    if (spelling === '' || out.has(spelling)) continue;
    const entry = table.get(spelling);
    if (entry !== undefined) out.set(spelling, entry);
  }
  return out;
}
