// W04a — engine/normalise. The types this module owns.
//
// `lib/types.ts` is the contract and is frozen; nothing here redefines any part of it.
// What lives here is the machinery of an ORDERED, INDIVIDUALLY TOGGLEABLE pipeline, plus
// the structured record of what each step did. The contract's `NormalisationNote` is the
// narrow, reviewer-facing projection of that record — this file is the wide version.
//
// Three properties are structural rather than conventional, because a twenty-agent search
// is about to permute this module and a search whose results are not reproducible is not
// a search:
//
//   1. ORDER IS DATA. A profile declares `order: readonly StepId[]`. Nothing about the
//      sequence is encoded in call order, file order or import order.
//   2. STEPS ARE PURE. `apply(value, ctx) => StepResult`. No module-level mutable state,
//      no memoisation, no clock, no randomness. Same input, same output, forever.
//   3. TABLES ARE INJECTED. Suffix lists, alias maps and noise vocabularies arrive through
//      `StepContext`, so a strategy can be swapped by handing over different data without
//      touching a line of transform code.

import type { FeedbackRuleId, Side, VendorId } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The kinds of text this module knows how to canonicalise. Deliberately not the same list
 * as `EvidenceField` in the contract: `narration` is an ingestion concern that produces
 * vendor and reference candidates, and never becomes an evidence row of its own.
 */
