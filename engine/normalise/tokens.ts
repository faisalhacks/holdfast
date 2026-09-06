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
//
// ─── AND WHETHER A RECOVERY IS STRONG OR WEAK ────────────────────────────────────────
//
// "A reference was recovered" is not one fact, it is a range of them, and the flat token
// view collapses the range. `punctuation_strip` turns every delimiter into the same space,
// so by the time a line is classified, `RCT-2026-01-472` (ONE document number) and
// `SI4559,TX.02973,06495` (THREE) are the same shape: anonymous fragments in a row. Offer
// each fragment separately and a bare `2026` goes downstream as a reference — where, being
// a token-set subset of every reference minted that year, it scores a perfect similarity
// against all of them. Offer them glued and a comma-separated list of six invoices becomes
// one reference that matches nothing and half-matches everything.
//
// `segmentValue` keeps the delimiter that `punctuation_strip` discards, and
// `recoverReferences` uses it to assemble fragments back into the document numbers they
// came from — carrying, on every candidate, the STRUCTURE that says how strong it is: what
// was joined, what held it together, which prefix introduced it, and, for the fragments
// that were refused, why. Nothing here scores anything. It says what was found and how.

import type {
  DisplacementFinding,
  NormaliseField,
  NormalisationTables,
  ReferenceCandidate,
  ReferenceRecoveryKind,
  ReferenceRecoverySet,
  ReferenceRejection,
  ReferenceRejectionFinding,
  Segment,
  SegmentJoin,
  TokenClass,
} from './types';

export { REFERENCE_RECOVERY_KINDS, REFERENCE_REJECTIONS, SEGMENT_JOINS, TOKEN_CLASSES } from './types';
export type {
  DisplacementFinding,
  ReferenceCandidate,
  ReferenceRecoveryKind,
  ReferenceRecoverySet,
  ReferenceRejection,
  ReferenceRejectionFinding,
  Segment,
  SegmentJoin,
  TokenClass,
} from './types';

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
 * The tokens worth putting through the reference profile, ONE FRAGMENT AT A TIME.
 *
 * SUPERSEDED by `recoverReferences`, and kept exported because it is the thing that
 * function has to be measured against. Every fragment offered here is offered alone, which
 * is the defect: `RCT-2026-01-472` arrives as `2026` and `472`, and a bare `2026` is a
 * token-set SUBSET of every reference minted that year — it scores a perfect token
 * similarity against all of them. `fields.ts` reaches this behaviour through
 * `NormaliseConfig.assembleReferenceRuns: false`.
 *
 * Fused prefix forms (`inv0042`) are included — the reference profile is what splits them,
 * and excluding them here would mean the prefix step never sees the case it exists for.
 *
 * Fused RAIL forms (`utr123456789012`) are excluded. The distinction is the alphabetic
 * head: a head that is a document prefix (`inv`, `bill`, `ref`) introduces a reference; a
 * head that is only rail boilerplate introduces a bank tracking number, which is not the
 * invoice reference and will never be one.
 */
