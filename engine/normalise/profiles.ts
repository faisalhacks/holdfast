// W04a — the declared orders.
//
// A profile is DATA. It names steps and their sequence and carries no behaviour, which is
// what makes an ordering an experiment rather than a rewrite. The brief's spine —
//
//     case folding -> punctuation stripping -> legal-suffix stripping -> alias table
//
// is preserved in every profile below; the additional steps sit around it where the order
// is forced by what each one needs to see.
//
// WHY THE ORDER IS WHAT IT IS. Each of these is a claim a search may falsify; none is
// arbitrary, and all of them are reachable by reordering `order` alone:
//
//   * `unicode_fold` first, so every later rule can assume plain characters. A smart
//     apostrophe that reaches `punctuation_strip` is handled; one that reaches a token
//     table is a silent miss.
//   * `case_fold` before every table lookup. Every table in `tables.ts` is lower-case; a
//     lookup before the fold matches nothing and fails quietly, which is the worst way to
//     fail.
//   * `punctuation_strip` before anything token-wise, because a token boundary is what
//     punctuation becomes and the token steps cannot see one that has not been made yet.
//   * `noise_token_strip` before `legal_suffix_strip`, so the suffix list is not competing
//     with rail codes for the same short tokens.
//   * `abbreviation_expand` AFTER `legal_suffix_strip`. `co` is a company form and also a
//     plausible truncation; stripping the company form first removes the ambiguity instead
//     of resolving it by guess.
//   * `alias_map` LAST. The table is keyed on the fully canonicalised string, so one entry
//     covers every spelling the earlier steps already collapse. Move it earlier and the
//     table has to enumerate raw spellings, which is how alias tables become unreadable.
//   * `token_sort` OFF everywhere by default: `fuzzball`'s token-set ratio is already
//     order-insensitive, so sorting buys nothing downstream and costs the reviewer the
//     word order they read.

import type { NormalisationProfile, NormaliseField, ProfileSet, StepId, StepRegistry } from './types';

/**
 * Vendor names, from either side. Invoice `vendor_name_raw` and the vendor residue
 * recovered from a bank narration go through the SAME profile — asymmetric normalisation
 * across the two sides is the defect that makes a matcher look better than it is.
 */
export const VENDOR_PROFILE_V1: NormalisationProfile = {
  id: 'vendor.v1',
  field: 'vendor',
  order: [
    'unicode_fold',
    'case_fold',
    'punctuation_strip',
    'whitespace_collapse',
    'noise_token_strip',
    'legal_suffix_strip',
    'abbreviation_expand',
    'alias_map',
    'token_sort',
  ],
  enabled: { token_sort: false },
};

/**
 * Invoice references and the reference tokens recovered from a narration. No suffix or
 * abbreviation work: a reference is a code, and expanding fragments of a code invents one.
 */
export const REFERENCE_PROFILE_V1: NormalisationProfile = {
  id: 'reference.v1',
  field: 'reference',
  order: [
    'unicode_fold',
    'case_fold',
    'punctuation_strip',
    'whitespace_collapse',
    'reference_prefix_strip',
    'leading_zero_strip',
    'alias_map',
    'token_sort',
  ],
  enabled: { token_sort: false },
};

/**
 * The reference profile with DELIMITER HANDLING CLOSED, and the default.
 *
 * `reference.v1` canonicalises every delimiter that was written and is defenceless against
 * the one that was not. `punctuation_strip` turns `TX/01021`, `TX-01021` and `TX 01021`
 * into the same two tokens; `TX01021` stays one token and reads to the comparator as a
 * different document. On this dataset that is not an edge case — 46 of 200 invoice
 * references are written in the fused `BILL004844` form and the bank side fuses references
 * that the ledger delimits, in both directions.
 *
 * `delimiter_segment` sits immediately after `whitespace_collapse` and restores the
 * boundary at every letter/digit transition, which is the only place a delimiter can have
 * been dropped from a document number. Its position is forced from both sides:
 *
 *   * AFTER `punctuation_strip`, so written and unwritten delimiters have become the same
 *     kind of boundary before anything counts tokens. Running it first would leave the two
 *     spellings in different shapes for the rest of the pipeline.
 *   * BEFORE `reference_prefix_strip`, so a fused prefix is a standalone token by the time
 *     the prefix table is consulted. The prefix step has its own fused-form rule and would
 *     still catch `inv0042`; it has no rule for `99inv0199`, where the prefix is in the
 *     MIDDLE, and after segmentation it needs none.
 *   * BEFORE `leading_zero_strip`, which only ever acts on a wholly numeric token. This is
 *     the pairing that does the real work: `TX/01021` and `TX01021` both reach the zero
 *     strip as `tx 01021` and both leave it as `tx 1021`, so a zero-padding convention and
 *     a delimiter convention stop multiplying into four spellings of one number.
 *
 * Nothing is dropped: the step only inserts boundaries, so `TX01021` and `TX01022` are as
 * distinguishable afterwards as they were before.
 */