export const NORMALISE_FIELDS = ['vendor', 'reference', 'narration', 'identifier'] as const;
export type NormaliseField = (typeof NORMALISE_FIELDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every named transform. A step id is a stable public name: a search agent selects,
 * reorders and toggles by these strings, and the report cites them.
 *
 * Adding a member here is additive. Renaming one invalidates every recorded
 * `NormalisationNote.rule`, so do not rename; add and deprecate.
 */
export const STEP_IDS = [
  'unicode_fold',
  'case_fold',
  'punctuation_strip',
  'whitespace_collapse',
  'noise_token_strip',
  'legal_suffix_strip',
  'abbreviation_expand',
  'reference_prefix_strip',
  'leading_zero_strip',
  'identifier_repair',
  'alias_map',
  'token_sort',
] as const;
export type StepId = (typeof STEP_IDS)[number];

/**
 * Why a value changed, as a code rather than a sentence. This is the half of the evidence
 * a reviewer scans; the raw and normalised strings beside it are the half they read.
 * There is no free-text member and there is not going to be one.
 */
export const CHANGE_KINDS = [
  'unicode_folded',
  'case_folded',
  'punctuation_stripped',
  'whitespace_collapsed',
  'noise_token_removed',
  'legal_suffix_removed',
  'abbreviation_expanded',
  'reference_prefix_removed',
  'leading_zeros_removed',
  'identifier_character_repaired',
  'alias_applied',
  'tokens_sorted',
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** One atomic edit, attributable to the table entry or pattern that caused it. */
export interface StepChange {
  readonly kind: ChangeKind;
  /** The fragment before the edit. A token, a character, or the whole value. */
  readonly from: string;
  /** The fragment after the edit. Empty string when the fragment was dropped. */
  readonly to: string;
  /**
   * The table key or pattern name that fired, when the edit was table-driven.
   * Null for context-free transforms such as case folding.
   */
  readonly source: string | null;
  /** Set when the edit came from a persisted reviewer correction rather than a default. */
  readonly feedback_rule_id: FeedbackRuleId | null;
}

export interface StepResult {
  readonly value: string;
  readonly changes: readonly StepChange[];
  /** Only the alias step can resolve an identity. Every other step returns null. */
  readonly resolved_vendor_id: VendorId | null;
}

/** Everything a step is allowed to see. There is no fifth argument and no ambient state. */
export interface StepContext {
  readonly side: Side;
  readonly field: NormaliseField;
  readonly tables: NormalisationTables;
}

export interface NormalisationStep {
  readonly id: StepId;
  /** Short fixed clause naming the transform. Not prose, not generated. */
  readonly clause: string;
  readonly apply: (value: string, ctx: StepContext) => StepResult;
}

/**
 * Step id -> implementation. Swapping a step's behaviour means putting a different
 * `NormalisationStep` under the same id; every profile that names it picks the change up.
 */
export type StepRegistry = ReadonlyMap<StepId, NormalisationStep>;

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

export interface AliasEntry {
  /** The canonical string this alias resolves to. */
  readonly canonical: string;
  /** Set when the alias also pins an identity, as a `vendor_alias` feedback rule does. */
  readonly vendor_id: VendorId | null;
  /** Provenance. Null for a default-table entry, set for a reviewer-authored one. */
  readonly feedback_rule_id: FeedbackRuleId | null;
}

/** Keyed by the ALREADY-NORMALISED string, so lookup happens after the cheap transforms. */
export type AliasTable = ReadonlyMap<string, AliasEntry>;

/** The data half of a normalisation strategy. Most sweep variants change only this. */
export interface NormalisationTables {
  /** Company-form tokens: `pvt`, `ltd`, `llp`, and the truncated bank spellings. */
  readonly legalSuffixes: ReadonlySet<string>;
  /** Payment-rail and connective boilerplate: `neft`, `utr`, `ref`, `and`, `the`. */
  readonly noiseTokens: ReadonlySet<string>;
  /** Truncation -> full form, e.g. `sw` -> `software`. Applied token-wise. */
  readonly abbreviations: ReadonlyMap<string, string>;
  /** Document-number prefixes stripped from a reference token: `inv`, `bill`, `no`. */
  readonly referencePrefixes: ReadonlySet<string>;
  readonly aliases: AliasTable;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profiles — the declared order
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A profile IS the strategy: which steps, in what sequence, and which of them are live.
 * It carries no code. Two profiles differing only in `order` are a legitimate experiment
 * and produce two distinguishable `NormalisationNote.rule` values in the evidence.
 */
export interface NormalisationProfile {
  /** Stable identifier, versioned. Appears verbatim in every note this profile produces. */
  readonly id: string;
  readonly field: NormaliseField;
  /**
   * THE DECLARED ORDER. Steps run exactly in this sequence. A step id may appear more than
   * once — running `whitespace_collapse` twice is legitimate — and each occurrence gets its
   * own trace row, distinguished by `index`.
   */
  readonly order: readonly StepId[];
  /**
   * Per-step on/off. A step id absent from this map is ENABLED; only an explicit `false`
   * disables. A disabled step still appears in the trace, so the record shows what was
   * considered and declined, not only what ran.
   */
  readonly enabled: Readonly<Partial<Record<StepId, boolean>>>;
}

export type ProfileSet = Readonly<Record<NormaliseField, NormalisationProfile>>;

// ─────────────────────────────────────────────────────────────────────────────
// Trace and result
// ─────────────────────────────────────────────────────────────────────────────

export interface StepTrace {
  readonly step: StepId;
  /** Position in `profile.order`. Disambiguates a step that appears twice. */
  readonly index: number;
  readonly enabled: boolean;
  /** True when the step was enabled AND it altered the value. */
  readonly applied: boolean;
  /**
   * True when the step produced an empty result from a non-empty input and the pipeline
   * therefore refused it. Normalisation never destroys a field: an over-eager suffix list
   * that would reduce a vendor name to nothing is recorded, not obeyed.
   */
  readonly suppressed: boolean;
  readonly before: string;
  readonly after: string;
  readonly changes: readonly StepChange[];
}

export interface NormalisationResult {
  readonly profile_id: string;
  readonly field: NormaliseField;
  readonly side: Side;
  /** The input, verbatim. The reviewer always sees this next to `value`. */
  readonly raw: string;
  readonly value: string;
  /** `value` split on whitespace. Empty for an empty value. */
  readonly tokens: readonly string[];
  /**
   * Every digit of `value`, in order, separators discarded — the CANONICALISED string, not
   * the raw one, falling back to the raw digits only when canonicalisation left none.
   *
   * The bridge across invoice-number convention drift: `INV/2024/0042` and `INV20240042`
   * agree here even though no token-level rule can recover a boundary that was never
   * written down. Taking it off the canonical value extends that bridge across the OTHER
   * half of the same drift — zero padding — so `INV/2026/05713` and `INV/2026/5713` agree
   * too, and the digit view stops contradicting the token view about a convention both are
   * looking at. See `digitViewOf` for what taking it off the raw string cost.
   */
  readonly digits: string;
  /** Set when the alias table pinned an identity. Null otherwise. */
  readonly resolved_vendor_id: VendorId | null;
  /** Complete: one row per entry in `profile.order`, applied or not. */
  readonly trace: readonly StepTrace[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Token classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a token looks like, judged on its own characters plus the noise vocabulary.
 * Deliberately coarse: a finer taxonomy needs context a single token does not carry, and a
 * confident wrong class is worse than an honest `word`.
 */
export const TOKEN_CLASSES = [
  'noise',
  'identifier',
  'numeric',
  'mixed_alphanumeric',
  'word',
] as const;
export type TokenClass = (typeof TOKEN_CLASSES)[number];

/**
 * A token found in a field that does not hold its shape — a reference sitting in the
 * vendor name, or a word sitting in the reference. Structured, so the matcher can fill in
 * `ReferenceEvidence.displaced` and `displaced_from` without parsing anything.
 *
 * This is a claim about ONE field of ONE record. It is not a comparison, not a score, and
 * not a candidate.
 */
export interface DisplacementFinding {
  readonly token: string;
  readonly klass: TokenClass;
  /** Position in the tokenised field, so a reviewer can see where in the line it sat. */
  readonly index: number;
  readonly found_in: NormaliseField;
  readonly belongs_to: NormaliseField;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference recovery — HOW a reference token was found, not only THAT it was
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a delimiter behaved between two adjacent fragments of a raw line.
 *
 * This is the distinction the old flat token stream threw away, and throwing it away is
 * what made a reference recovery unattributable. `punctuation_strip` turns `/`, `-`, `.`
 * and `,` all into the same space, so `RCT-2026-01-472` and `SI4559,TX.02973,06495` arrive
 * downstream looking identical: six anonymous fragments. They are not the same thing. The
 * first is ONE document number written with internal delimiters; the second is a LIST of
 * three, and gluing it back together invents a document nobody issued.
 *
 *   `reference_delimiter`  `/ - . _ \ #` — an internal delimiter of one document number.
 *   `list_delimiter`       `, ; | : & ( )` — a separator BETWEEN document numbers.
 *   `space`                a whitespace boundary. Weakest evidence of belonging together.
 *   `start`                first fragment of the line; nothing precedes it.
 */
export const SEGMENT_JOINS = ['start', 'reference_delimiter', 'list_delimiter', 'space'] as const;
export type SegmentJoin = (typeof SEGMENT_JOINS)[number];

/**
 * One fragment of a raw line, with the boundary that introduced it.
 *
 * The token sequence is identical to `classifyTokens(scan.tokens)` — same fragments, same
 * order, same indices — so a consumer can use either view without re-deriving positions.
 * What this adds is `join`, and `join` is the whole point.
 */
export interface Segment {
  readonly token: string;
  readonly klass: TokenClass;
  /** Position in the flat token stream. Matches `ClassifiedToken.index`. */
  readonly index: number;
  readonly join: SegmentJoin;
}

/**
 * HOW STRONGLY a reference was recovered, as a code rather than a number.
 *
 * There is no numeric confidence field here and there is not going to be one. A number
 * invites a threshold, a threshold invites tuning, and tuning a threshold is the move this
 * project exists to refuse. What the recovery carries is the STRUCTURE that was observed,
 * and a consumer that wants to rank recoveries ranks these codes.
 *
 * Ordered strongest to weakest:
 *
 *   `prefixed_compound`  a document prefix AND several delimiter-joined parts:
 *                        `INV/2026/01640`. The prefix says "this is a document number" and
 *                        the delimiters say where the number begins and ends. Nothing else
 *                        in a bank line looks like this by accident.
 *   `prefixed_single`    a document prefix fused or adjacent to one number: `BILL004856`.
 *   `compound`           several delimiter-joined parts, no prefix: `2603-1379`, `1344/26`.
 *   `alpha_series`       a short alphabetic series marker fused to a number: `TX02964`,
 *                        `SI4559`. The letters are the vendor's own series, not furniture.
 *   `bare_digits`        a lone digit run scraped out of free text: `472`, `2026`. The
 *                        WEAKEST recovery there is. It carries no evidence that the digits
 *                        are a document number rather than a year, a branch, a run number
 *                        or the tail of an account, and on its own it is as likely to be a
 *                        COMPONENT of a document number as a whole one.
 */
export const REFERENCE_RECOVERY_KINDS = [
  'prefixed_compound',
  'prefixed_single',
  'compound',
  'alpha_series',
  'bare_digits',
] as const;
export type ReferenceRecoveryKind = (typeof REFERENCE_RECOVERY_KINDS)[number];

/**
 * Why a fragment that LOOKS reference-shaped was not offered as one. Recorded rather than
 * silently dropped: a recovery that never happened is evidence about the feed, and a
 * reviewer asking "why did nothing come off this line" deserves the answer.
 */
export const REFERENCE_REJECTIONS = [
  /** `UTR295186958`, `RRN...` — a rail tracking number. Never the invoice reference. */
  'rail_tracking_number',
  /** `XXXX9484` — a masked account number. The digits are an account, not a document. */
  'masked_account',
  /** `16-01-26`, `29 01 26` — three or more two-digit groups in a row. A date. */
  'date_fragment',
  /** Fewer digits than the declared minimum. A branch code, not a document. */
  'below_minimum_length',
  /** GSTIN-shaped. It identifies a PARTY; treating it as a document is a category error. */
  'party_identifier',
] as const;
export type ReferenceRejection = (typeof REFERENCE_REJECTIONS)[number];

/**
 * One reference candidate recovered from a line, with the evidence for how strong it is.
 *
 * `token` is what goes through `reference.v1`. Everything beside it is the SIGNAL: which
 * fragments were assembled, whether a delimiter or only a space held them together, and
 * which document prefix (if any) introduced the number. A consumer that wants to treat a
 * `prefixed_compound` differently from a `bare_digits` has, here, everything it needs to
 * do so without re-parsing a string.
 */
export interface ReferenceCandidate {
  /** The assembled token, fragments space-joined. Feed this to the reference profile. */
  readonly token: string;
  readonly kind: ReferenceRecoveryKind;
  /** The fragments that were assembled, in order. */
  readonly parts: readonly string[];
  /** Index of the first fragment in the flat token stream. */
  readonly index: number;
  /** How many fragments were assembled. One means nothing was joined. */
  readonly span: number;
  /** The document prefix that introduced it (`inv`, `bill`, `gst`), or null. */
  readonly prefix: string | null;
  /** True when every join inside the run was a delimiter, never a bare space. */
  readonly delimited: boolean;
  /** Digits carried by the assembled token. The digit view's raw material. */
  readonly digit_length: number;
}

/** A fragment that looked reference-shaped and was refused, with the reason. */
export interface ReferenceRejectionFinding {
  readonly token: string;
  readonly index: number;
  readonly reason: ReferenceRejection;
}

/** Everything one line yielded on the reference axis: what was taken, and what was not. */
export interface ReferenceRecoverySet {
  readonly candidates: readonly ReferenceCandidate[];
  readonly rejected: readonly ReferenceRejectionFinding[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The rule string
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `NormalisationNote.rule` is typed `string` in the frozen contract, so this module fixes
 * a grammar for it and ships a parser. The note stays a citation, not a sentence.
 *
 *   `<profile_id>/<field>:<step_id>+<step_id>+...`
 *
 * Only the steps that actually changed something are listed. The full record — including
 * the steps that ran and declined — is in `NormalisationResult.trace`.
 */
export interface RuleDescriptor {
  readonly profile_id: string;
  readonly field: NormaliseField;
  readonly steps: readonly StepId[];
}
