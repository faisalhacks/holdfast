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
import {
  IDENTIFIER_LENGTH,
  isIdentifierPrefix,
  isIdentifierValue,
  isRepairableIdentifierValue,
} from './steps';

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

// ─────────────────────────────────────────────────────────────────────────────
// Identifier variant folding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A registration arrives as ONE VALUE and a delimiter is not a token boundary inside it.
 *
 *     GSTIN 99 ZZLOM 8277Y 6ZW        GSTIN 97-ZZHAS2704N-1ZP        GSTIN 99-ZZSUN6912V-9
 *
 * `punctuation_strip` has to make a token boundary out of every delimiter it meets — that
 * is the rule that saves `A/B` against `A-B` and it is not negotiable. The cost lands here:
 * a registration written with spaces or hyphens reaches classification as three or four
 * pieces, none of which is identifier-shaped. `8277y` and `6zw` are then offered to the
 * matcher as candidate document numbers, `zzlom` lands in the vendor residue and dilutes
 * the name, and a line whose only numerals belong to a tax registration reads as a line
 * that names an invoice.
 *
 * This pass puts the value back together before anything is classified. It joins ONLY runs
 * of adjacent tokens whose concatenation is a whole identifier, plus — when a marker token
 * introduced the run — a leading run of one that a fixed-width field cut off.
 *
 * IT NEVER CHANGES A CHARACTER. Joining is concatenation; the class repair it consults
 * (`repairIdentifierLayout`) only ever substitutes where the class is wrong. Two
 * registrations differing by a digit are two runs that both fold to themselves and stay
 * apart, which is the entire point: a wrong fold here is a wrong match downstream, and the
 * money moves.
 */
export interface IdentifierFold {
  /** The token list with each split registration rejoined into one token. */
  readonly tokens: readonly string[];
  /** Indexes into `tokens` that carry a registration, whole or truncated. */
  readonly identifiers: ReadonlySet<number>;
  /** Indexes into `tokens` that are the label beside one, or its declared absence. */
  readonly furniture: ReadonlySet<number>;
}

/** The most pieces a fifteen-character layout can be split into and still be worth joining. */
const MAX_FOLD_RUN = 6;

const NON_ALNUM_G = /[^\p{L}\p{N}]+/gu;

function compactUpper(value: string): string {
  return value.replace(NON_ALNUM_G, '').toUpperCase();
}

/**
 * The longest run starting at `from` that concatenates to a registration, or null.
 *
 * `anchored` — a marker token sits immediately before the run — is what licenses the two
 * lenient readings and nothing else does. Unanchored, the concatenation must be a whole
 * identifier exactly as written; a run of tokens that only becomes one by reading a `0` as
 * an `O`, or by being declared truncated, is not evidence, it is a wish.
 */
function identifierRunAt(
  tokens: readonly string[],
  from: number,
  anchored: boolean,
  tables: NormalisationTables,
): number | null {
  const limit = Math.min(MAX_FOLD_RUN, tokens.length - from);
  for (let len = limit; len >= 1; len -= 1) {
    let joined = '';
    let spansFurniture = false;
    for (let k = from; k < from + len; k += 1) {
      const t = tokens[k];
      if (t === undefined) continue;
      if (tables.identifierMarkers.has(t) || tables.identifierAbsentMarkers.has(t)) {
        spansFurniture = true;
        break;
      }
      joined += t;
    }
    if (spansFurniture) continue;
    const value = compactUpper(joined);
    if (value.length > IDENTIFIER_LENGTH) continue;
    if (isIdentifierValue(value)) return len;
    if (anchored && (isRepairableIdentifierValue(value) || isIdentifierPrefix(value))) return len;
  }
  return null;
}

export function foldIdentifierTokens(
  tokens: readonly string[],
  tables: NormalisationTables,
): IdentifierFold {
  const out: string[] = [];
  const identifiers = new Set<number>();
  const furniture = new Set<number>();

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) {
      i += 1;
      continue;
    }

    if (tables.identifierMarkers.has(token)) {
      out.push(token);
      furniture.add(out.length - 1);
      i += 1;
      continue;
    }

    const prev = i > 0 ? tokens[i - 1] : undefined;
    const anchored = prev !== undefined && tables.identifierMarkers.has(prev);

    // `GSTIN NA` — the column saying the vendor has no registration. Only ever read in
    // this position; `na` is a syllable in a great many company names anywhere else.
    if (anchored && tables.identifierAbsentMarkers.has(token)) {
      out.push(token);
      furniture.add(out.length - 1);
      i += 1;
      continue;
    }

    const run = identifierRunAt(tokens, i, anchored, tables);
    if (run !== null) {
      out.push(tokens.slice(i, i + run).join(''));
      identifiers.add(out.length - 1);
      i += run;
      continue;
    }

    out.push(token);
    i += 1;
  }

  return { tokens: out, identifiers, furniture };
}

/**
 * Classifies a token list, folding split registrations back into one token first.
 *
 * The list this returns is therefore not always one entry per input token, and `index` is
 * a position in the FOLDED list. Every caller reads the classification and the token text;
 * none of them indexes back into the input, and a rejoined registration is the honest unit
 * to report a position for.
 */
export function classifyTokens(
  tokens: readonly string[],
  tables: NormalisationTables,
): readonly ClassifiedToken[] {
  const folded = foldIdentifierTokens(tokens, tables);
  return folded.tokens.map((token, index) => {
    if (folded.identifiers.has(index)) return { token, klass: 'identifier' as TokenClass, index };
    if (folded.furniture.has(index)) return { token, klass: 'noise' as TokenClass, index };
    return { token, klass: classifyToken(token, tables), index };
  });
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
 * The tokens worth putting through the reference profile.
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
