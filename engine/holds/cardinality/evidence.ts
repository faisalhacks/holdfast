// W05c — what licenses a payment to enter the search.
//
// The single most important decision in this family is not the search algorithm. It is
// which payments the search is allowed to look at.
//
// A 45-day window over this ledger holds roughly fifty statement lines. Subset-sum over
// fifty unconstrained integers finds an exact hit for almost any target — we measured it:
// the bulk remittance's own amount is reachable by at least five different subsets of the
// invoices sitting in its window, and none of them is the right one. An exact sum found
// that way is not evidence of anything. It is arithmetic noise with a decimal point.
//
// So a payment enters the pool only when a reference token recovered from the RAW bank
// narration ties it to this invoice. Vendor-name similarity does not qualify: it is a
// tie-breaker between candidates, never a reason to admit one. Amount alone certainly
// does not qualify — amount is the thing being solved for, and admitting a payment
// because its amount is convenient is circular.
//
// Everything here reads raw columns. `narration_raw` is the bank's own text; the invoice
// reference is the document's own. Nothing reads a pre-normalised or pre-extracted field:
// recovering the token is the work, and grading ourselves on a value another stage
// already recovered would grade that stage twice.

import type { MatchCandidate, PaymentId } from '@/lib/types';

/**
 * How strongly a payment is tied to an invoice. Ordered: a claim at a higher rank beats a
 * claim at a lower one outright, and only equal ranks contend.
 */
export type LinkTier = 'reference_core' | 'reference_digits' | 'matcher_candidate';

export const TIER_RANK: Readonly<Record<LinkTier, number>> = Object.freeze({
  reference_core: 3,
  reference_digits: 2,
  matcher_candidate: 1,
});

/** Shortest token that may carry a link. Below this, collisions outnumber matches. */
const MIN_CORE_LENGTH = 5;
const MIN_DIGIT_LENGTH = 5;

const ALPHANUMERIC_RUN = /[A-Z]+|[0-9]+/g;
const DIGIT_RUN = /[0-9]+/g;
const ALL_DIGITS = /^[0-9]+$/;

function withoutLeadingZeros(run: string): string {
  const trimmed = run.replace(/^0+/, '');
  return trimmed === '' ? '0' : trimmed;
}

/**
 * Four canonical forms of one raw string.
 *
 * `plain` and `digitsPlain` keep the characters as written. `stripped` and
 * `digitsStripped` drop leading zeros from each numeric run, because a bank writes
 * `02603/01379` for the document its issuer calls `2603-1379` and both are the same
 * number. Matching on either form costs nothing and recovers a whole class of link that a
 * single canonical form misses.
 */
export interface Cores {
  readonly plain: string;
  readonly stripped: string;
  readonly digitsPlain: string;
  readonly digitsStripped: string;
}

export function cores(raw: string): Cores {
  const upper = raw.toUpperCase();
  const runs = upper.match(ALPHANUMERIC_RUN) ?? [];
  let plain = '';
  let stripped = '';
  for (const run of runs) {
    plain += run;
    stripped += ALL_DIGITS.test(run) ? withoutLeadingZeros(run) : run;
  }
  const digitRuns = upper.match(DIGIT_RUN) ?? [];
  let digitsPlain = '';
  let digitsStripped = '';
  for (const run of digitRuns) {
    digitsPlain += run;
    digitsStripped += withoutLeadingZeros(run);
  }
  return { plain, stripped, digitsPlain, digitsStripped };
}

function contains(haystack: string, needle: string, minimum: number): boolean {
  return needle.length >= minimum && haystack.includes(needle);
}

/**
 * The tier at which this invoice's reference is recoverable from this narration, or null.
 *
 * `reference_core` is the alphanumeric document number appearing intact in the narration.
 * `reference_digits` is the numeric part appearing intact when the alphabetic prefix has
 * been mangled away — weaker, because digits collide, and ranked accordingly.
 */
export function referenceLink(invoiceReference: Cores, narration: Cores): LinkTier | null {
  if (
    contains(narration.plain, invoiceReference.plain, MIN_CORE_LENGTH) ||
    contains(narration.stripped, invoiceReference.stripped, MIN_CORE_LENGTH)
  ) {
    return 'reference_core';
  }
  if (
    contains(narration.digitsPlain, invoiceReference.digitsPlain, MIN_DIGIT_LENGTH) ||
    contains(narration.digitsStripped, invoiceReference.digitsStripped, MIN_DIGIT_LENGTH)
  ) {
    return 'reference_digits';
  }
  return null;
}

/**
 * Payment ids the deterministic matcher has already tied to this invoice.
 *
 * Two filters, both from the house rule that the LLM proposes and deterministic code
 * verifies. A candidate that has not been re-scored carries no weight here, and a
 * `model_proposal` is excluded outright — admitting one to the pool could make this
 * family fall silent on an invoice, and silence is a clearance by another name. A
 * generated nomination that also carries its own recovered reference token still enters
 * the pool: on that evidence, not on its provenance.
 */
export function matcherLinkedPayments(
  candidates: readonly MatchCandidate[],
  invoiceId: string
): ReadonlySet<PaymentId> {
  const ids = new Set<PaymentId>();
  for (const candidate of candidates) {
    if (String(candidate.invoice_id) !== invoiceId) continue;
    if (!candidate.reverified) continue;
    if (candidate.proposed_by === 'model_proposal') continue;
    for (const id of candidate.payment_ids) ids.add(id);
  }
  return ids;
}

/** Vendor corroboration. Never admits a payment; only sharpens the reason text. */
export function vendorCorroborated(vendorNameRaw: string, narrationCores: Cores): boolean {
  const tokens = vendorNameRaw.toUpperCase().match(/[A-Z]{4,}/g) ?? [];
  for (const token of tokens) {
    if (narrationCores.plain.includes(token)) return true;
  }
  return false;
}
