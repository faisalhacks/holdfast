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
  'reference_period_strip',
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
  'reference_period_removed',
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
  /**
   * Document-SERIES heads: `tx`, `si`, `rct`. These mark a token as a document number and
   * are deliberately NOT stripped — see `DEFAULT_REFERENCE_SERIES` for why admitting and
   * deleting are two different decisions.
   */
  readonly referenceSeries: ReadonlySet<string>;
  /**
   * Calendar years admissible as a reference PERIOD segment: `2026`. A closed list, not a
   * pattern — see `DEFAULT_REFERENCE_YEARS` for why a pattern over-reaches here.
   */
  readonly referenceYears: ReadonlySet<string>;
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
   * Every digit of `raw`, in order, separators discarded. The bridge across
   * invoice-number convention drift: `INV/2024/0042` and `INV20240042` agree here even
   * though no token-level rule can recover a boundary that was never written down.
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
