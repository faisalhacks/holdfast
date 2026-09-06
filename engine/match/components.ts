// W04b — the four components.
//
// Amount, reference, date and vendor. Each turns one comparison into a score in [0, 1]
// using a curve that is entirely declared in `MatchSpec`, and each returns the RAW OBSERVED
// value beside the score so the evidence row and the composite cannot drift apart.
//
// Every curve here is MONOTONE in the thing it measures: a bigger amount delta never scores
// higher, a lower similarity never scores higher, a later payment never scores higher than a
// nearer one. That is not a nicety. It is what lets a reviewer look at two rows, see that
// one is closer on every field, and know without reading this file that it must also rank
// above the other. A non-monotone scorer is unauditable at a glance, and a scorer nobody can
// audit at a glance gets rubber-stamped.
//
// A model's own stated certainty is not among the inputs. There are four of them and they
// are all measurements of the two records.

import type {
  Days,
  DeltaCause,
  FieldPath,
  NormalisationNote,
  Paise,
  Ratio,
  Tolerance,
} from '@/lib/types';
import { absPaise, asPaise, deltaPaise, maxPaise, scalePaise, sumPaise } from './money';
import { dayDelta } from './dates';
import { clampRatio, compare, despace, digitAgreement } from './similarity';
import type { MatchPolicy } from './policy';
import type { MatchSpec } from './spec';
import type { PreparedInvoice, PreparedPayment, ReferenceView } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared shape
// ─────────────────────────────────────────────────────────────────────────────

function linear(from: number, to: number, at: number, span: number): Ratio {
  if (span <= 0) return clampRatio(to);
  return clampRatio(from + (to - from) * (at / span));
}

