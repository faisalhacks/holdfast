// W04a — token classification.
//
// Classification is normalisation's other half. Canonicalising a string only helps when the
// string is in the field it belongs to, and in a bank feed it frequently is not: a
// reference token lands in the vendor name, a vendor fragment lands in the reference, and
// the narration line carries all of it jumbled together with rail codes.
//
// Everything here is WITHIN ONE RECORD and WITHIN ONE SIDE. Nothing in this file compares
// an invoice to a payment, scores a pair, or nominates a candidate — that is
// `engine/match/**` and it is not this worker's glob. What this file produces is a claim
// about a single field: this token is not the shape this field holds.
//
// The contract has somewhere to put that finding: `ReferenceEvidence.displaced` and
// `displaced_from`. Filling those in is the matcher's call; supplying the evidence is this
// module's job.

import type {
  DisplacementFinding,
  NormaliseField,
  NormalisationTables,
  TokenClass,
} from './types';

export { TOKEN_CLASSES } from './types';
export type { TokenClass, DisplacementFinding } from './types';

export interface ClassifiedToken {
  readonly token: string;
  readonly klass: TokenClass;
  /** Position in the tokenised field. Lets a reviewer see where in the line it sat. */
  readonly index: number;
}

/**
 * GSTIN-style layout: two digits, five letters, four digits, one letter, one alphanumeric,
 * one letter, one alphanumeric. Shape only — no registration is embedded anywhere in this
 * project and none is checked against.
 */
export const IDENTIFIER_SHAPE = /^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][0-9A-Za-z][A-Za-z][0-9A-Za-z]$/;

export function looksLikeIdentifier(token: string): boolean {
  return IDENTIFIER_SHAPE.test(token);
}

const ALL_DIGITS = /^\p{N}+$/u;
const HAS_DIGIT = /\p{N}/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Order matters: noise first, so a rail code is never mistaken for a word; identifier next,
 * because its shape is specific enough to outrank the generic mixed case.
 */
export function classifyToken(token: string, tables: NormalisationTables): TokenClass {
  if (token === '') return 'noise';
  if (tables.noiseTokens.has(token)) return 'noise';
  if (looksLikeIdentifier(token)) return 'identifier';
  if (ALL_DIGITS.test(token)) return 'numeric';
  if (HAS_DIGIT.test(token) && HAS_LETTER.test(token)) return 'mixed_alphanumeric';
  return 'word';
}

