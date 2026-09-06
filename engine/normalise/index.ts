// W04a — engine/normalise. Public surface.
//
// Deterministic canonicalisation of the text fields a reconciliation compares, and a
// structured record of every change, so a reviewer is shown WHY a value moved and never
// only that it did.
//
// ─── What this module is ─────────────────────────────────────────────────────────────
//
// An explicitly ordered pipeline of named, individually toggleable, pure steps:
//
//     unicode_fold -> case_fold -> punctuation_strip -> whitespace_collapse
//       -> noise_token_strip -> legal_suffix_strip -> abbreviation_expand
//       -> alias_map        [profiles.ts declares the exact order per field]
//
// plus token classification, which answers a different question: is this token even in the
// field it belongs to? Bank feeds put references in vendor names and vendor fragments in
// references, and canonicalising a field cannot fix a field that holds the wrong thing.
//
// ─── Invoice-number convention drift ─────────────────────────────────────────────────
//
// The two sides of a reconciliation disagree about how to write the same number, and three
// rules in this module are about nothing else:
//
//   PREFIXES    `reference_prefix_strip` removes furniture (`INV`, `BILL`, `AP-`) that says
//               only THAT a number follows. `tables.referenceSeries` holds the heads that
//               say WHICH SERIES it is (`TX`, `SI`, `RCT`); those admit a token and are
//               kept, because deleting them merges series a single digit already separates.
//   PERIODS     `reference_period_strip` removes the calendar year and the fiscal-year tail
//               that appear on one side only. A period is true of every document in it, and
//               a token-set ratio scores a shared period as a perfect reference agreement.
//   SEGMENTS    `referenceCandidateTokens` offers the maximal ADJACENCY RUN of a narration's
//               reference-shaped tokens as well as its members, so `RCT-2026-01-472` — which
//               punctuation stripping shattered into four — can meet the invoice whole.
//
// ─── What this module is NOT ─────────────────────────────────────────────────────────
//
// No candidate generation, no similarity, no scoring, no comparison between an invoice and
// a payment. That is `engine/match/**`. Everything here is one field of one record.
//
// ─── Swapping a strategy ─────────────────────────────────────────────────────────────
//
// Three independent axes, all pure data, none requiring a line of this module to change:
//
//   ORDER      withOrder(VENDOR_PROFILE_V1, 'vendor.suffix-first', [...])
//   TOGGLES    withStepEnabled(VENDOR_PROFILE_V1, 'vendor.no-abbrev', 'abbreviation_expand', false)
//   DATA       withAliases(DEFAULT_TABLES, myTable)  /  withTables(DEFAULT_TABLES, { legalSuffixes })
//
// and a fourth for changing a step's behaviour rather than its presence:
//
//   BEHAVIOUR  withStep(DEFAULT_STEPS, punctuationStripStep({ replaceWith: '' }))
//
// Assemble them into a `NormaliseConfig` and hand it to any entry point in `fields.ts`.
// `validateProfile` rejects a malformed variant before it runs; `normalise` throws on one
// that names a step the registry does not have, so a mistyped sweep variant fails loudly
// instead of quietly testing the default.
//
// ─── The evidence ────────────────────────────────────────────────────────────────────
//
// `NormalisationResult.trace` is the wide record: one row per declared step, applied or
// not, with the value before and after and the table entry that fired. `toNote()` narrows
// it to the frozen contract's `NormalisationNote`, whose `rule` follows a fixed grammar
// (`<profile_id>/<field>:<step>+<step>`) with a parser shipped beside the formatter.
// There is no prose anywhere in the output and there is not going to be any.

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  AliasEntry,
  AliasTable,
  ChangeKind,
  DisplacementFinding,
  NormalisationProfile,
  NormalisationResult,
  NormalisationStep,
  NormalisationTables,
  NormaliseField,
  ProfileSet,
  RuleDescriptor,
  StepChange,
  StepContext,
  StepId,
  StepRegistry,
  StepResult,
  StepTrace,
  TokenClass,
} from './types';
export { CHANGE_KINDS, NORMALISE_FIELDS, STEP_IDS, TOKEN_CLASSES } from './types';

// ── Tables — the data half of a strategy ─────────────────────────────────────
export type { AliasKeyFn } from './tables';
export {
  DEFAULT_ABBREVIATIONS,
  DEFAULT_LEGAL_SUFFIXES,
  DEFAULT_NOISE_TOKENS,
  DEFAULT_REFERENCE_PREFIXES,
  DEFAULT_REFERENCE_SERIES,
  DEFAULT_REFERENCE_YEARS,
  DEFAULT_TABLES,
  EMPTY_ALIAS_TABLE,
  aliasTableFromFeedbackRules,
  aliasTableFromVendors,
  mergeAliasTables,
  withAliases,
  withTables,
} from './tables';

// ── Steps — the behaviour half ───────────────────────────────────────────────
export type { PunctuationStripOptions, TokenSortOptions } from './steps';
export {
  DEFAULT_STEPS,
  IDENTIFIER_LENGTH,
  abbreviationExpandStep,
  aliasMapStep,
  caseFoldStep,
  identifierRepairStep,
  leadingZeroStripStep,
  legalSuffixStripStep,
  noiseTokenStripStep,
  punctuationStripStep,
  referencePeriodStripStep,
  referencePrefixStripStep,
  tokenSortStep,
  tokensOf,
  unicodeFoldStep,
  whitespaceCollapseStep,
  withStep,
  withSteps,
} from './steps';

// ── Profiles — the declared order ────────────────────────────────────────────
export {
  DEFAULT_PROFILES,
  IDENTIFIER_PROFILE_V1,
  NARRATION_PROFILE_V1,
  REFERENCE_PROFILE_V1,
  VENDOR_PROFILE_V1,
  isStepEnabled,
  validateProfile,
  validateProfileSet,
  withOrder,
  withProfile,
  withStepEnabled,
} from './profiles';

// ── Pipeline ─────────────────────────────────────────────────────────────────
export type { NormaliseOptions } from './pipeline';
export {
  allChanges,
  appliedSteps,
  citedFeedbackRuleId,
  describeRule,
  digitsOf,
  formatRule,
  normalise,
  parseRule,
  suppressedSteps,
  toNote,
} from './pipeline';

// ── Token classification ─────────────────────────────────────────────────────
export type { ClassifiedToken, DisplacementOptions, ExtractionOptions } from './tokens';
export {
  IDENTIFIER_SHAPE,
  classifyToken,
  classifyTokens,
  findDisplacedTokens,
  identifierCandidateTokens,
  looksLikeIdentifier,
  referenceCandidateTokens,
  vendorResidueTokens,
} from './tokens';

// ── Field and record entry points ────────────────────────────────────────────
export type {
  NarrationExtraction,
  NormaliseConfig,
  NormalisedField,
  NormalisedInvoice,
  NormalisedPayment,
} from './fields';
export {
  DEFAULT_CONFIG,
  aliasKeyFor,
  extractFromNarration,
  normaliseField,
  normaliseInvoice,
  normalisePaymentLine,
  normaliseReference,
  normaliseTaxIdentifier,
  normaliseVendorName,
  withConfig,
} from './fields';
