// SWEEP-12 — reference GROUPS. Delimiter-aware recovery of a document number from a line.
//
// ─── The defect this file exists to fix ──────────────────────────────────────────────
//
// `punctuation_strip` turns every delimiter into a token boundary, which is right for a
// vendor name and wrong for a document number. Run it before candidate extraction and
// `REF RCT-2026-01-472` reaches the matcher as four unrelated candidates — `rct`, `2026`,
// `01`, `472` — and the one that survives the numeric floor is a bare fiscal year.
//
// A bare year is not weak evidence. It is STRONG evidence for the wrong answer, because
// `token_set_ratio` returns 1.0 whenever one side's token set is a subset of the other's:
// the token `2026` therefore agrees PERFECTLY with every invoice reference of the year, and
// the digit view adds a further four-in-nine of containment on top. Measured on the frozen
// selection set, one such line (`TRF ... REF RCT-2026-01-472`) was the top-ranked candidate
// for four different invoices it has nothing to do with, three of them belonging to other
// vendors. The reference component — the heaviest of the four, and the only one that
// identifies a document rather than describing one — was being carried by calendar noise.
//
// `engine/holds/cardinality/anchors.ts` reached the same conclusion from the other side and
// wrote it down: "Four is not enough: `2026` is a year, and on the frozen set a four-digit
// floor bound the one bulk remittance line to seven unrelated invoices whose references
// merely contain the fiscal year." That family reached for a five-digit floor; the guard
// below reaches for the narrower fact underneath it — a bare, unpadded, four-digit run in
// the calendar range is a YEAR — because a flat floor also throws away `1342`, which is the
// truncated form of a real invoice number a real bank line carried. Either way the fragment
// is refused one module earlier, so the scorer never sees it.
//
// ─── What a group is ─────────────────────────────────────────────────────────────────
//
// A maximal run of alphanumeric SEGMENTS joined by intra-reference delimiters (`/ - . _ :
// #`), bounded by anything that separates FIELDS in a narration — whitespace, a comma, a
// pipe, an ampersand — and terminated early by a segment that cannot be part of a document
// number: a vendor word, a company form, rail furniture, a bank tracking number.
//
// `IMPS/TX/02964/FENVARTI ENGG PVT LTD/REM ADV` yields exactly one group, `tx 02964`: the
// rail code `imps` opens it, `fenvarti` closes it, and the slash between `TX` and `02964` is
// the vendor's own numbering convention rather than a field boundary. Nothing here decides
// which invoice that names. It decides only what was written down.
//
// PURE, like every other function in this module: no clock, no cache, no module state.

import type { NormalisationTables } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The character classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delimiters that appear INSIDE one document number. Every one of them is attested in the
 * frozen selection set on both sides of the same reference: `TX/01021` against `TX.01021`,
 * `2603-1379` against `26031379`, `RCT/2026/01/472` against `RCT-2026-01-472`.
 *
 * Anything not listed here and not alphanumeric separates fields instead — a comma between
 * two references in a bulk advice, an ampersand in `ZEPHRIK SW & SONS`, the space that
 * separates a narration's columns.
 */
const JOINERS: ReadonlySet<string> = new Set(['/', '\\', '-', '.', '_', ':', '#']);

const ALNUM = /[0-9a-z]/;
const ALPHA_ONLY = /^[a-z]+$/;
const DIGIT_ONLY = /^[0-9]+$/;
const HAS_DIGIT = /[0-9]/;
const ALPHA_HEAD = /^([a-z]+)[0-9]/;

/**
 * A vendor word is any run of letters this long that is not a document prefix. Three is too
 * short — `tx`, `si`, `cn`, `ap` and `rct` are all document prefixes a vendor actually
 * writes — and five would let `bill`, `note` and `memo` through as names.
 */
const VENDOR_WORD_LENGTH = 4;

/**
 * Words after which the next group identifies a PARTY, not a document. A GSTIN-shaped
 * string names who was paid; treating it as a reference lets a line that names the vendor
 * twice pass as a line that names the invoice, which is the same error
 * `engine/holds/matching/reference.ts` refuses for identifier-shaped tokens.
 */
export const DEFAULT_IDENTIFIER_MARKERS: ReadonlySet<string> = new Set([
  'gstin',
  'gstno',
  'gstn',
  'tin',
  'uin',
  'cin',
  'iec',
]);

/**
 * Words after which the next group is a calendar date. A narration writes `VALUE DT
 * 23-05-26` and `EOD 16-01-26`, and six digits of date are six digits that will contain
 * somebody's invoice number sooner or later.
 */
