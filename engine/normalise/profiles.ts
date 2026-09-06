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
//
// ─── THOSE CLAIMS, MEASURED (SWEEP-11) ───────────────────────────────────────
//
// The seven claims above were treated as falsifiable and attacked by exhaustive search
// over `order` and `enabled` alone, with the eval harness as the only referee. Every
// permutation of the six steps between `unicode_fold` and `alias_map` in the vendor order
// (720) and of the five in the reference order (120) was canonicalised over all 373
// records of the selection set — 200 invoices, 173 statement lines — and deduplicated by
// output. 720 vendor orderings produce 15 distinct outputs; 120 reference orderings
// produce 10. The full product of those classes, 150 pipelines standing for all 86,400
// orderings, was then run through the harness.
//
// NOT ONE beat the declared order. 90 of the 150 tie it at coverage 70.5%; the other 60
// score 70.0%. Every one of the 150 reports 0 false clears, 0 rupees at risk and 100%
// match precision, so the search never found a trade either — only a plateau and a cliff.
//
// WHAT SURVIVED. One adjacency, and it is one of the declared ones:
//
//   * `case_fold` before `reference_prefix_strip` — the one table lookup in the reference
//     order. The ten reference classes split cleanly on it and on nothing else: fold
//     first, 70.5%; fold after, 70.0%. `case_fold` commutes with `punctuation_strip`,
//     `whitespace_collapse` and `leading_zero_strip`, so its position is free against
//     everything EXCEPT the table, which is exactly what the claim says.
//
// WHAT IS FOLKLORE, on this dataset and these tables. Each of these is byte-identical on
// all 373 records at every position tried, so it cannot be measured, not merely measured
// as small:
//
//   * `abbreviation_expand` AFTER `legal_suffix_strip`. The two tables share no key and no
//     expansion lands in the suffix set, so the steps commute. The `co` ambiguity the note
//     describes is real in principle and absent in fact — the adjacency is a claim about
//     the TABLES, and it will start to bite the day one of them grows into the other.
//   * `noise_token_strip` before `legal_suffix_strip`, for the same reason. Note these two
//     do NOT commute in general: the non-destructive guard in `pipeline.ts` means whichever
//     runs SECOND is the one suppressed when it would empty the value, so "neft pvt" folds
//     to "pvt" or to "neft" depending on order. No record in the set reaches that case.
//   * `unicode_fold` first. The selection set is pure ASCII, so the step never fires. The
//     claim is untested rather than wrong, and the first non-ASCII narration tests it.
//   * `alias_map` LAST. Nothing wires an alias table into the engine — `prepareLedger`
//     takes `DEFAULT_CONFIG`, whose `aliases` is `EMPTY_ALIAS_TABLE` — so the step is a
//     no-op at every position. UNFALSIFIED, NOT CONFIRMED, and the distinction matters.
//
// WHAT IS REAL BUT NOT DECISIVE. These move canonical values, and the headline does not
// follow:
//
//   * `punctuation_strip` before the token steps: moving it after them changes 9 of 373
//     values and one decision. Coverage unchanged.
//   * `case_fold` before the VENDOR tables: moving it after the suffix, noise and
//     abbreviation lookups changes 160 of 373 values and five decisions, and the gains and
//     losses cancel exactly. Coverage unchanged. The fold matters for the reference prefix
//     table and, at this threshold, not for the vendor tables.
//   * The vendor canonical value in general. Splicing `identifier_repair` into the vendor
//     order — which compacts the whole value to one upper-case run with no token
//     boundaries at all — changes two decisions and leaves coverage at 70.5%. The reason is
//     visible in `engine/match/spec.ts`: `accept_min` is 0.75 and is DERIVED as
//     reference 0.40 + amount 0.35, so vendor (0.15) can corroborate a pair but can never
//     carry one over the bar. Vendor normalisation is not idle; it is out-weighted.
//
// WHAT IS UNREACHABLE. `narration.v1` and `identifier.v1` can be reversed end to end with
// byte-identical results for every record, because `engine/match/prepare.ts` reads
// `extraction.vendor` and `extraction.references` and never `extraction.narration` or
// `extraction.identifiers`. Their orders are documentation today, not behaviour.
//
// `token_sort` stays off: on the vendor side it costs one invoice, on the reference side
// nothing — which is what the note above predicted. Adding a step a profile does not
// declare was tried too: `leading_zero_strip` in the vendor order and `noise_token_strip`,
// `legal_suffix_strip` and `abbreviation_expand` in the reference order are inert at every
// position, and `reference_prefix_strip` in the vendor order costs one invoice wherever it
// is put.
//
// The orders below are therefore UNCHANGED. They are now orders that were attacked and
// held, which is a different claim from an order nobody tried to break — and the six
// verdicts above are the part of that worth carrying forward, because four of them say the
// reason written beside the step is not the reason the step is where it is.

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
  reference: REFERENCE_PROFILE_V1,
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