export function referenceCandidateTokens(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  options: ExtractionOptions = {},
): readonly string[] {
  const min = options.minReferenceLength ?? 3;
  const dropRailAdjacent = options.dropRailAdjacentNumbers ?? false;

  const out: string[] = [];
  for (let i = 0; i < classified.length; i += 1) {
    const entry = classified[i];
    if (entry === undefined) continue;
    const { token, klass } = entry;

    if (klass === 'numeric') {
      if (token.length < min) continue;
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
      out.push(token);
      continue;
    }

    if (klass !== 'mixed_alphanumeric') continue;
    const m = ALPHA_HEAD_OF.exec(token);
    const head = m === null ? undefined : m[1];
    if (
      head !== undefined &&
      tables.noiseTokens.has(head) &&
      !tables.referencePrefixes.has(head)
    ) {
      continue;
    }
    out.push(token);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmentation — the boundary information `punctuation_strip` throws away
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delimiters that hold ONE document number together. A slash, a dash, a dot, an
 * underscore, a backslash or a hash between two fragments says they are parts of the same
 * number: `RCT-2026-01-472`, `INV/2026/01640`, `1344/26-27`, `TX.02964`.
 */
const REFERENCE_DELIMITER_RUN = /^[/\-._\\#]+$/;
const SPLIT_KEEPING_SEPARATORS = /([^\p{L}\p{N}]+)/u;
const WHITESPACE_SPLIT = /\s+/;
/** `XXXX9484`, `xxxx3777` — a masked account number wearing a reference's shape. */
const MASKED_HEAD = /^x{2,}$/;
const TWO_DIGITS = /^[0-9]{2}$/;

/**
 * The fragments of a line, each carrying the boundary that introduced it.
 *
 * Input is the LIGHTLY FOLDED line — unicode and case only, punctuation still present —
 * because the punctuation is the evidence. Running the full scan profile first would erase
 * exactly the distinction this function exists to report, which is how a comma-separated
 * list of six invoice numbers ends up indistinguishable from one invoice number written
 * with five internal slashes.
 *
 * The token sequence returned is identical to `classifyTokens` over the same line; only
 * `join` is new.
 */
export function segmentValue(
  folded: string,
  tables: NormalisationTables,
): readonly Segment[] {
  const out: Segment[] = [];
  for (const chunk of folded.split(WHITESPACE_SPLIT)) {
    if (chunk.length === 0) continue;
    const pieces = chunk.split(SPLIT_KEEPING_SEPARATORS);
    // The first fragment of a chunk is separated from what came before it by whitespace,
    // whatever punctuation also sits there. A space is the weakest join there is and a
    // leading slash does not strengthen it.
    let join: SegmentJoin = out.length === 0 ? 'start' : 'space';
    let firstOfChunk = true;
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      if (piece === undefined || piece === '') continue;
      if (i % 2 === 1) {
        // A separator run INSIDE a chunk. It classifies the next fragment's join, but only
        // once the chunk has actually produced a fragment for it to join onto.
        if (!firstOfChunk) {
          join = REFERENCE_DELIMITER_RUN.test(piece) ? 'reference_delimiter' : 'list_delimiter';
        }
        continue;
      }
      out.push({
        token: piece,
        klass: classifyToken(piece, tables),
        index: out.length,
        join,
      });
      firstOfChunk = false;
      join = 'reference_delimiter';
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference recovery — assembling the fragments back into document numbers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A run may not grow past this many fragments. A bank line that names forty documents will
 * happily offer a fragment sequence longer than any real reference, and a run that long
 * scores 1.0 against every invoice whose tokens it happens to contain — which is a false
 * clear generator, not a recovery.
 */
const MAX_RUN_PARTS = 6;
/** Head fragments (`inv`, `no`, `tx`) taken before the first number. */
const MAX_HEAD_PARTS = 2;
/** Three or more two-digit groups in a row is a date, in every convention we receive. */
const DATE_GROUP_MIN = 3;

/** The alphabetic head of a fused token, or null when there is not one. */
function alphaHead(token: string): string | null {
  const m = ALPHA_HEAD_OF.exec(token);
  const head = m === null ? undefined : m[1];
  return head === undefined ? null : head;
}

/**
 * Why this fragment cannot be the body of a reference, or null when it can be.
 *
 * Order matters: the specific refusals come first so the reason a reviewer is shown is the
 * informative one. "It is a masked account number" is an answer; "it was too short" is not,
 * when both are true.
 */
function bodyRefusal(
  segment: Segment,
  tables: NormalisationTables,
  isDate: boolean,
): ReferenceRejection | null {
  if (segment.klass === 'identifier') return 'party_identifier';
  if (isDate) return 'date_fragment';
  if (segment.klass === 'numeric') return null;
  if (segment.klass !== 'mixed_alphanumeric') return 'below_minimum_length';
  const head = alphaHead(segment.token);
  if (head === null) return null;
  if (MASKED_HEAD.test(head)) return 'masked_account';
  if (tables.noiseTokens.has(head) && !tables.referencePrefixes.has(head)) {
    return 'rail_tracking_number';
  }
  return null;
}

/**
 * Can this fragment introduce a reference?
 *
 * A DOCUMENT PREFIX always can, however it is attached: `INV 2026 01141` and `INV/2026/…`
 * are the same claim and `inv` is what makes it.
 *
 * A short alphabetic series marker — `TX`, `SI`, `RCT` — can only when a DELIMITER binds it
 * to the number: `TX.02964`, `RCT-2026-01-472`. Across a bare space the same three letters
 * are just as likely to be the tail of the boilerplate that happens to sit before the
 * number — `REM ADV 8260/` is a remittance advice carrying document 8260, not document
 * "ADV 8260" — and inventing the wider token there turns an exact reference into a fuzzy
 * one. A space is the weakest join there is and it does not get to make this claim.
 */
function isRunHead(
  segment: Segment,
  tables: NormalisationTables,
  joinedByDelimiter: boolean,
): boolean {
  const t = segment.token;
  if (t === '') return false;
  if (tables.referencePrefixes.has(t)) return true;
  if (!joinedByDelimiter) return false;
  if (segment.klass !== 'word') return false;
  if (tables.noiseTokens.has(t)) return false;
  if (tables.legalSuffixes.has(t)) return false;
  return t.length <= 3;
}

/** Fragment indices that belong to a run of three or more adjacent two-digit numbers. */
function dateFragmentIndices(segments: readonly Segment[]): ReadonlySet<number> {
  const out = new Set<number>();
  let start = 0;
  while (start < segments.length) {
    let end = start;
    while (end < segments.length) {
      const s = segments[end];
      if (s === undefined) break;
      if (s.klass !== 'numeric' || !TWO_DIGITS.test(s.token)) break;
      if (end > start && s.join === 'list_delimiter') break;
      end += 1;
    }
    if (end - start >= DATE_GROUP_MIN) for (let i = start; i < end; i += 1) out.add(i);
    start = end > start ? end : start + 1;
  }
  return out;
}

function countDigits(value: string): number {
  let n = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') n += 1;
  return n;
}

function kindOf(
  headParts: readonly string[],
  bodyParts: readonly Segment[],
  prefix: string | null,
): ReferenceRecoveryKind {
  // Compound is about the NUMBER, not the furniture: `BILL 004856` is one number wearing a
  // prefix, `INV/2026/01640` is two parts wearing one.
  const compound = bodyParts.length > 1;
  if (prefix !== null) return compound ? 'prefixed_compound' : 'prefixed_single';
  if (bodyParts.length > 1) return 'compound';
  if (headParts.length > 0) return 'alpha_series';
  const only = bodyParts[0];
  if (only !== undefined && only.klass === 'mixed_alphanumeric') return 'alpha_series';
  return 'bare_digits';
}

export interface ReferenceRecoveryOptions {
  /** Minimum digits an assembled candidate must carry to be offered. Default 3. */
  readonly minReferenceLength?: number;
  /**
   * Assemble delimiter-joined fragments into one candidate. DEFAULT ON, and it is the
   * whole strategy: a fragment offered on its own is indistinguishable from a document
   * number, and `2026` pulled out of `RCT-2026-01-472` is a token-set SUBSET of every
   * invoice reference minted in 2026. Off, this degrades to the fragment behaviour.
   */
  readonly assembleRuns?: boolean;
  /** Cross a whitespace boundary while assembling. Default true. */
  readonly crossWhitespace?: boolean;
}

/**
 * The reference candidates a line offers, ASSEMBLED, with what was refused beside them.
 *
 * The assembly rule in one sentence: adjacent number-shaped fragments belong to the same
 * document number unless a LIST delimiter separates them, and a short alphabetic marker or
 * document prefix immediately before the first number belongs to it too.
 *
 * This is the substance of the confidence claim. A bare digit run scraped from free text
 * and an intact `INV/2026/01640` are both "a reference was recovered" under a flat token
 * scan, and they are not remotely the same evidence — the first is a fragment that agrees
 * with every reference sharing a year, the second is a document number that agrees with
 * exactly one. Assembling the run is what lets the two be told apart downstream, and the
 * `kind` on every candidate says which one a consumer is looking at.
 */
export function recoverReferences(
  segments: readonly Segment[],
  tables: NormalisationTables,
  options: ReferenceRecoveryOptions = {},
): ReferenceRecoverySet {
  const min = options.minReferenceLength ?? 3;
  const assemble = options.assembleRuns ?? true;
  const crossWhitespace = options.crossWhitespace ?? true;

  const dates = dateFragmentIndices(segments);
  const candidates: ReferenceCandidate[] = [];
  const rejected: ReferenceRejectionFinding[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < segments.length) {
    const segment = segments[i];
    if (segment === undefined) {
      i += 1;
      continue;
    }
    const refusal = bodyRefusal(segment, tables, dates.has(i));
    if (refusal !== null) {
      // Only report a refusal for something that looked like a reference in the first
      // place. A vendor's name is not a rejected reference and saying so is noise.
      if (segment.klass === 'numeric' || segment.klass === 'mixed_alphanumeric') {
        rejected.push({ token: segment.token, index: i, reason: refusal });
      }
      i += 1;
      continue;
    }

    // ── Body: this fragment and every adjacent one that belongs with it ──────────
    const body: Segment[] = [segment];
    let end = i + 1;
    if (assemble) {
      while (end < segments.length && body.length < MAX_RUN_PARTS) {
        const next = segments[end];
        if (next === undefined) break;
        if (next.join === 'list_delimiter') break;
        if (next.join === 'space' && !crossWhitespace) break;
        if (bodyRefusal(next, tables, dates.has(end)) === null) {
          body.push(next);
          end += 1;
          continue;
        }
        // A document prefix can sit INSIDE a number as well as in front of it:
        // `99-INV-01993` is one reference, not a two-digit fragment and a five-digit one.
        // Step over it — `reference_prefix_strip` removes it downstream — but only when a
        // real body part follows it under the same delimiter.
        if (!tables.referencePrefixes.has(next.token)) break;
        const after = segments[end + 1];
        if (after === undefined) break;
        if (after.join !== 'reference_delimiter') break;
        if (bodyRefusal(after, tables, dates.has(end + 1)) !== null) break;
        if (body.length + 2 > MAX_RUN_PARTS) break;
        body.push(next, after);
        end += 2;
      }
    }

    // ── Head: the prefix or series marker that introduced the number ─────────────
    const head: Segment[] = [];
    if (assemble) {
      let h = i - 1;
      while (h >= 0 && head.length < MAX_HEAD_PARTS && body.length + head.length < MAX_RUN_PARTS) {
        const prior = segments[h];
        if (prior === undefined) break;
        const boundary = segments[h + 1];
        if (boundary === undefined || boundary.join === 'list_delimiter') break;
        if (boundary.join === 'space' && !crossWhitespace) break;
        if (!isRunHead(prior, tables, boundary.join === 'reference_delimiter')) break;
        head.unshift(prior);
        h -= 1;
      }
    }

    const parts = [...head.map((s) => s.token), ...body.map((s) => s.token)];
    const token = parts.join(' ');
    const digitLength = countDigits(token);

    if (digitLength < min) {
      rejected.push({ token, index: i, reason: 'below_minimum_length' });
      i = end;
      continue;
    }

    const prefix =
      head.find((s) => tables.referencePrefixes.has(s.token))?.token ??
      body
        .map((s) => alphaHead(s.token))
        .find((h) => h !== null && tables.referencePrefixes.has(h)) ??
      null;

    const delimited =
      head.every((s, k) => k === 0 || s.join === 'reference_delimiter') &&
      body.every((s, k) => (k === 0 && head.length === 0) || s.join === 'reference_delimiter');

    if (!seen.has(token)) {
      seen.add(token);
      candidates.push({
        token,
        kind: kindOf(
          head.map((s) => s.token),
          body,
          prefix,
        ),
        parts,
        index: head[0]?.index ?? segment.index,
        span: parts.length,
        prefix,
        delimited,
        digit_length: digitLength,
      });
    }
    i = end;
  }

  return { candidates, rejected };
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