export const REFERENCE_PROFILE_V2: NormalisationProfile = {
  id: 'reference.v2',
  field: 'reference',
  order: [
    'unicode_fold',
    'case_fold',
    'punctuation_strip',
    'whitespace_collapse',
    'delimiter_segment',
    'reference_prefix_strip',
    'leading_zero_strip',
    'alias_map',
    'token_sort',
  ],
  enabled: { token_sort: false },
};

/**
 * The whole bank narration line. Same shape as the vendor profile because the residue left
 * after the boilerplate is removed IS a vendor name; keeping the two orders identical is
 * what makes `fields.ts` able to hand the residue straight to the vendor profile.
 */
export const NARRATION_PROFILE_V1: NormalisationProfile = {
  id: 'narration.v1',
  field: 'narration',
  order: [
    'unicode_fold',
    'case_fold',
    'punctuation_strip',
    'whitespace_collapse',
    'noise_token_strip',
    'legal_suffix_strip',
    'abbreviation_expand',
    'alias_map',
    'token_sort',
  ],
  enabled: { token_sort: false },
};

/**
 * GSTIN-style tax identifiers. No case fold: the canonical form is upper-case and
 * `identifier_repair` produces it. The alias step is present but off — an alias table over
 * identifiers would be a second registry of record, and there is only one.
 */
export const IDENTIFIER_PROFILE_V1: NormalisationProfile = {
  id: 'identifier.v1',
  field: 'identifier',
  order: ['unicode_fold', 'identifier_repair', 'alias_map'],
  enabled: { alias_map: false },
};

export const DEFAULT_PROFILES: ProfileSet = {
  vendor: VENDOR_PROFILE_V1,
  reference: REFERENCE_PROFILE_V2,
  narration: NARRATION_PROFILE_V1,
  identifier: IDENTIFIER_PROFILE_V1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure profile edits — the search agent's whole surface area
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reorders. The id must change with the order, or two different strategies produce the
 * same `rule` string in the evidence and the run becomes impossible to attribute.
 */
export function withOrder(
  profile: NormalisationProfile,
  id: string,
  order: readonly StepId[],
): NormalisationProfile {
  return { ...profile, id, order };
}

/** Toggles one step. Returns a new profile; the input is never mutated. */
export function withStepEnabled(
  profile: NormalisationProfile,
  id: string,
  step: StepId,
  on: boolean,
): NormalisationProfile {
  return { ...profile, id, enabled: { ...profile.enabled, [step]: on } };
}

/** Replaces one field's profile in a set. */
export function withProfile(base: ProfileSet, profile: NormalisationProfile): ProfileSet {
  return { ...base, [profile.field]: profile };
}

/** True when the step is live in this profile. Absent means enabled. */
export function isStepEnabled(profile: NormalisationProfile, step: StepId): boolean {
  return profile.enabled[step] !== false;
}

/**
 * Structural problems a search agent should be told about before a run rather than after.
 * Returns an empty array for a sound profile. `normalise()` throws on the same conditions;
 * this exists so a sweep harness can reject a variant without running it.
 */
export function validateProfile(
  profile: NormalisationProfile,
  steps: StepRegistry,
): readonly string[] {
  const problems: string[] = [];
  if (profile.id.trim() === '') problems.push('profile id is empty');
  if (profile.order.length === 0) problems.push(`profile "${profile.id}" declares no steps`);
  for (const step of profile.order) {
    if (!steps.has(step)) problems.push(`profile "${profile.id}" names unknown step "${step}"`);
  }
  for (const step of Object.keys(profile.enabled)) {
    if (!profile.order.includes(step as StepId)) {
      problems.push(`profile "${profile.id}" toggles "${step}", which is not in its order`);
    }
  }
  return problems;
}

/** Validates every profile in a set. */
export function validateProfileSet(set: ProfileSet, steps: StepRegistry): readonly string[] {
  const fields: readonly NormaliseField[] = ['vendor', 'reference', 'narration', 'identifier'];
  const problems: string[] = [];
  for (const field of fields) {
    const profile = set[field];
    if (profile.field !== field) {
      problems.push(`profile "${profile.id}" is filed under "${field}" but declares "${profile.field}"`);
    }
    problems.push(...validateProfile(profile, steps));
  }
  return problems;
}
