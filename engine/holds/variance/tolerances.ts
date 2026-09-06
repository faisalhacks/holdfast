/**
 * W05b — the variance family's named quantities.
 *
 * Every comparison this family makes is against a TYPED, NAMED tolerance declared here,
 * never against a bare number sitting in an `if`. That is the whole point of the
 * `Tolerance` union in the contract: a tolerance you can name is a tolerance you can
 * record a change to.
 *
 * NONE of these may be widened to make a variance pass. If a delta does not clear one of
 * these, the answer is a typed hold — the reviewer then widens the tolerance as a recorded
 * DECISION (`ToleranceChange`, reviewer + reason + affected holds), or does not. Editing a
 * value here to turn a hold into a clear is quarantine Q2, the same move the incumbent ERP
 * calls "change the tolerance". `eval/thresholds.json` is frozen against exactly this and
 * this file is held to the same standard.
 *
 * Percentages are carried in BASIS POINTS as the arithmetic source of truth, so every
 * comparison stays in integers and no monetary value ever meets a float. The `Tolerance`
 * objects are derived from them for the record.
 */

import type { Paise, Tolerance } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Tax — the two tolerance TYPES, which are two different holds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Percentage tolerance on the tax amount, against the tax implied by the statutory rate.
 * A breach of THIS is `tax_variance`.
 */
export const TAX_RATE_TOLERANCE_BASIS_POINTS = 100;

/**
 * Absolute tolerance on the tax amount, in paise. Rs 100.
 * A breach of THIS is `tax_amount_range` — a different Oracle hold code, deliberately not
 * collapsed into the percentage one. A tax head that is 0.2% wrong on a two-crore invoice
 * breaches nothing proportionally and is still six hundred rupees of input credit the tax
 * team has to defend, which is why Oracle carries both and so do we.
 */
export const TAX_AMOUNT_RANGE_PAISE = 10000;

export const TAX_RATE_TOLERANCE: Tolerance = {
  kind: 'percentage',
  value: TAX_RATE_TOLERANCE_BASIS_POINTS / 10000,
};

export const TAX_AMOUNT_RANGE_TOLERANCE: Tolerance = {
  kind: 'absolute_paise',
  value: TAX_AMOUNT_RANGE_PAISE as Paise,
};

/**
 * Place-of-supply allocation is exact. A supply is either intra-state (CGST + SGST) or
 * inter-state (IGST); there is no tolerance band between them, because the two are
 * different ledgers filed in different returns.
 */
export const TAX_ALLOCATION_TOLERANCE: Tolerance = { kind: 'exact' };

/**
 * CGST and SGST are halves of one rate, so an odd tax total splits one paise unevenly.
 * That single paise is arithmetic, not an allocation error. Anything wider is.
 */
export const HALF_SPLIT_ROUNDING_PAISE = 1;

export const HALF_SPLIT_ROUNDING_ALLOWANCE: Tolerance = {
  kind: 'absolute_paise',
  value: HALF_SPLIT_ROUNDING_PAISE as Paise,
};

/** Statutory GST rates, as whole percents. Not a tolerance — the set of legal answers. */
export const GST_RATE_PERCENTS: readonly number[] = Object.freeze([0, 5, 12, 18, 28]);

// ─────────────────────────────────────────────────────────────────────────────
// Distribution and period
// ─────────────────────────────────────────────────────────────────────────────

/** gross must equal net + tax. An accounting identity has no tolerance band. */
export const DISTRIBUTION_TOTAL_TOLERANCE: Tolerance = { kind: 'exact' };

/** The booked period either is the document's own period or it is not. */
export const PERIOD_ALIGNMENT_TOLERANCE: Tolerance = { kind: 'exact' };

// ─────────────────────────────────────────────────────────────────────────────
// Settled amount
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A settled amount is compared EXACTLY against the invoice gross. There is deliberately no
 * "small variance auto-write-off" band here: a sub-rupee delta still raises a hold, it just
 * raises one that names `rounding` as the cause. Naming the cause is the product; silently
 * absorbing the delta is what we refuse to do.
 */
export const SETTLED_AMOUNT_TOLERANCE: Tolerance = { kind: 'exact' };

/**
 * NOT a tolerance — a candidate-quality ceiling, and it only ever SUPPRESSES a hold of
 * ours in favour of a stronger one from another family.
 *
 * Beyond 15% of gross the pairing itself is not credible, and the honest hold is
 * `matching` ("no payment matched within tolerance"), which this family does not own.
 * Calling a 40% gap a price variance would dress a failed match up as a priced one.
 */
export const SETTLEMENT_ATTRIBUTION_CEILING_BASIS_POINTS = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// Cause attribution — the evidence each named cause requires
// ─────────────────────────────────────────────────────────────────────────────

/** Sub-rupee. A delta smaller than the smallest coin is arithmetic, not a dispute. */
export const ROUNDING_CEILING_PAISE = 100;

/**
 * A bank charge is an absolute fee, not a proportion of the invoice, and it is levied with
 * GST on top. Rs 1,000 is the ceiling above which a "fee" is something else.
 */
export const BANK_CHARGE_CEILING_PAISE = 100000;

/** Bank charges carry GST at 18%. The gross-up must divide exactly, or it is not a fee. */
export const BANK_CHARGE_GST_BASIS_POINTS = 1800;

/**
 * Statutory TDS rates, basis points: 194C at 1% and 2%, 194H at 5%, 194J at 10%.
 * Withholding is computed on the TAXABLE VALUE — net, excluding GST. That base is the
 * discriminator against an early-payment discount, which is taken on the gross.
 */
export const TDS_RATE_BASIS_POINTS: readonly number[] = Object.freeze([100, 200, 500, 1000]);

/** Settlement-discount rates seen in Indian trade terms, basis points. Taken on gross. */
export const EARLY_PAYMENT_DISCOUNT_BASIS_POINTS: readonly number[] = Object.freeze([
  100, 150, 200, 250, 300,
]);
