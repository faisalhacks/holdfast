/**
 * W05b — classifying a settlement delta by CAUSE.
 *
 * A delta with a named cause is a different reviewer decision from an unexplained one.
 * "Short by a bank charge" goes to treasury and is written off; "short by 10% of the
 * taxable value" is TDS and goes to the tax team with a certificate to chase; "unexplained"
 * goes to the vendor. Same rupees, three different people, and the routing is the product.
 *
 * Every attribution here is ARITHMETIC, not narrative. A cause is claimed only when the
 * delta reconciles exactly to a rule that produces it — the right base, the right rate, to
 * the paise. Nothing is inferred from the bank narration, because a narration that says
 * "CHRG" is a string a vendor's bank chose and a delta that divides exactly by 1.18 is not.
 * When no rule reconciles, the cause is `unattributed`, which is an answer and not a
 * failure: an honest "we do not know why" is what sends the case to a human.
 *
 * `partial_settlement` is never returned. A residual left after part-paying an invoice is
 * `cardinality_residual`, which belongs to W05c; this family only ever looks at a delta on
 * a settlement that claimed to be complete.
 */

import type { DeltaCause, Invoice, IsoDate, Paise } from '@/lib/types';
import {
  BANK_CHARGE_CEILING_PAISE,
  BANK_CHARGE_GST_BASIS_POINTS,
  EARLY_PAYMENT_DISCOUNT_BASIS_POINTS,
  ROUNDING_CEILING_PAISE,
  TDS_RATE_BASIS_POINTS,
} from './tolerances';

/**
 * What the classifier concluded and what it rested on. `rate_basis_points` is the rate the
 * attribution reconciled against, so a reviewer can redo the multiplication by hand;
 * `base_paise` is the amount that rate was applied to, which is the whole discriminator
 * between withholding (net) and a settlement discount (gross).
 */
export interface DeltaAttribution {
  readonly cause: DeltaCause;
  /** payment minus invoice gross, signed. Negative means the vendor was paid short. */
  readonly delta_paise: Paise;
  readonly rate_basis_points: number | null;
  readonly base_paise: Paise | null;
}

/** Applies a basis-point rate to an integer base and rounds to whole paise. */
function applyRate(basePaise: number, basisPoints: number): number {
  return Math.round((basePaise * basisPoints) / 10000);
}

/**
 * A bank fee is an absolute charge grossed up by GST at 18%. The test is that the gross-up
 * INVERTS exactly to a whole number of rupees: Rs 236.00 is Rs 200 plus 18%, Rs 590.00 is
 * Rs 500 plus 18%. A proportional deduction almost never lands on that lattice, which is
 * what makes this a cheap and specific test rather than a size heuristic.
 */
function reconcilesAsBankCharge(shortfallPaise: number): number | null {
  if (shortfallPaise <= 0 || shortfallPaise > BANK_CHARGE_CEILING_PAISE) return null;
  const scaled = shortfallPaise * 10000;
  const divisor = 10000 + BANK_CHARGE_GST_BASIS_POINTS;
  if (scaled % divisor !== 0) return null;
  const feePaise = scaled / divisor;
  // A bank prices a fee in whole rupees. A "fee" of Rs 12.37 is something else.
  if (feePaise % 100 !== 0) return null;
  return feePaise;
}

/**
 * Classifies a settlement delta.
 *
 * Order matters and is by strength of evidence, not by convenience:
 *   1. sub-rupee            — smaller than the smallest coin, so it is arithmetic
 *   2. bank charge          — inverts exactly to a whole-rupee fee plus 18% GST
 *   3. TDS                  — a statutory rate applied to the TAXABLE value (net)
 *   4. early-payment discount — a trade-terms rate on GROSS, and paid before the due date
 *   5. unattributed         — nothing reconciles, and we say so
 *
 * Steps 3 and 4 are separated by their BASE, not by their rate: withholding is computed on
 * the value excluding GST because that is the statutory base, and a settlement discount is
 * taken on the invoice total because that is what the buyer would otherwise have paid.
 * Two rules with the same rate and different bases give different numbers, and the delta
 * matches one of them or neither.
 */
export function classifyDelta(
  invoice: Invoice,
  deltaPaise: Paise,
  settledOn: IsoDate | null
): DeltaAttribution {
  const delta: number = deltaPaise;
  const shortfall = -delta;
  const netMagnitude = Math.abs(invoice.net_paise);
  const grossMagnitude = Math.abs(invoice.gross_paise);

  const unattributed: DeltaAttribution = {
    cause: 'unattributed',
    delta_paise: deltaPaise,
    rate_basis_points: null,
    base_paise: null,
  };

  if (delta === 0) return unattributed;

  if (Math.abs(delta) < ROUNDING_CEILING_PAISE) {
    return {
      cause: 'rounding',
      delta_paise: deltaPaise,
      rate_basis_points: null,
      base_paise: null,
    };
  }

  const fee = reconcilesAsBankCharge(shortfall);
  if (fee !== null) {
    return {
      cause: 'bank_charge',
      delta_paise: deltaPaise,
      rate_basis_points: BANK_CHARGE_GST_BASIS_POINTS,
      base_paise: fee as Paise,
    };
  }

  if (shortfall > 0 && netMagnitude > 0) {
    for (const basisPoints of TDS_RATE_BASIS_POINTS) {
      if (applyRate(netMagnitude, basisPoints) === shortfall) {
        return {
          cause: 'tds_withholding',
          delta_paise: deltaPaise,
          rate_basis_points: basisPoints,
          base_paise: invoice.net_paise,
        };
      }
    }
  }

  // ISO `YYYY-MM-DD` orders lexicographically, so no date parsing is needed to ask
  // whether the money moved before it had to.
  const paidEarly =
    settledOn !== null && invoice.due_date !== null && settledOn < invoice.due_date;

  if (shortfall > 0 && grossMagnitude > 0 && paidEarly) {
    for (const basisPoints of EARLY_PAYMENT_DISCOUNT_BASIS_POINTS) {
      if (applyRate(grossMagnitude, basisPoints) === shortfall) {
        return {
          cause: 'early_payment_discount',
          delta_paise: deltaPaise,
          rate_basis_points: basisPoints,
          base_paise: invoice.gross_paise,
        };
      }
    }
  }

  return unattributed;
}

/**
 * The short fixed clause for each cause. Fixed phrases, one per cause, chosen so the queue
 * reads as a decision list rather than a diff. Not generated prose and not a template with
 * numbers baked in — the numbers travel in the attribution, where they can be checked.
 */
export const CAUSE_CLAUSES: Readonly<Record<DeltaCause, string>> = Object.freeze({
  bank_charge: 'Settled short by a bank charge and its GST.',
  early_payment_discount: 'Settled short by an early-payment discount taken before the due date.',
  tds_withholding: 'Settled short by tax withheld at source on the taxable value.',
  rounding: 'Settled short by a sub-rupee rounding difference.',
  partial_settlement: 'Settled in part; a residual remains.',
  unattributed: 'Settled amount differs from the invoice with no attributable cause.',
});

/** The hold `reason` for each cause. Short, fixed, one per cause. */
export const CAUSE_REASONS: Readonly<Record<DeltaCause, string>> = Object.freeze({
  bank_charge: 'Amount variance attributed to a bank charge.',
  early_payment_discount: 'Amount variance attributed to an early-payment discount.',
  tds_withholding: 'Amount variance attributed to TDS withholding.',
  rounding: 'Amount variance attributed to rounding.',
  partial_settlement: 'Amount variance attributed to a partial settlement.',
  unattributed: 'Amount variance with no attributable cause.',
});
