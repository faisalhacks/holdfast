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

/**
 * The CORE of that layout — five letters, four digits, one letter — which is what is left
 * of a party identifier when a delimiter separates it from its leading state code and its
 * trailing check pair: `97-ZZHAS2704N-1ZP` becomes `97`, `zzhas2704n`, `1zp`.
 *
 * Without this the middle piece is an unremarkable `mixed_alphanumeric`, which is to say a
 * reference candidate, and a line that names its vendor's registration twice would read as
 * a line that names the invoice.
 */
export const IDENTIFIER_CORE_SHAPE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

export function looksLikeIdentifier(token: string): boolean {
  return IDENTIFIER_SHAPE.test(token) || IDENTIFIER_CORE_SHAPE.test(token);
}

const ALL_DIGITS = /^\p{N}+$/u;
const HAS_DIGIT = /\p{N}/u;
const HAS_LETTER = /\p{L}/u;

/**
 * A masked account or card number: two or more `x` standing for the digits a bank refuses
 * to print, with the surviving tail beside them. `XXXX9834`, `xxxx6051`, `9834xxxx`.
 *
 * It is rail furniture, not a document number, and the case for naming it here rather than
 * in `noiseTokens` is that it is a SHAPE and not a word: no finite list of literal tokens
 * covers `XXXX9834` and `XXXX6051` and the thousand others a statement will produce. Left
 * unrecognised it is a `mixed_alphanumeric`, which is to say a reference candidate, and a
 * four-digit account tail is exactly long enough to agree with a short invoice number by
 * accident.
 */
const MASKED_ACCOUNT = /^(?:[xX]{2,}\p{N}+|\p{N}+[xX]{2,})$/u;

/**
 * Order matters: noise first, so a rail code is never mistaken for a word; identifier next,
 * because its shape is specific enough to outrank the generic mixed case.
 */
export function classifyToken(token: string, tables: NormalisationTables): TokenClass {
  if (token === '') return 'noise';
  if (tables.noiseTokens.has(token)) return 'noise';
  if (MASKED_ACCOUNT.test(token)) return 'noise';
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
   * Offer each unbroken RUN of reference-shaped tokens as one candidate, beside the
   * individual tokens. Default true. See `referenceRuns` for why.
   */
  readonly groupRuns?: boolean;
  /**
   * Offer a bare four-digit calendar year as a candidate in its own right. Default false:
   * a year names a period, not a document, and on its own it is the weakest string in the
   * line. Inside a run it still contributes its digits.
   */
  readonly standaloneYears?: boolean;
  /**
   * Minimum length for one SEGMENT of a grouped reference to also be offered on its own.
   * Default 4. A token that was not segmented is never subject to this — see
   * `referenceCandidateTokens`.
   */
  readonly segmentMinLength?: number;
  /**
   * Maximum length of a plain WORD immediately before a run that is taken as the run's
   * document-code head — the `SI` of `SI-4207`, the `RCT` of `RCT 2026 02 802`. Default 4.
   * Zero switches head absorption off.
   */
  readonly runHeadMaxLength?: number;
}

const ALPHA_HEAD_OF = /^(\p{L}+)\p{N}/u;
const YEAR_SHAPED = /^\p{N}{4}$/u;

/**
 * The band inside which a four-digit numeral is read as a calendar year rather than a
 * document number, and it is deliberately NARROW.
 *
 * A payables ledger holds documents raised within living memory and not far into the
 * future, so a year on one of them lands in a fifty-year band around now. A four-digit
 * number outside that band is a document number and nothing else — `2070/26-27` and
 * `2073/26-27` are real references on this ledger, and a band running to 2099 would read
 * both of them as years and throw away the only thing that identifies them.
 */
const MIN_YEAR = 1990;
const MAX_YEAR = 2039;