export function classifyTokens(
  tokens: readonly string[],
  tables: NormalisationTables,
): readonly ClassifiedToken[] {
  return tokens.map((token, index) => ({ token, klass: classifyToken(token, tables), index }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Displacement
// ─────────────────────────────────────────────────────────────────────────────

/** Which field each token class belongs in, when it is found somewhere else. */
const HOME_FIELD: Readonly<Record<TokenClass, NormaliseField | null>> = {
  noise: null,
  identifier: 'identifier',
  numeric: 'reference',
  mixed_alphanumeric: 'reference',
  word: 'vendor',
};

/**
 * Tokens sitting in a field that does not hold their shape.
 *
 * A `narration` field holds everything by definition, so it is scanned for identifiers and
 * references — that is extraction, not displacement, and the caller distinguishes them.
 * A `vendor` field carrying a reference-shaped token, or a `reference` field carrying
 * words, is the displacement case proper.
 *
 * `numeric` tokens shorter than `minReferenceLength` are ignored: a two-digit number in a
 * vendor name is a branch number far more often than an invoice reference, and a
 * displacement finding a reviewer learns to dismiss is worse than none.
 */
export interface DisplacementOptions {
  /** Minimum length for a purely numeric token to count as reference-shaped. Default 3. */
  readonly minReferenceLength?: number;
}

export function findDisplacedTokens(
  field: NormaliseField,
  classified: readonly ClassifiedToken[],
  options: DisplacementOptions = {},
): readonly DisplacementFinding[] {
  const minReferenceLength = options.minReferenceLength ?? 3;
  const out: DisplacementFinding[] = [];
  for (const { token, klass, index } of classified) {
    const home = HOME_FIELD[klass];
    if (home === null || home === field) continue;
    if (klass === 'numeric' && token.length < minReferenceLength) continue;
    // A narration is a mixed field; a word in it is not out of place.
    if (field === 'narration' && home === 'vendor') continue;
    out.push({ token, klass, index, found_in: field, belongs_to: home });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction views
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionOptions {
  /** Minimum length for a purely numeric token to be offered as a reference. Default 3. */
  readonly minReferenceLength?: number;
  /**
   * Drop a numeric token that directly follows rail furniture which is not also a document
   * prefix — the number after `UTR` or `RRN`. Default false: a cheque number sits in the
   * same position and is a legitimate reference, so the safe default keeps both and lets
   * the matcher discard what does not score.
   */
  readonly dropRailAdjacentNumbers?: boolean;
}

const ALPHA_HEAD_OF = /^(\p{L}+)\p{N}/u;

/**
 * A bare period segment is not a document number.
 *
 * `RCT-2026-01-472` offers three numeric tokens and only one of them names a document. The
 * year names a PERIOD — it is true of every invoice raised that year — and offering it as a
 * reference candidate hands the matcher a token that agrees with a whole cohort at once.
 * That is not a near miss to be discounted later; it is evidence about the wrong question,
 * and the place to refuse it is here, where the token is being nominated.
 *
 * Judged against the same closed table the period strip uses, so the two rules cannot drift
 * apart and a search that swaps the table moves both.
 */
function isBarePeriod(token: string, tables: NormalisationTables): boolean {
  return tables.referenceYears.has(token.replace(/^0+(?=\d)/, ''));
}

/**
 * Does this alphabetic head INTRODUCE a document number?
 *
 * A head that is only rail boilerplate (`utr`, `rrn`) introduces a bank tracking number; a
 * masked account (`xxxx`) introduces an account. Either is a number the invoice will never
 * carry. A head that names a document (`inv`, `bill`) or a document series (`tx`, `si`)
 * introduces a reference. A head the noise table has never heard of is not evidence of
 * anything and is admitted, because the alternative is an allow-list that silently drops
 * every numbering convention nobody wrote down in advance.
 */
function headAdmits(head: string, tables: NormalisationTables): boolean {
  if (!tables.noiseTokens.has(head)) return true;
  return tables.referencePrefixes.has(head) || tables.referenceSeries.has(head);
}

/**
 * The tokens worth putting through the reference profile.
 *
 * Fused prefix forms (`inv0042`) are included — the reference profile is what splits them,
 * and excluding them here would mean the prefix step never sees the case it exists for.
 *
 * Fused RAIL forms (`utr123456789012`) are excluded. The distinction is the alphabetic
 * head: a head that is a document prefix (`inv`, `bill`, `ref`) introduces a reference; a
 * head that is only rail boilerplate introduces a bank tracking number, which is not the
 * invoice reference and will never be one. A masked account number (`xxxx6195`) is excluded
 * by exactly the same test, which is why `xxxx` sits in the noise table and not the prefix
 * table.
 *
 * Bare PERIOD segments are excluded too — see `isBarePeriod`.
 */
export function referenceCandidateTokens(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  options: ExtractionOptions = {},
): readonly string[] {
  const min = options.minReferenceLength ?? 3;
  const dropRailAdjacent = options.dropRailAdjacentNumbers ?? false;

  const admissible: boolean[] = [];

  for (let i = 0; i < classified.length; i += 1) {
    const entry = classified[i];
    admissible.push(false);
    if (entry === undefined) continue;
    const { token, klass } = entry;

    if (klass === 'numeric') {
      if (token.length < min) continue;
      if (isBarePeriod(token, tables)) continue;
      if (dropRailAdjacent) {
        const prev = classified[i - 1];
        if (
          prev !== undefined &&
          prev.klass === 'noise' &&
          !tables.referencePrefixes.has(prev.token)
        ) {
          continue;
        }
      }
      admissible[i] = true;
      continue;
    }

    if (klass !== 'mixed_alphanumeric') continue;
    const m = ALPHA_HEAD_OF.exec(token);
    const head = m === null ? undefined : m[1];
    if (head !== undefined && !headAdmits(head, tables)) continue;
    admissible[i] = true;
  }

  const runs = referenceRuns(classified, tables, admissible);
  const leading = leadingSegments(classified, runs);

  const out: string[] = [];
  for (let i = 0; i < classified.length; i += 1) {
    const entry = classified[i];
    if (entry === undefined || admissible[i] !== true) continue;
    if (leading.has(i)) continue;
    out.push(entry.token);
  }
  for (const run of runs) out.push(run.text);
  return out;
}

/**
 * The LEADING SEGMENTS of a multi-segment number, which are not the document number.
 *
 * `097/INV/006159` opens with a three-digit branch series. Offered on its own it becomes the
 * candidate `97`, and `97` is shared by every invoice this vendor numbered — `97/INV/06157`,
 * `/06159`, `/06161`, `/08140`. A token-set ratio scores that cohort at 1, so the weakest
 * segment of the number ends up speaking for the whole of it.
 *
 * The test is comparative and needs no table: a segment that OPENS a number and is shorter
 * than a segment that follows it in the same number is a series marker, not the serial. The
 * segment is still offered as part of the RUN, where it sits beside the serial and adds to
 * the evidence instead of standing in for it — which is the difference between `97 6159`
 * meeting `97/INV/06159` and `97` meeting all four.
 */
function leadingSegments(
  classified: readonly ClassifiedToken[],
  runs: readonly ReferenceRun[],
): ReadonlySet<number> {
  const out = new Set<number>();
  for (const run of runs) {
    let firstAt = -1;
    let longest = 0;
    for (let i = run.start; i < run.end; i += 1) {
      const entry = classified[i];
      if (entry === undefined) continue;
      if (entry.klass !== 'numeric' && entry.klass !== 'mixed_alphanumeric') continue;
      if (firstAt < 0) firstAt = i;
      if (entry.token.length > longest) longest = entry.token.length;
    }
    if (firstAt < 0) continue;
    const first = classified[firstAt];
    if (first === undefined || first.klass !== 'numeric') continue;
    if (first.token.length < longest) out.add(firstAt);
  }
  return out;
}

/**
 * A token that may sit INSIDE a reference run without being a document number on its own.
 *
 * Numerics always may — a segment below the length floor is exactly what a run exists to
 * rescue. A mixed token may only if its head introduces a document: an account number
 * (`xxxx7526`) or a rail number sitting next to a reference is adjacent to it by accident
 * and must not be swallowed into it. And a bare head (`rct`, `inv`, `ap`) holds the run
 * together, because `RCT-2026-01-472` breaks into `rct 2026 01 472` and starting after the
 * head would lose the fact that the number was introduced as one.
 */
function joinsRun(entry: ClassifiedToken, tables: NormalisationTables): boolean {
  if (entry.klass === 'numeric') return true;
  if (entry.klass === 'mixed_alphanumeric') {
    const m = ALPHA_HEAD_OF.exec(entry.token);
    const head = m === null ? undefined : m[1];
    return head === undefined || headAdmits(head, tables);
  }
  return (
    entry.klass === 'noise' &&
    (tables.referencePrefixes.has(entry.token) || tables.referenceSeries.has(entry.token))
  );
}

/** Beyond this a run of adjacent segments is a remittance list, not a document number. */
const MAX_RUN_SEGMENTS = 5;

/** A run and the span of `classified` it covers, so the caller can reason about members. */
interface ReferenceRun {
  readonly text: string;
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
}

/**
 * MULTI-SEGMENT REFERENCES, PUT BACK TOGETHER.
 *
 * This is the other half of convention drift, and the half a per-token view cannot reach.
 * `RCT/2026/01/472` is ONE document number written in four segments. `punctuation_strip`
 * turns those separators into token boundaries — it has to, because the same number also
 * arrives as `RCT 2026 01 472` and `rct-2026-01-472` — and what is left is four tokens of
 * which only `472` is individually admissible. Compared segment-wise, the strongest thing
 * the line can say about the invoice is a three-digit fragment.
 *
 * ADJACENCY IS THE EVIDENCE. The separators are gone, but the fact that the segments sat
 * next to each other with nothing but separators between them is not: it is exactly what a
 * maximal run of reference-shaped tokens is. Offering the run AS WELL AS its members costs
 * nothing — the scorer takes the best pairing and a run is strictly more specific than any
 * of its parts — and it lets the whole number meet the whole number, digits and all, rather
 * than a tail meeting a middle.
 *
 * THREE GUARDS, AND THEY ARE THE POINT.
 *
 *   * A run of one is not a run. It would only restate a candidate already offered.
 *   * A run must be ANCHORED: it must contain a token that would have been admitted on its
 *     own. This keeps `VALUE DT 22-04-26` out — three two-digit numbers in a row are a
 *     date, no member clears the length floor, and a six-digit "reference" assembled out of
 *     a date is a false-match generator. It also, deliberately, keeps a TRUNCATED number
 *     out: `BILL rct/2026/01` is the head of `RCT/2026/01/714` and equally the head of
 *     `RCT/2026/01/472` and `RCT/2026/01/910`, and a token-set ratio scores a head against
 *     the whole series at 1. Admitting it buys one row and mis-ranks the next; the loop
 *     that measures this was run, and it does exactly that.
 *   * A number has segments; a REMITTANCE LIST has entries. `BULK REM UTR479194715 22 INV
 *     SI4559,TX.02973,06495,RCT/2026/01/9,...` is one adjacency run twenty tokens long, and
 *     splicing twenty document numbers into one is not reassembly — it is a new number that
 *     no system ever issued. Past `MAX_RUN_SEGMENTS` the run is refused; the individual
 *     entries are still offered, which is the honest reading of a bulk line.
 *
 * The run is emitted as the raw segments joined by spaces and goes through the SAME
 * reference profile as everything else, so the period strip and the prefix strip see it the
 * way they see an invoice's own reference — which is the entire reason the two sides can
 * agree on `1 472` and on the digits behind it.
 */
function referenceRuns(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  admissible: readonly boolean[],
): readonly ReferenceRun[] {
  const runs: ReferenceRun[] = [];
  let start = 0;

  const flush = (end: number): void => {
    if (end - start < 2) return;
    if (end - start > MAX_RUN_SEGMENTS) return;
    let anchored = false;
    for (let i = start; i < end; i += 1) if (admissible[i] === true) anchored = true;
    if (!anchored) return;
    const parts: string[] = [];
    for (let i = start; i < end; i += 1) {
      const entry = classified[i];
      if (entry !== undefined) parts.push(entry.token);
    }
    runs.push({ text: parts.join(' '), start, end });
  };

  for (let i = 0; i <= classified.length; i += 1) {
    const entry = i < classified.length ? classified[i] : undefined;
    if (entry !== undefined && joinsRun(entry, tables)) continue;
    flush(i);
    start = i + 1;
  }
  return runs;
}

/** The identifier-shaped tokens, for the identifier profile. */
export function identifierCandidateTokens(
  classified: readonly ClassifiedToken[],
): readonly string[] {
  return classified.filter((c) => c.klass === 'identifier').map((c) => c.token);
}

/**
 * What is left of a narration once rail codes, references and identifiers are set aside:
 * the vendor name, in whatever truncated and case-mangled form the bank sent it.
 */
export function vendorResidueTokens(classified: readonly ClassifiedToken[]): readonly string[] {
  return classified.filter((c) => c.klass === 'word').map((c) => c.token);
}
