// W04a — the runner.
//
// `normalise()` walks a profile's declared order exactly once, in sequence, and records
// what every step did — including the steps that ran and declined, and the steps that were
// switched off. The trace is complete on purpose: a record that lists only the edits
// cannot tell a reviewer, or a search agent, the difference between "the rule did not
// apply" and "the rule was not there".
//
// Properties this function guarantees, and which the search depends on:
//
//   PURE          Same `(raw, options)` in, same `NormalisationResult` out, on any machine
//                 and in any order. No clock, no randomness, no locale, no I/O.
//   UNCACHED      Deliberately. A cache keyed on anything the caller cannot see makes two
//                 sweep runs disagree for reasons neither run records. If a caller wants
//                 memoisation it can wrap this function with a key it chose itself.
//   NON-DESTRUCTIVE
//                 A step that would empty a non-empty value is REFUSED and recorded as
//                 `suppressed`. An over-eager suffix table degrades a match; it must never
//                 delete a field a reviewer needs to see.
//   LOUD          An unknown step id throws. Silently skipping a mistyped step would let a
//                 search agent believe it tested a variant it never ran.

import type { FeedbackRuleId, NormalisationNote, Side, VendorId } from '@/lib/types';
import { DEFAULT_TABLES } from './tables';
import { DEFAULT_STEPS, tokensOf } from './steps';
import { isStepEnabled } from './profiles';
import type {
  NormalisationProfile,
  NormalisationResult,
  NormalisationTables,
  NormaliseField,
  RuleDescriptor,
  StepChange,
  StepId,
  StepRegistry,
  StepTrace,
} from './types';
import { NORMALISE_FIELDS, STEP_IDS } from './types';

export interface NormaliseOptions {
  readonly profile: NormalisationProfile;
  readonly side: Side;
  /** Defaults to `DEFAULT_STEPS`. Swap a step by passing a registry with it installed. */
  readonly steps?: StepRegistry;
  /** Defaults to `DEFAULT_TABLES`. Swap the data without touching the transforms. */
  readonly tables?: NormalisationTables;
}

const DIGITS_ONLY = /\D+/g;

/** Every digit of the input, in order, separators discarded. */
export function digitsOf(value: string): string {
  return value.replace(DIGITS_ONLY, '');
}

const HAS_DIGIT = /\p{N}/u;

/**
 * The digit view: every digit in order, separators discarded — taken from the raw string
 * for a SIMPLE reference and from the canonicalised value for a COMPOUND one.
 *
 * Zero padding is convention drift like any other: the same vendor writes
 * `INV/2026/05713` on the invoice and `INV/2026/5713` on the remittance in the same week.
 * Where that padding sits decides which view can see past it, and the split below is that
 * fact and nothing else.
 *
 *   SIMPLE — one number. The padding is at the HEAD of the digit string (`000560`), which
 *            the comparator's own leading-zero rule already reaches. The raw digits are
 *            kept, and keeping them is what preserves a short reference: `BILL000560`
 *            canonicalises to `560`, three digits, below any sane minimum for claiming two
 *            documents are the same. The padding is the only length it has.
 *
 *   COMPOUND — several parts. The padding sits in the MIDDLE of the concatenation
 *            (`2026` + `05713` -> `202605713`), where no whole-string rule can reach it and
 *            no token rule is looking. `leading_zero_strip` has already made the judgement
 *            in the token view; this makes the digit view agree with it.
 *
 * The cost of getting this wrong is not symmetrical and it is worth stating. Measured on
 * this ledger with the raw view everywhere, an invoice whose reference agreed TOKEN FOR
 * TOKEN with a narration scored BELOW one that agreed on nothing but the year: `202605713`
 * against `20265713` yields no containment at all, while `202605713` against a bare `2026`
 * yields a four-of-nine head. The stronger evidence scored lower.
 */
export function digitViewOf(raw: string, value: string): string {
  const numericTokens = tokensOf(value).filter((t) => HAS_DIGIT.test(t));
  if (numericTokens.length < 2) return digitsOf(raw);
  const canonical = digitsOf(value);
  return canonical === '' ? digitsOf(raw) : canonical;
}

/**
 * Runs the profile. The return value is the whole record: the raw input, the canonical
 * output, the token and digit views, any identity the alias table pinned, and one trace
 * row per declared step.
 */