export const DEFAULT_DATE_MARKERS: ReadonlySet<string> = new Set([
  'dt',
  'dtd',
  'date',
  'dated',
  'eod',
  'valuedt',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Chunking
// ─────────────────────────────────────────────────────────────────────────────

export interface Chunk {
  readonly segments: readonly string[];
  /**
   * Only whitespace stood between this chunk and the one before it.
   *
   * The distinction is what lets `RCT 2026 02 802` be read as one document number while
   * `TX.02973,06495` stays as two. A space is a WEAK separator: half the feed writes the
   * delimiter and half writes a space, and the same vendor does both within one year. A
   * comma is a strong one — it is what a bulk advice puts between the documents it lists,
   * and joining across it would invent a reference that names two invoices at once.
   */
  readonly soft: boolean;
}

const WHITESPACE_ONLY = /^\s*$/;

/**
 * Splits a folded line into chunks of joiner-separated segments. Case folding is the
 * caller's job — this function does not fold, so that a caller comparing two spellings is
 * never comparing the output of two different folds.
 */
export function chunksOf(value: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let segments: string[] = [];
  let current = '';
  let separator = '';
  let soft = true;

  const endSegment = (): void => {
    if (current !== '') {
      segments.push(current);
      current = '';
    }
  };
  const endChunk = (): void => {
    endSegment();
    if (segments.length > 0) {
      chunks.push({ segments, soft });
      segments = [];
    }
  };

  for (const ch of value) {
    if (ALNUM.test(ch)) {
      if (segments.length === 0 && current === '') soft = WHITESPACE_ONLY.test(separator);
      current += ch;
      separator = '';
      continue;
    }
    if (JOINERS.has(ch)) {
      endSegment();
      continue;
    }
    endChunk();
    separator += ch;
  }
  endChunk();
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment roles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `part` belongs to the document number under construction; `break` ends it.
 *
 * Every `break` is a positive claim about the segment, never a fallback: a company form, a
 * rail code, a bank tracking number, a vendor word, or a party identifier. A segment we
 * cannot classify is a `part`, because the cost of carrying one extra token into a
 * `token_set_ratio` is nothing — the comparator ignores tokens the other side does not have
 * — and the cost of dropping half a document number is a match that never happens.
 */
export type SegmentRole = 'part' | 'break';

export function segmentRole(segment: string, tables: NormalisationTables): SegmentRole {
  if (segment === '') return 'break';

  if (ALPHA_ONLY.test(segment)) {
    // A document prefix is part of the number it introduces; `reference_prefix_strip`
    // removes it downstream, and removing it here would lose the evidence that it was
    // written at all.
    if (tables.referencePrefixes.has(segment)) return 'part';
    if (tables.legalSuffixes.has(segment)) return 'break';
    if (tables.noiseTokens.has(segment)) return 'break';
    if (DEFAULT_IDENTIFIER_MARKERS.has(segment)) return 'break';
    if (DEFAULT_DATE_MARKERS.has(segment)) return 'break';
    return segment.length >= VENDOR_WORD_LENGTH ? 'break' : 'part';
  }

  if (DIGIT_ONLY.test(segment)) return 'part';

  // Mixed. A rail head introduces a bank tracking number — `utr295186958` is the bank's
  // own reference for the transfer and will never be the invoice's.
  const m = ALPHA_HEAD.exec(segment);
  const head = m === null ? undefined : m[1];
  if (head !== undefined && tables.noiseTokens.has(head) && !tables.referencePrefixes.has(head)) {
    return 'break';
  }
  if (head !== undefined && DEFAULT_IDENTIFIER_MARKERS.has(head)) return 'break';
  return 'part';
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceGroup {
  /** The segments, space-joined. Ready for the reference profile. */
  readonly text: string;
  readonly segments: readonly string[];
  /** The last bare word seen before the group opened, when there was one. */
  readonly marker: string | null;
  /** Position among the groups the line yielded. */
  readonly index: number;
}

export interface ReferenceGroupOptions {
  /** Digits a group must carry at all. Default 3. */
  readonly minGroupDigits?: number;
  /** Refuse a group whose entire numeric content reads as a calendar year. Default true. */
  readonly refuseCalendarYear?: boolean;
  /** The range a four-digit run has to fall in to be read as a year. Default 1990-2100. */
  readonly yearRange?: readonly [number, number];
  readonly identifierMarkers?: ReadonlySet<string>;
  readonly dateMarkers?: ReadonlySet<string>;
}

const DIGIT_RUN = /[0-9]+/g;

const digitCount = (value: string): number => {
  let n = 0;
  for (const ch of value) if (ch >= '0' && ch <= '9') n += 1;
  return n;
};

/**
 * The whole numeric content of this group is one four-digit run that reads as a calendar
 * year, written without padding.
 *
 * This is the promiscuity guard, and it is narrow on purpose. A blunt length floor —
 * "refuse anything under five digits" — takes `1342` with it, and `1342` is the truncated
 * form of `1342/26-27` that a real bank line carried and that a real invoice was settled
 * by. Three facts separate the two, and all three are properties of the calendar rather
 * than of this dataset: a year is exactly four digits, a year is never zero-padded, and a
 * year sits in a range. `0005` keeps its padding and stays; `1342` is out of range and
 * stays; `2026` goes.
 *
 * A group with any OTHER digits alongside is never a bare year — `INV/2026/05713` carries
 * its sequence number and identifies a document — so the test is on the group's entire
 * numeric content, not on any one segment of it.
 *
 * ABLATED, AND KEPT ON DELIBERATELY AGAINST THE HEADLINE NUMBER. Switching this guard off
 * scores HIGHER on the frozen selection set — coverage 73.5% against 72.5%, with no false
 * clear either way — and the extra point is an artefact, not a recovery. It comes from one
 * line whose narration was cut off at `INV/2026/`: the bare year ranks it first against
 * three invoices, two of them other vendors', and its amount is then so far from those
 * invoices that the variance family's 15% credibility ceiling makes it stand down, so a
 * hold that needed a named human becomes one that releases itself. Coverage rises because
 * the match got WORSE. Nothing in this sweep's remit says to take that point, and the same
 * mechanism with a nearer amount is a false clear rather than a free point. The guard
 * stays; the number it costs is reported.
 */
function readsAsCalendarYear(text: string, range: readonly [number, number]): boolean {
  const runs = text.match(DIGIT_RUN);
  if (runs === null || runs.length !== 1) return false;
  const run = runs[0];
  if (run === undefined || run.length !== 4 || run.startsWith('0')) return false;
  const year = Number.parseInt(run, 10);
  return year >= range[0] && year <= range[1];
}

/**
 * Three all-numeric segments shaped `dd-mm-yy` or `dd-mm-yyyy`.
 *
 * The FIRST segment is what separates a date from a reference: `1344/26-27` and
 * `8264/26-27` are fiscal-year-suffixed invoice numbers whose lead segment is four digits,
 * and `23-05-26` is a date whose lead segment is two. A rule that looked only at the tail
 * would throw both away.
 */
function looksLikeDate(segments: readonly string[]): boolean {
  if (segments.length !== 3) return false;
  const [a, b, c] = segments;
  if (a === undefined || b === undefined || c === undefined) return false;
  if (!DIGIT_ONLY.test(a) || !DIGIT_ONLY.test(b) || !DIGIT_ONLY.test(c)) return false;
  if (a.length > 2 || b.length > 2) return false;
  return c.length === 2 || c.length === 4;
}

/**
 * The document numbers a line was actually carrying.
 *
 * `value` must already be unicode- and case-folded; punctuation must NOT have been
 * stripped, because the punctuation is the evidence this function reads.
 */
export function referenceGroups(
  value: string,
  tables: NormalisationTables,
  options: ReferenceGroupOptions = {},
): readonly ReferenceGroup[] {
  const minGroupDigits = options.minGroupDigits ?? 3;
  const refuseCalendarYear = options.refuseCalendarYear ?? true;
  const yearRange = options.yearRange ?? ([1990, 2100] as const);
  const identifierMarkers = options.identifierMarkers ?? DEFAULT_IDENTIFIER_MARKERS;
  const dateMarkers = options.dateMarkers ?? DEFAULT_DATE_MARKERS;

  const out: ReferenceGroup[] = [];
  let lastWord: string | null = null;

  const emit = (segments: readonly string[], marker: string | null): void => {
    if (segments.length === 0) return;
    const text = segments.join(' ');
    if (!HAS_DIGIT.test(text)) return;
    if (marker !== null && identifierMarkers.has(marker)) return;
    if (marker !== null && dateMarkers.has(marker)) return;
    if (looksLikeDate(segments)) return;
    if (digitCount(text) < minGroupDigits) return;
    if (refuseCalendarYear && readsAsCalendarYear(text, yearRange)) return;
    out.push({ text, segments: [...segments], marker, index: out.length });
  };

  let run: string[] = [];
  let marker: string | null = null;

  const flush = (): void => {
    emit(run, marker);
    run = [];
  };

  for (const chunk of chunksOf(value)) {
    // A date chunk never joins a document number and never becomes one. `ACH DR VENDOR
    // PAYOUT RUN 7974 12-02-26` names document 7974 and was posted on the 12th; without
    // this the run swallows the date and the document number is gone.
    if (looksLikeDate(chunk.segments)) {
      flush();
      continue;
    }
    // Only a bare number continues a run across a space. An alphabetic or fused segment
    // after a space starts a new document number rather than extending the last one:
    // `REF BILL304845` is one reference, not `ref` plus `bill304845` joined.
    const first = chunk.segments[0];
    const continues =
      chunk.soft && run.length > 0 && first !== undefined && DIGIT_ONLY.test(first);
    if (!continues) flush();

    for (const segment of chunk.segments) {
      const role = segmentRole(segment, tables);
      if (role === 'break') {
        flush();
        if (ALPHA_ONLY.test(segment)) lastWord = segment;
        continue;
      }
      if (run.length === 0) marker = lastWord;
      run.push(segment);
    }
    const last = chunk.segments[chunk.segments.length - 1];
    if (last !== undefined && ALPHA_ONLY.test(last)) lastWord = last;
  }
  flush();

  return out;
}
