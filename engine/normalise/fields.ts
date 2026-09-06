// W04a — field and record entry points.
//
// THE ENGINE NORMALISES FROM THE RAW COLUMNS. `Invoice` carries `normalised_reference` and
// `Vendor` carries `normalised_name`; `Payment` carries `narration_normalised`,
// `reference_extracted` and `vendor_name_extracted`. This module reads NONE of them, and
// that is the single most important line in the file.
//
// Those columns were written by whatever produced the dataset. An engine that consumes them
// is measuring that producer's normalisation and reporting it as its own — the headline
// number becomes an artefact of a shared assumption rather than a measurement of this
// system. So the inputs here are `vendor_name_raw`, `reference`, `purchase_order_reference`
// and `narration_raw`, and nothing else.
//
// The same consequence, stated the other way: both sides go through the SAME profiles.
// An invoice vendor name and the vendor residue recovered from a bank narration are
// canonicalised by `vendor.v1` in both cases. Normalising the two sides differently is how
// a matcher flatters itself.

import type {
  Invoice,
  InvoiceId,
  NormalisationNote,
  Payment,
  PaymentId,
  Side,
  VendorId,
} from '@/lib/types';
import type { AliasKeyFn } from './tables';
import { DEFAULT_TABLES } from './tables';
import { DEFAULT_STEPS } from './steps';
import { DEFAULT_PROFILES, withStepEnabled } from './profiles';
import { normalise, toNote } from './pipeline';
import {
  classifyTokens,
  findDisplacedTokens,
  identifierCandidateTokens,
  recoverReferences,
  segmentValue,
  vendorResidueTokens,
} from './tokens';
import type {
  DisplacementFinding,
  NormalisationProfile,
  NormalisationResult,
  NormalisationTables,
  NormaliseField,
  ProfileSet,
  ReferenceCandidate,
  ReferenceRejectionFinding,
  StepId,
  StepRegistry,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything a caller may vary, in one bag. A search agent constructs one of these and
 * passes it down; nothing in this module reads configuration from anywhere else.
 */
export interface NormaliseConfig {
  readonly profiles: ProfileSet;
  readonly steps: StepRegistry;
  readonly tables: NormalisationTables;
  /** Minimum length for a purely numeric token to count as reference-shaped. */
  readonly minReferenceLength: number;
  /**
   * Assemble delimiter-joined fragments of a narration back into one reference candidate
   * before normalising it. ON by default — see `recoverReferences`. Off, the module falls
   * back to offering every fragment separately, which is what a sweep compares against.
   */
  readonly assembleReferenceRuns: boolean;
}

export const DEFAULT_CONFIG: NormaliseConfig = {
  profiles: DEFAULT_PROFILES,
  steps: DEFAULT_STEPS,
  tables: DEFAULT_TABLES,
  minReferenceLength: 3,
  assembleReferenceRuns: true,
};

/** Pure override. Returns a new config; the input is never mutated. */
export function withConfig(
  base: NormaliseConfig,
  overrides: Partial<NormaliseConfig>,
): NormaliseConfig {
  return { ...base, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// One field
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A canonicalised field, the evidence of how it got that way, and any token in it that
 * belongs somewhere else.
 */
export interface NormalisedField {
  readonly result: NormalisationResult;
  /** The contract projection, ready to drop into an `EvidenceBase`. Null when unchanged. */
  readonly note: NormalisationNote | null;
  readonly displaced: readonly DisplacementFinding[];
}

/**
 * Displacement is judged on a LIGHTLY folded value — characters, case, punctuation and
 * whitespace only. Running the full profile first would let the noise and prefix tables
 * consume the very tokens the scan exists to find, so the scan would report a clean field
 * precisely when the field was dirtiest.
 */
const SCAN_ORDER: readonly StepId[] = [
  'unicode_fold',
  'case_fold',
  'punctuation_strip',
  'whitespace_collapse',
];

function scanProfileFor(field: NormaliseField): NormalisationProfile {
  return { id: 'scan.v1', field, order: SCAN_ORDER, enabled: {} };
}

/**
 * Characters and case only — the punctuation is left ON.
 *
 * `segmentValue` reads the delimiters, so the one thing it must not be handed is a line
 * whose delimiters have already been turned into spaces. `unicode_fold` still runs, because
 * an en dash and a hyphen are the same delimiter and a bank export emits both.
 */
const FOLD_ORDER: readonly StepId[] = ['unicode_fold', 'case_fold'];

function foldProfileFor(field: NormaliseField): NormalisationProfile {
  return { id: 'fold.v1', field, order: FOLD_ORDER, enabled: {} };
}

export function normaliseField(
  field: NormaliseField,
  raw: string,
  side: Side,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedField {
  const { profiles, steps, tables, minReferenceLength } = config;
  const result = normalise(raw, { profile: profiles[field], side, steps, tables });
  const scan = normalise(raw, { profile: scanProfileFor(field), side, steps, tables });
  const displaced = findDisplacedTokens(field, classifyTokens(scan.tokens, tables), {
    minReferenceLength,
  });
  return { result, note: toNote(result), displaced };
}

export function normaliseVendorName(
  raw: string,
  side: Side,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedField {
  return normaliseField('vendor', raw, side, config);
}

export function normaliseReference(
  raw: string,
  side: Side,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedField {
  return normaliseField('reference', raw, side, config);
}

export function normaliseTaxIdentifier(
  raw: string,
  side: Side,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedField {
  return normaliseField('identifier', raw, side, config);
}

// ─────────────────────────────────────────────────────────────────────────────
// Narration — ingestion normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a bank narration line yields once it is taken apart. Every member is a candidate,
 * plural where the line offers more than one: choosing between them requires the other
 * side of the reconciliation, which this module does not have and does not want.
 */
export interface NarrationExtraction {
  /** The whole line through `narration.v1`. Kept so the reviewer sees the original. */
  readonly narration: NormalisedField;
  /** The word residue through `vendor.v1` — the same profile the invoice side uses. */
  readonly vendor: NormalisedField;
  /** Reference-shaped tokens, each through `reference.v1`. Ordered as they appeared. */
  readonly references: readonly NormalisedField[];
  /**
   * HOW each entry of `references` was recovered — same length, same order, index for
   * index. A consumer that wants to weigh an intact `INV/2026/01640` differently from a
   * bare `2026` reads `recoveries[i].kind` and has its answer without re-parsing anything.
   */
  readonly recoveries: readonly ReferenceCandidate[];
  /**
   * Fragments that looked reference-shaped and were refused, with the reason. A rail
   * tracking number, a masked account and a date are the three that matter, and a line
   * whose only numerals are one of those is exactly the `no_reference` case.
   */
  readonly rejected: readonly ReferenceRejectionFinding[];
  /** Identifier-shaped tokens, each through `identifier.v1`. */
  readonly identifiers: readonly NormalisedField[];
}

/**
 * Ingestion normalisation: messy narration in, candidate vendor and reference tokens out.
 * Deterministic, from `narration_raw` alone. No generated call sits anywhere on this path.
 */
export function extractFromNarration(
  raw: string,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NarrationExtraction {
  const side: Side = 'payment';
  const { steps, tables, minReferenceLength } = config;

  const narration = normaliseField('narration', raw, side, config);

  // Classify on the lightly folded line, for the same reason the displacement scan does:
  // the boilerplate tables must not be able to eat the evidence before it is read.
  const scan = normalise(raw, { profile: scanProfileFor('narration'), side, steps, tables });
  const classified = classifyTokens(scan.tokens, tables);

  const residue = vendorResidueTokens(classified).join(' ');
  const vendor = normaliseField('vendor', residue, side, config);

  // Reference recovery reads the DELIMITERS, so it works from the folded line rather than
  // the scan: by the time punctuation has become whitespace, `RCT-2026-01-472` and
  // `SI4559,TX.02973,06405` are the same shape, and they are not the same evidence.
  const folded = normalise(raw, { profile: foldProfileFor('narration'), side, steps, tables });
  const recovery = recoverReferences(segmentValue(folded.value, tables), tables, {
    minReferenceLength,
    assembleRuns: config.assembleReferenceRuns,
  });

  const references = recovery.candidates.map((c) =>
    normaliseField('reference', c.token, side, config),
  );
  const identifiers = identifierCandidateTokens(classified).map((t) =>
    normaliseField('identifier', t, side, config),
  );

  return {
    narration,
    vendor,
    references,
    recoveries: recovery.candidates,
    rejected: recovery.rejected,
    identifiers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An invoice's text fields, canonicalised. No monetary field appears here: money is
 * integer paise and needs no normalisation, and a normaliser that touched an amount would
 * be a rounding bug with a plausible face.
 */
export interface NormalisedInvoice {
  readonly invoice_id: InvoiceId;
  readonly vendor_id: VendorId;
  readonly vendor: NormalisedField;
  readonly reference: NormalisedField;
  readonly purchase_order_reference: NormalisedField | null;
}

export function normaliseInvoice(
  invoice: Invoice,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedInvoice {
  const side: Side = 'invoice';
  return {
    invoice_id: invoice.id,
    vendor_id: invoice.vendor_id,
    vendor: normaliseVendorName(invoice.vendor_name_raw, side, config),
    reference: normaliseReference(invoice.reference, side, config),
    purchase_order_reference:
      invoice.purchase_order_reference === null
        ? null
        : normaliseReference(invoice.purchase_order_reference, side, config),
  };
}

/**
 * A payment line, canonicalised from `narration_raw` and nothing else. The extracted
 * columns on the record are ignored on purpose — see the note at the top of this file.
 */
export interface NormalisedPayment {
  readonly payment_id: PaymentId;
  readonly extraction: NarrationExtraction;
}

export function normalisePaymentLine(
  payment: Payment,
  config: NormaliseConfig = DEFAULT_CONFIG,
): NormalisedPayment {
  return {
    payment_id: payment.id,
    extraction: extractFromNarration(payment.narration_raw, config),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alias keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The key an alias table for `field` must be built under: the profile's own output with
 * `alias_map` switched off, since a table cannot be consulted while it is being built.
 *
 * Pass this to `aliasTableFromVendors` or `aliasTableFromFeedbackRules` so the table and
 * the lookup agree by construction rather than by two people remembering the same rule.
 *
 * Side is fixed at `invoice` because an alias key must not depend on which side asked.
 */
export function aliasKeyFor(
  field: NormaliseField,
  config: NormaliseConfig = DEFAULT_CONFIG,
): AliasKeyFn {
  const base = config.profiles[field];
  const profile = base.order.includes('alias_map')
    ? withStepEnabled(base, `${base.id}+no-alias`, 'alias_map', false)
    : base;
  return (raw: string) =>
    normalise(raw, {
      profile,
      side: 'invoice',
      steps: config.steps,
      tables: config.tables,
    }).value;
}