export function normalise(raw: string, options: NormaliseOptions): NormalisationResult {
  const { profile, side } = options;
  const steps = options.steps ?? DEFAULT_STEPS;
  const tables = options.tables ?? DEFAULT_TABLES;
  const ctx = { side, field: profile.field, tables };

  const trace: StepTrace[] = [];
  let value = raw;
  let resolvedVendorId: VendorId | null = null;

  for (let index = 0; index < profile.order.length; index += 1) {
    const id = profile.order[index];
    if (id === undefined) continue;

    const step = steps.get(id);
    if (step === undefined) {
      throw new Error(
        `engine/normalise: profile "${profile.id}" names step "${id}", which the registry does not provide.`,
      );
    }

    const enabled = isStepEnabled(profile, id);
    if (!enabled) {
      trace.push({
        step: id,
        index,
        enabled: false,
        applied: false,
        suppressed: false,
        before: value,
        after: value,
        changes: [],
      });
      continue;
    }

    const before = value;
    const result = step.apply(before, ctx);

    // Non-destructive: a step may narrow a value, never annihilate it.
    const suppressed = before.trim().length > 0 && result.value.trim().length === 0;
    const after = suppressed ? before : result.value;
    const applied = !suppressed && after !== before;

    trace.push({
      step: id,
      index,
      enabled: true,
      applied,
      suppressed,
      before,
      after,
      changes: suppressed ? [] : result.changes,
    });

    if (!suppressed && result.resolved_vendor_id !== null) {
      resolvedVendorId = result.resolved_vendor_id;
    }
    value = after;
  }

  return {
    profile_id: profile.id,
    field: profile.field,
    side,
    raw,
    value,
    tokens: tokensOf(value),
    digits: digitViewOf(raw, value),
    resolved_vendor_id: resolvedVendorId,
    trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a result
// ─────────────────────────────────────────────────────────────────────────────

/** The steps that actually changed something, in the order they ran. May repeat. */
export function appliedSteps(result: NormalisationResult): readonly StepId[] {
  return result.trace.filter((t) => t.applied).map((t) => t.step);
}

/** Every change, flattened, in the order it happened. */
export function allChanges(result: NormalisationResult): readonly StepChange[] {
  return result.trace.flatMap((t) => t.changes);
}

/** Steps that were enabled, ran, and would have emptied the value. Empty in a healthy run. */
export function suppressedSteps(result: NormalisationResult): readonly StepId[] {
  return result.trace.filter((t) => t.suppressed).map((t) => t.step);
}

/** The feedback rule that moved the value, when one did. Last writer wins. */
export function citedFeedbackRuleId(result: NormalisationResult): FeedbackRuleId | null {
  let found: FeedbackRuleId | null = null;
  for (const c of allChanges(result)) if (c.feedback_rule_id !== null) found = c.feedback_rule_id;
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// The rule string
// ─────────────────────────────────────────────────────────────────────────────

const RULE_SHAPE = /^([^/\s]+)\/([a-z_]+):([a-z_+]*)$/;

/**
 * `<profile_id>/<field>:<step>+<step>+...`
 *
 * The contract types `NormalisationNote.rule` as a plain string, so this module fixes a
 * grammar for it and ships the parser beside the formatter. A reviewer reads a citation;
 * a downstream consumer parses one. Neither reads prose.
 */
export function formatRule(descriptor: RuleDescriptor): string {
  const seen = new Set<StepId>();
  const steps: StepId[] = [];
  for (const s of descriptor.steps) {
    if (seen.has(s)) continue;
    seen.add(s);
    steps.push(s);
  }
  return `${descriptor.profile_id}/${descriptor.field}:${steps.join('+')}`;
}

/** Inverse of `formatRule`. Returns null for anything that is not a well-formed rule. */
export function parseRule(rule: string): RuleDescriptor | null {
  const m = RULE_SHAPE.exec(rule);
  if (m === null) return null;
  const profileId = m[1];
  const field = m[2];
  const stepList = m[3];
  if (profileId === undefined || field === undefined || stepList === undefined) return null;
  if (!(NORMALISE_FIELDS as readonly string[]).includes(field)) return null;

  const steps: StepId[] = [];
  for (const part of stepList.split('+')) {
    if (part === '') continue;
    if (!(STEP_IDS as readonly string[]).includes(part)) return null;
    steps.push(part as StepId);
  }
  return { profile_id: profileId, field: field as NormaliseField, steps };
}

/** The structured form of a result's rule, without going through the string. */
export function describeRule(result: NormalisationResult): RuleDescriptor {
  return {
    profile_id: result.profile_id,
    field: result.field,
    steps: appliedSteps(result),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The contract projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The reviewer-facing note, exactly as `lib/types.ts` defines it.
 *
 * Null when nothing changed: an evidence row that claims a normalisation happened when the
 * value is untouched trains a reviewer to stop reading the field.
 */
export function toNote(result: NormalisationResult): NormalisationNote | null {
  if (result.value === result.raw) return null;
  return {
    side: result.side,
    raw_value: result.raw,
    normalised_value: result.value,
    rule: formatRule(describeRule(result)),
    feedback_rule_id: citedFeedbackRuleId(result),
  };
}
