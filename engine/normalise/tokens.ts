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
  /**
   * Offer a run of adjacent segments as ONE candidate as well as individually. Default
   * true; see `segmentRuns` for why.
   */
  readonly joinDelimitedSegments?: boolean;
  /** Longest run of segments that may be joined. Default 6. */
  readonly maxJoinedSegments?: number;
  /** Longest alphabetic token that may lead a joined run as a series code. Default 4. */
  readonly maxSeriesCodeLength?: number;
  /**
   * Drop the individual pieces of a joined run. Default true: a piece of
   * `RCT-2026-01-472` is not a reference, and offering `2026` as one is what lets a bank
   * line agree perfectly, by token-set containment, with every invoice of that fiscal year.
   * A run never crosses a list separator, so this withdraws pieces of ONE reference and
   * never pieces of two.
   */
  readonly suppressBondedFragments?: boolean;
  /** The bond preceding each token, from `separatorBonds` on the same raw line. */
  readonly bonds?: readonly SeparatorBond[];
}

const ALPHA_HEAD_OF = /^(\p{L}+)\p{N}/u;
const ALL_LETTERS = /^\p{L}+$/u;

// ─────────────────────────────────────────────────────────────────────────────
// Bonds — which delimiters hold a reference together
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How two adjacent tokens were separated in the raw line. Three kinds, because a bank
 * narration uses three and `punctuation_strip` flattens all of them into one space:
 *
 *   `tight`  an intra-reference delimiter — `/`, `-`, `.`, `_`. The pieces are one
 *            reference: nobody writes `RCT-2026-01-472` meaning four things.
 *   `space`  whitespace. Ambiguous by itself. `RCT 2026 02 802` and `INV 2026 01141` are
 *            single references a sender chose to space rather than punctuate, and
 *            `PAYOUT RUN 7974 12-02-26` is a reference followed by a date.
 *   `break`  a LIST separator — comma, semicolon, pipe, ampersand. These end a reference
 *            outright. `TX.02973,06495` on a bulk remittance is two documents, and a rule
 *            that could not tell that separator from the `/` inside `2026/01/472` would
 *            fuse two invoices into one and settle neither.
 *
 * The distinction exists only here because this is the last point at which it exists at all:
 * turning every delimiter into a token boundary is right for finding the pieces of a
 * reference and wrong for knowing which pieces are one, so the structure is read off the raw
 * line before the pipeline flattens it.
 */
export type SeparatorBond = 'tight' | 'space' | 'break';

const ALNUM_RUN = /[\p{L}\p{N}]+/gu;
const BREAK_CHAR = /[,;|&]/u;
const SPACE_CHAR = /\s/u;

/**
 * The bond preceding each alphanumeric run of `raw`, in order. The first run's bond is
 * `break` — nothing precedes it to hold it to.
 *
 * The runs correspond one-for-one with the tokens the scan profile produces, because
 * `punctuation_strip` followed by `whitespace_collapse` is exactly "split on maximal
 * alphanumeric runs". A caller that finds otherwise must ignore the result rather than
 * align it by guess; `referenceCandidateTokens` does exactly that.
 */