function isCalendarYear(token: string): boolean {
  if (!YEAR_SHAPED.test(token)) return false;
  const year = Number(token);
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/** A fused prefix form (`inv0042`) is reference material; a fused RAIL form is not. */
function railHeaded(token: string, tables: NormalisationTables): boolean {
  const m = ALPHA_HEAD_OF.exec(token);
  const head = m === null ? undefined : m[1];
  if (head === undefined) return false;
  return tables.noiseTokens.has(head) && !tables.referencePrefixes.has(head);
}

/**
 * Is this token part of a document reference at all, whatever its length?
 *
 * Deliberately admits the one- and two-digit fragments a standalone test rejects. `01` in
 * `RCT-2026-01-472` is not a reference and never will be one, but it is unquestionably part
 * of one, and a run that skipped it would report the digits `2026472` for a document
 * numbered `202601472`.
 */
function isRunMaterial(entry: ClassifiedToken, tables: NormalisationTables): boolean {
  if (entry.klass === 'numeric') return true;
  if (entry.klass !== 'mixed_alphanumeric') return false;
  return !railHeaded(entry.token, tables);
}

/**
 * The unbroken runs of reference material, in order, each still as its own tokens.
 *
 * THIS IS THE UNIT THE COMPARATOR SHOULD HAVE BEEN GIVEN ALL ALONG. A reference is written
 * `RCT/2026/05/797`, and `punctuation_strip` — correctly — turns every delimiter into a
 * token boundary. Offering the pieces individually then hands `fuzzball`'s token-set ratio
 * a payment side whose tokens are a SUBSET of the invoice side's by construction, and a
 * token-set ratio scores a subset at a flat 1. A narration carrying nothing but the year
 * therefore matched every invoice raised that year at full similarity. That single token
 * was, measured on the selection set, the largest single source of confident wrong pairings
 * in the engine.
 *
 * A run is bounded by anything that is not reference material — a word, a rail code, a
 * masked account, a party identifier — so `SI-4207 VALUE DT 07-04-26` yields `4207` and not
 * `4207 07 04 26`: the words `value` and `dt` are the boundary, and they are there in the
 * line for exactly that purpose.
 *
 * `headMaxLength` is the one exception to that boundary, and it is what recovers the
 * document CODE. A short word immediately before a run — the `SI` of `SI-4207`, the `RCT`
 * of `RCT 2026 02 802` — is the reference's own prefix, written as a separate token because
 * a delimiter separated it. Absorbing it lets an invoice's `si 4207` meet a narration's
 * `si 4207` exactly rather than by containment. Zero switches it off.
 *
 * Which runs may then STAND as a reference is `joinedRun`'s question, not this one's: this
 * function reports what the line contains and judges nothing.
 */
export function referenceRuns(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  headMaxLength = 0,
): readonly (readonly ClassifiedToken[])[] {
  const out: ClassifiedToken[][] = [];
  let run: ClassifiedToken[] = [];
  let previous: ClassifiedToken | undefined;

  const flush = (): void => {
    const parts = run;
    run = [];
    if (parts.length === 0) return;
    out.push(parts);
  };

  for (const entry of classified) {
    if (isRunMaterial(entry, tables)) {
      if (
        run.length === 0 &&
        headMaxLength > 0 &&
        previous !== undefined &&
        previous.klass === 'word' &&
        previous.token.length <= headMaxLength
      ) {
        run.push(previous);
      }
      run.push(entry);
      previous = entry;
      continue;
    }
    flush();
    previous = entry;
  }
  flush();
  return out;
}

/**
 * A run offered whole, or null when it is not a document reference.
 *
 * Three refusals, and each one names a thing that is not a document number:
 *
 *   * a run of one, which was never segmented and is offered as the token it is;
 *   * a run carrying no numeral long enough to identify anything — `07 04 26` is a date,
 *     and `RCT 2026 01` is a prefix and a period with the document number cut off the end
 *     of the line, so neither may stand as a reference. Without this a truncated line
 *     reduces to its bare prefix, and a bare prefix is a subset of every reference that
 *     shares it, which the token-set ratio scores at a flat 1;
 *   * a run whose fused form has the layout of a party identifier — `97-ZZHAS2704N-1ZP` is
 *     a GSTIN a delimiter broke into pieces. A party is not a document, and admitting it
 *     would let a line that names the vendor twice pass as a line that names the invoice.
 */
function joinedRun(
  parts: readonly ClassifiedToken[],
  minReferenceLength: number,
): string | null {
  if (parts.length < 2) return null;
  const identifying = parts.some(
    (p) =>
      p.klass !== 'word' &&
      p.token.length >= minReferenceLength &&
      !isCalendarYear(p.token),
  );
  if (!identifying) return null;
  if (looksLikeIdentifier(parts.map((p) => p.token).join(''))) return null;
  return parts.map((p) => p.token).join(' ');
}

/**
 * The tokens worth putting through the reference profile.
 *
 * A SEGMENTED REFERENCE IS ONE REFERENCE. That is the whole of the change, and everything
 * below follows from it. A run of two or more reference-shaped tokens is offered whole; its
 * pieces are offered separately only when a piece is long enough to be a document number in
 * its own right. A token standing alone between two words was never segmented and is offered
 * as it was found.
 *
 * The reason is what the comparator does with a fragment. `fuzzball`'s token-set ratio scores
 * a flat 1 whenever one side's tokens are a SUBSET of the other's, so a narration offering
 * the bare token `2026` out of `RCT-2026-01-472` matched every invoice reference containing
 * `2026` at full similarity, and `2604` out of `2604-0237` matched `2604-3718` the same way.
 * Measured on the selection set, fragments of segmented references were the largest single
 * source of confident wrong pairings in the engine: they put an unrelated payment at the top
 * of the ranking, and the invoice was then held for a variance against a settlement that
 * never happened.
 *
 * Nothing is lost by grouping. The run's `digits` are taken from the run as found, so
 * `RCT/2026/05/797` and `RCT 2026 05 797` still meet on the digit view exactly as before —
 * better, in fact, because the digits of a fragment were never the digits of the document.
 * And the pieces that carry identity on their own — a five-digit document number in a bulk
 * remittance that names twenty of them — are still offered individually, which is what the
 * cardinality family anchors on.
 *
 * Fused prefix forms (`inv0042`) are included whole — the reference profile is what splits
 * them, and excluding them here would mean the prefix step never sees the case it exists for.
 *
 * Fused RAIL forms (`utr123456789012`) are excluded. The distinction is the alphabetic head:
 * a head that is a document prefix (`inv`, `bill`, `ref`) introduces a reference; a head that
 * is only rail boilerplate introduces a bank tracking number, which is not the invoice
 * reference and will never be one.
 */
export function referenceCandidateTokens(
  classified: readonly ClassifiedToken[],
  tables: NormalisationTables,
  options: ExtractionOptions = {},
): readonly string[] {
  const min = options.minReferenceLength ?? 3;
  const dropRailAdjacent = options.dropRailAdjacentNumbers ?? false;
  const groupRuns = options.groupRuns ?? true;
  const standaloneYears = options.standaloneYears ?? false;
  const segmentMin = options.segmentMinLength ?? 4;
  const headMax = options.runHeadMaxLength ?? 4;

  const out: string[] = [];
  const seen = new Set<string>();
  const offer = (token: string): void => {
    if (seen.has(token)) return;
    seen.add(token);
    out.push(token);
  };

  /** Is this token a document number when it stands on its own? */
  const standalone = (entry: ClassifiedToken, floor: number): boolean => {
    if (entry.klass === 'numeric') {
      if (entry.token.length < floor) return false;
      if (!standaloneYears && isCalendarYear(entry.token)) return false;
      if (dropRailAdjacent) {
        const prev = classified[entry.index - 1];
        if (
          prev !== undefined &&
          prev.klass === 'noise' &&
          !tables.referencePrefixes.has(prev.token)
        ) {
          return false;
        }
      }
      return true;
    }
    if (entry.klass !== 'mixed_alphanumeric') return false;
    if (entry.token.length < floor) return false;
    return !railHeaded(entry.token, tables);
  };

  for (const parts of referenceRuns(classified, tables, headMax)) {
    const whole = groupRuns ? joinedRun(parts, min) : null;
    // A segment of a grouped reference has to carry identity on its own before it is
    // offered on its own. A token that was never segmented keeps the ordinary floor.
    const floor = whole === null ? min : Math.max(min, segmentMin);
    for (const entry of parts) if (standalone(entry, floor)) offer(entry.token);
    if (whole !== null) offer(whole);
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