function applyFloor(observed: Ratio, floor: Ratio, rescale: boolean): Ratio {
  if (observed < floor) return 0;
  if (!rescale) return clampRatio(observed);
  if (floor >= 1) return observed >= 1 ? 1 : 0;
  return clampRatio((observed - floor) / (1 - floor));
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount
// ─────────────────────────────────────────────────────────────────────────────

export interface AmountOutcome {
  readonly score: Ratio;
  /** Settled sum minus invoice gross, signed, in paise. */
  readonly delta: Paise;
  readonly settled: Paise;
  readonly cause: DeltaCause;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
}

/** The paise band inside which a delta is still called near. Declared two ways; wider wins. */
export function nearBand(gross: Paise, spec: MatchSpec): Paise {
  return maxPaise(spec.amount.near_paise, scalePaise(gross, spec.amount.near_ratio));
}

function zeroBand(gross: Paise, spec: MatchSpec): Paise {
  return maxPaise(nearBand(gross, spec), scalePaise(gross, spec.amount.zero_ratio));
}

/**
 * Money is integer paise throughout. The only float in this function is the score itself,
 * which is a proportion and not a quantity of money.
 *
 * A payment LARGER than the invoice is multiplied down. Settlement net of a bank charge, net
 * of withholding or net of a discount explains a shortfall; nothing routine explains an
 * excess, and an excess is where duplicate payments live.
 */
export function amountComponent(
  gross: Paise,
  payments: readonly PreparedPayment[],
  spec: MatchSpec,
): AmountOutcome {
  const settled = sumPaise(payments.map((p) => p.amount_paise));
  const delta = deltaPaise(gross, settled);
  const magnitude = absPaise(delta);
  const near = nearBand(gross, spec);
  const zero = zeroBand(gross, spec);
  const exact = spec.amount.exact_paise;

  let base: Ratio;
  if (magnitude <= exact) base = 1;
  else if (magnitude <= near) base = linear(1, spec.amount.near_score, magnitude - exact, near - exact);
  else if (magnitude <= zero) base = linear(spec.amount.near_score, 0, magnitude - near, zero - near);
  else base = 0;

  const score = delta > 0 ? clampRatio(base * spec.amount.over_multiplier) : base;

  return {
    score,
    delta,
    settled,
    cause: attributeDelta(gross, delta, spec),
    tolerance: { kind: 'absolute_paise', value: near },
    within_tolerance: magnitude <= near,
  };
}

/**
 * What a paise-level rule can honestly say about a delta.
 *
 * W05b owns delta attribution proper — it has the vendor's history and the tax breakdown,
 * which this module does not. This exists because `AmountEvidence.cause` is not nullable and
 * every candidate has to carry something. It claims only what integer arithmetic supports,
 * and a zero delta is reported `unattributed` because there is nothing to attribute:
 * inventing a cause for a zero teaches a reviewer to stop reading the field.
 */
export function attributeDelta(gross: Paise, delta: Paise, spec: MatchSpec): DeltaCause {
  const a = spec.attribution;
  const magnitude = absPaise(delta);
  if (magnitude === 0) return 'unattributed';
  if (magnitude <= a.rounding_max_paise) return 'rounding';
  // Only a SHORTFALL is attributable. An excess is an overpayment and is left unexplained
  // on purpose, because a plausible explanation attached to an overpayment is how a
  // duplicate payment gets waved through.
  if (delta > 0) return 'unattributed';
  for (const rate of a.tds_ratios) {
    const expected = scalePaise(gross, rate);
    if (absPaise(asPaise(magnitude - expected)) <= a.tds_tolerance_paise) return 'tds_withholding';
  }
  if (magnitude <= a.bank_charge_max_paise) return 'bank_charge';
  if (magnitude <= scalePaise(gross, a.discount_max_ratio)) return 'early_payment_discount';
  return 'partial_settlement';
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceOutcome {
  readonly score: Ratio;
  /** The token-set ratio of the winning pair, before the floor and the weights. */
  readonly observed: Ratio;
  /** Canonicalised values equal, on both sides, and non-empty. */
  readonly exact: boolean;
  /**
   * The DIGIT view carried this component past what the token view could support.
   *
   * `TX/01021` and `tx01021` are one document under two conventions: the token similarity is
   * below the floor and the digit sequences are identical. The evidence row reports the token
   * similarity, because that is what the contract's `ReferenceEvidence.delta` is defined to
   * be, so `within_tolerance` on that row is honestly false. This flag is why no
   * `reference_mismatch` conflict is raised anyway.
   */
  readonly carried: boolean;
  readonly invoice_value: string | null;
  readonly payment_value: string | null;
  readonly displaced: boolean;
  readonly displaced_from: FieldPath | null;
  readonly note: NormalisationNote | null;
  /** True when one side offered no admissible reference at all. */
  readonly absent: boolean;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
}

/** Which reference sources this spec admits. Declared data, not a hard-coded preference. */
export function admissibleReferences(
  views: readonly ReferenceView[],
  spec: MatchSpec,
): readonly ReferenceView[] {
  return views.filter((v) => {
    if (v.value === '') return false;
    if (v.source === 'purchase_order') return spec.reference.include_purchase_order;
    if (v.source === 'displaced_from_vendor') return spec.reference.include_displaced;
    return true;
  });
}

function absentReference(spec: MatchSpec): ReferenceOutcome {
  return {
    score: clampRatio(spec.reference.absent_score),
    observed: 0,
    exact: false,
    carried: false,
    invoice_value: null,
    payment_value: null,
    displaced: false,
    displaced_from: null,
    note: null,
    absent: true,
    tolerance: { kind: 'similarity', value: spec.reference.floor },
    within_tolerance: false,
  };
}

/**
 * The best pairing of one admissible invoice reference against one admissible payment
 * reference. Every combination is tried; the winner is chosen BY SCORE and never by
 * position, because picking a token before comparing it is how a matcher commits to the
 * wrong one confidently.
 */
export function referenceComponentFor(
  invoice: PreparedInvoice,
  payment: PreparedPayment,
  spec: MatchSpec,
): ReferenceOutcome {
  const left = admissibleReferences(invoice.references, spec);
  const right = admissibleReferences(payment.references, spec);
  if (left.length === 0 || right.length === 0) return absentReference(spec);

  const s = spec.reference;
  let best: ReferenceOutcome = absentReference(spec);
  let bestScore = -1;

  for (const a of left) {
    for (const b of right) {
      const observed = compare(s.comparator, a.value, b.value);
      const tokenPart = applyFloor(observed, s.floor, s.rescale_above_floor);
      const digitPart = digitAgreement(a.digits, b.digits, s);
      const displaced = a.displaced || b.displaced;
      // Strong digit agreement is its own claim, not a fraction of one: two references whose
      // digits match in order are the same document written under two conventions, and the
      // weighted sum alone would cap that evidence at `digit_weight`.
      const weighted = s.token_weight * tokenPart + s.digit_weight * digitPart;
      const carry = digitPart >= s.digit_carry_min ? digitPart * s.digit_carry_multiplier : 0;
      const combined = clampRatio(
        Math.max(weighted, carry) * (displaced ? s.displaced_multiplier : 1),
      );
      // Ties go to the EXACT pair. Token-set similarity reaches 1 whenever one reference's
      // tokens are a subset of the other's, so a merely-contained pair can draw level with a
      // genuinely equal one; citing the contained pair would mean `deterministic_exact` was
      // decided by which combination the loop happened to reach first.
      const equal = a.value === b.value;
      if (combined < bestScore) continue;
      if (combined === bestScore && !(equal && !best.exact)) continue;
      bestScore = combined;
      best = {
        score: combined,
        observed,
        exact: equal,
        carried: carry > 0,
        invoice_value: a.value,
        payment_value: b.value,
        displaced,
        displaced_from: a.displaced ? a.displaced_from : b.displaced_from,
        note: a.note ?? b.note,
        absent: false,
        tolerance: { kind: 'similarity', value: s.floor },
        within_tolerance: equal || observed >= s.floor,
      };
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor
// ─────────────────────────────────────────────────────────────────────────────

export interface VendorOutcome {
  readonly score: Ratio;
  readonly observed: Ratio;
  readonly invoice_value: string | null;
  readonly payment_value: string | null;
  readonly note: NormalisationNote | null;
  readonly absent: boolean;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
}

/**
 * Both sides have been through `vendor.v1`. The ledger's name and the residue left after a
 * bank narration's rail codes are stripped are canonicalised identically, which is the only
 * way the comparison means anything.
 *
 * When both sides carry the SAME `VendorId` the identity score is awarded outright: an
 * alias table that pinned an identity, or a feed that carried one, is stronger evidence than
 * any string similarity and should not be discounted by a truncated spelling.
 */
export function vendorComponentFor(
  invoice: PreparedInvoice,
  payment: PreparedPayment,
  spec: MatchSpec,
): VendorOutcome {
  const s = spec.vendor;
  const a = invoice.vendor;
  const b = payment.vendor;

  if (a.vendor_id !== null && b.vendor_id !== null && a.vendor_id === b.vendor_id) {
    return {
      score: clampRatio(s.identity_score),
      observed: 1,
      invoice_value: a.value,
      payment_value: b.value,
      note: a.note ?? b.note,
      absent: false,
      tolerance: { kind: 'similarity', value: s.floor },
      within_tolerance: true,
    };
  }

  if (a.value === '' || b.value === '') {
    return {
      score: clampRatio(s.absent_score),
      observed: 0,
      invoice_value: a.value === '' ? null : a.value,
      payment_value: b.value === '' ? null : b.value,
      note: a.note ?? b.note,
      absent: true,
      tolerance: { kind: 'similarity', value: s.floor },
      within_tolerance: false,
    };
  }

  let observed = 0;
  for (const view of s.views) {
    if (view.multiplier <= 0) continue;
    const left = view.despace ? despace(a.value) : a.value;
    const right = view.despace ? despace(b.value) : b.value;
    const seen = clampRatio(compare(view.comparator, left, right) * view.multiplier);
    if (seen > observed) observed = seen;
  }

  return {
    score: applyFloor(observed, s.floor, s.rescale_above_floor),
    observed,
    invoice_value: a.value,
    payment_value: b.value,
    note: a.note ?? b.note,
    absent: false,
    tolerance: { kind: 'similarity', value: s.floor },
    within_tolerance: observed >= s.floor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Date
// ─────────────────────────────────────────────────────────────────────────────

export interface DateOutcome {
  readonly score: Ratio;
  /** Payment date minus the anchor date, in whole days. Signed. */
  readonly delta: Days;
  readonly payment_date: string | null;
  /** The invoice-side date actually measured from, and the field it came from. */
  readonly anchor_date: string | null;
  readonly anchor_path: FieldPath;
  readonly absent: boolean;
  readonly tolerance: Tolerance;
  readonly within_tolerance: boolean;
}

const DATE_PATHS = Object.freeze({
  invoice: 'invoice.invoice_date' as FieldPath,
  due: 'invoice.due_date' as FieldPath,
  received: 'invoice.received_date' as FieldPath,
});

/** The invoice-side date the spec says to measure from, falling back to the invoice date. */
export function dateAnchorOf(
  invoice: PreparedInvoice,
  spec: MatchSpec,
): { index: number | null; value: string | null; path: FieldPath } {
  if (spec.date.anchor === 'due_date' && invoice.due_day_index !== null) {
    return {
      index: invoice.due_day_index,
      value: invoice.invoice.due_date,
      path: DATE_PATHS.due,
    };
  }
  if (spec.date.anchor === 'received_date' && invoice.received_day_index !== null) {
    return {
      index: invoice.received_day_index,
      value: invoice.invoice.received_date,
      path: DATE_PATHS.received,
    };
  }
  return { index: invoice.day_index, value: invoice.invoice.invoice_date, path: DATE_PATHS.invoice };
}

/**
 * Date SEPARATES; it does not select. Its declared weight is the smallest of the four for
 * that reason: an SAP F.13 tie is broken here, but a pair that agrees only on its dates must
 * not be able to clear on that alone.
 */
export function dateComponentFor(
  invoice: PreparedInvoice,
  payment: PreparedPayment,
  spec: MatchSpec,
  policy: MatchPolicy,
): DateOutcome {
  const s = spec.date;
  const anchor = dateAnchorOf(invoice, spec);
  const delta = dayDelta(anchor.index, payment.day_index);
  const window = policy.date_window_days;

  if (delta === null) {
    return {
      score: clampRatio(s.absent_score),
      delta: 0,
      payment_date: null,
      anchor_date: anchor.value,
      anchor_path: anchor.path,
      absent: true,
      tolerance: { kind: 'days', value: window },
      within_tolerance: false,
    };
  }

  const gap = Math.abs(delta);
  let base: Ratio;
  if (gap > window) base = clampRatio(s.outside_score);
  else if (gap <= s.ideal_days) base = 1;
  else base = linear(1, s.window_score, gap - s.ideal_days, window - s.ideal_days);

  return {
    score: delta < 0 ? clampRatio(base * s.early_multiplier) : base,
    delta,
    payment_date: payment.payment.value_date,
    anchor_date: anchor.value,
    anchor_path: anchor.path,
    absent: false,
    tolerance: { kind: 'days', value: window },
    within_tolerance: gap <= window,
  };
}