export function separatorBonds(raw: string): readonly SeparatorBond[] {
  const bonds: SeparatorBond[] = [];
  let previousEnd = -1;
  for (const m of raw.matchAll(ALNUM_RUN)) {
    const start = m.index ?? 0;
    if (previousEnd < 0) {
      bonds.push('break');
    } else {
      const gap = raw.slice(previousEnd, start);
      bonds.push(BREAK_CHAR.test(gap) ? 'break' : SPACE_CHAR.test(gap) ? 'space' : 'tight');
    }
    previousEnd = start + m[0].length;
  }
  return bonds;
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
 * invoice reference and will never be one.
 *
 * On top of that individual pass, a DELIMITED reference is offered whole — see
 * `segmentRuns` — and where a tight delimiter proves the pieces were one reference, the
 * pieces themselves are withdrawn.
 */
export function referenceCandidateTokens(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  options: ExtractionOptions = {},
): readonly string[] {
  const min = options.minReferenceLength ?? 3;
  const dropRailAdjacent = options.dropRailAdjacentNumbers ?? false;
  const join = options.joinDelimitedSegments ?? true;
  const suppress = options.suppressBondedFragments ?? true;

  const runs = join ? segmentRuns(classified, tables, options) : [];
  const withdrawn = new Set<number>();
  if (suppress) {
    for (const run of runs) {
      if (run.members.length < 2) continue;
      for (const member of run.members) withdrawn.add(member.index);
    }
  }

  const out: string[] = [];
  const push = (token: string): void => {
    if (token === '') return;
    if (out.includes(token)) return;
    out.push(token);
  };

  for (let i = 0; i < classified.length; i += 1) {
    const entry = classified[i];
    if (entry === undefined) continue;
    if (withdrawn.has(entry.index)) continue;
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
      push(token);
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
    push(token);
  }

  for (const run of runs) push(run.joined);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runs — a delimited reference, put back together
// ─────────────────────────────────────────────────────────────────────────────

/** A delimited reference recovered whole, and how firmly its pieces were held together. */
export interface SegmentRun {
  /** The pieces, in order. Excludes the leading series code. */
  readonly members: readonly ClassifiedToken[];
  /** The series code that introduced it, when one did. */
  readonly code: string | null;
  /** The candidate string: the code, if any, then the pieces, space separated. */
  readonly joined: string;
  /** Every bond BETWEEN members was tight, so the pieces are provably one reference. */
  readonly tight: boolean;
}

/**
 * Whether the numeric pieces reachable from `from` — walking forward while they stay
 * numeric and no list separator intervenes — include one long enough to name a document.
 * A tail of nothing but calendar-sized pieces is a date, not the rest of a reference.
 */
function reachesDocumentLengthPiece(
  classified: readonly ClassifiedToken[],
  from: number,
  min: number,
  bonds: readonly SeparatorBond[] | null,
): boolean {
  for (let k = from; k < classified.length; k += 1) {
    const entry = classified[k];
    if (entry === undefined || entry.klass !== 'numeric') return false;
    if (k > from && bonds !== null && bonds[k] === 'break') return false;
    if (entry.token.length >= min) return true;
  }
  return false;
}

/**
 * A reference is one document number. `RCT/2026/01/472` is not three numbers and a code; it
 * is a single reference whose author happened to punctuate it. The scan turns every
 * delimiter into a token boundary — right for finding the pieces, wrong for knowing which
 * pieces are one reference — so a delimited reference reaches the matcher as the fragments
 * `2026` and `472`, and a bare `2026` then agrees PERFECTLY, by token-set containment, with
 * every invoice of that fiscal year. That is not weak evidence; it is evidence of the wrong
 * thing scored at 1.0, and it is where a delimiter difference does its real damage.
 *
 * The ledger side has the mirror problem and the same cause: an invoice reference is one
 * field, keeps its delimiters, canonicalises to `rct 2026 1 472`, and can meet a fragment
 * only through containment. Restoring the whole lets the two sides be compared as what they
 * are — and the whole carries the run's digits IN ORDER, which is exactly the evidence that
 * separates the reference from an invoice that merely also mentions 2026.
 *
 * WHAT A RUN IS. A maximal sequence of adjacent NUMERIC tokens, optionally crossing an
 * interior document prefix so the `N/A/N` spelling — `97/INV/06159`, `99/INV/01995` —
 * survives as one reference. Alphanumeric tokens never join a run: `XXXX7330` is the
 * account tail a bank prints after the reference, and swallowing it would corrupt the
 * digits of every line that carries one.
 *
 * Short numerics sit INSIDE runs and cannot form one alone: `2026`, `01`, `26` and `27` are
 * fiscal-period pieces when they sit in a reference and a date when they sit by themselves,
 * so a run must carry at least one piece long enough to be a document number. That single
 * condition is what keeps `VALUE DT 25-01-26` out.
 *
 * A run may take ONE leading alphabetic token as its SERIES CODE — the `RCT` of
 * `RCT/2026/01/472`, the `TX` of `TX 01030`. A series code is short, and it is neither rail
 * furniture (`utr`, `neft`) nor a company form (`ltd`, `llp`): a number standing after
 * either of those is not being introduced by it. A document prefix (`inv`, `invno`, `bill`)
 * is admitted at any length, because the reference profile strips it a moment later and
 * refusing it would turn on how long the sender happened to spell `invoice`. A wrongly
 * admitted code costs a token that agrees with nothing; it cannot invent an agreement,
 * because the run's digits are unchanged by what introduced them.
 *
 * A run NEVER crosses a list separator, and that is what makes it safe to withdraw its
 * pieces: everything a run contains was written as one reference, so no piece of it is a
 * reference on its own. `TX.02973,06495` on a bulk remittance is two runs and stays two.
 * `tight` records whether the pieces were punctuated together or merely spaced; it is
 * reported rather than acted on, because the list separator has already done the work that
 * matters.
 */
export function segmentRuns(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  options: ExtractionOptions = {},
): readonly SegmentRun[] {
  const min = options.minReferenceLength ?? 3;
  const maxRun = options.maxJoinedSegments ?? 6;
  const maxCode = options.maxSeriesCodeLength ?? 4;
  const declared = options.bonds;
  // Aligned one-for-one or not used at all. Realigning by guess would silently move the
  // suppression onto the wrong tokens, which is worse than never suppressing.
  const bonds = declared !== undefined && declared.length === classified.length ? declared : null;

  const isPiece = (entry: ClassifiedToken): boolean => entry.klass === 'numeric';
  const isInteriorPrefix = (entry: ClassifiedToken): boolean =>
    ALL_LETTERS.test(entry.token) && tables.referencePrefixes.has(entry.token);

  /** The one token that may introduce a run. Letters only, and not furniture. */
  const isSeriesCode = (entry: ClassifiedToken): boolean => {
    if (!ALL_LETTERS.test(entry.token)) return false;
    if (tables.referencePrefixes.has(entry.token)) return true;
    if (entry.token.length > maxCode) return false;
    if (tables.noiseTokens.has(entry.token)) return false;
    return !tables.legalSuffixes.has(entry.token);
  };

  const out: SegmentRun[] = [];
  let i = 0;
  while (i < classified.length) {
    const first = classified[i];
    if (first === undefined || !isPiece(first)) {
      i += 1;
      continue;
    }

    const members: ClassifiedToken[] = [first];
    let end = i;
    let tight = true;
    while (end + 1 < classified.length) {
      const next = classified[end + 1];
      if (next === undefined) break;
      let step = 0;
      if (isPiece(next)) step = 1;
      else if (isInteriorPrefix(next)) {
        const after = classified[end + 2];
        if (after === undefined || !isPiece(after)) break;
        step = 2;
      } else break;
      const tail = classified[end + step];
      if (tail === undefined) break;

      // A list separator ends the reference. Nothing after a comma is part of what came
      // before it, and reading across one would fuse two documents on a bulk remittance.
      let broken = false;
      let spaced = false;
      for (let k = end + 1; k <= end + step; k += 1) {
        const bond = bonds === null ? 'space' : bonds[k];
        if (bond === 'break') broken = true;
        if (bond === 'space') spaced = true;
        if (bond !== 'tight') tight = false;
      }
      if (broken) break;

      // A space is the weakest thing that can hold a reference together, and it is also
      // what separates a reference from what the bank printed after it. `RCT 2026 02 802`
      // is one document spaced instead of punctuated; `PAYOUT RUN 7974 12-02-26` is a
      // reference and then a value date. What tells them apart is what lies beyond the
      // space: a continuation carries at least one more piece long enough to name a
      // document, and a trailing date carries only calendar-sized pieces.
      if (spaced && !reachesDocumentLengthPiece(classified, end + step, min, bonds)) break;

      members.push(tail);
      end += step;
    }

    const start = i;
    i = end + 1;
    if (members.length > maxRun) continue;
    if (!members.some((t) => t.token.length >= min)) continue;

    // A code introduces the run it stands immediately before. Across a list separator it
    // introduces nothing — whatever preceded the comma belonged to the previous item.
    const leadBonded = bonds === null || bonds[start] !== 'break';
    const lead = start > 0 && leadBonded ? classified[start - 1] : undefined;
    const code = lead !== undefined && isSeriesCode(lead) ? lead.token : null;

    // A lone piece with no code is already on offer verbatim; joining it would produce the
    // same string and a duplicate trace for no new evidence.
    if (members.length < 2 && code === null) continue;

    const parts = members.map((t) => t.token);
    out.push({
      members,
      code,
      joined: code === null ? parts.join(' ') : [code, ...parts].join(' '),
      // Bonds we could not read are treated as loose: an unreadable line loses the
      // improvement rather than gaining a suppression nobody verified.
      tight: bonds !== null && tight,
    });
  }
  return out;
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
