/**
 * W10 — the level of precision of the review.
 *
 * This is the measure auditors ask for and the one an automation is most tempted to leave
 * out, because it is the measure that can embarrass you. It answers: at what level of
 * precision was this control actually performed — what could have passed through it
 * unexamined?
 *
 * ─── THE HEADLINE RATIO IS THE API'S, DELIBERATELY ───────────────────────────────────
 *
 * `GET /api/runs/{id}/review-evidence` already defines and ships:
 *
 *     exception cases carrying at least one recorded decision, divided by exception cases
 *     in the run
 *
 * That definition is REUSED here verbatim, string and all, so the artifact and the endpoint
 * cannot report different numbers for the same run. Two layers quietly computing the same
 * name two ways is worse than either one alone.
 *
 * One correction, and it only ever moves the number DOWN. The endpoint's numerator counts
 * every distinct case carrying a decision in the run, while its denominator counts
 * exception cases; a decision recorded against a case that is not an exception therefore
 * pushes the ratio above 1. Here the numerator is intersected with the exception
 * population, so the ratio is a proportion of that population and cannot exceed 1.
 *
 * ─── AND THREE MEASURES IT DOES NOT CARRY ────────────────────────────────────────────
 *
 *   value_precision_of_review     the same proportion weighted by money. A count ratio of
 *                                 0.9 is compatible with the unreviewed tenth holding most
 *                                 of the exposure, and a reviewer told only the count would
 *                                 not know.
 *   largest_unreviewed_case       THE PRECISION THRESHOLD ACTUALLY ACHIEVED. An exception
 *                                 of this size passed without a recorded decision, so this
 *                                 is the size of misstatement the control, as performed,
 *                                 would not have caught. This is what "level of precision"
 *                                 means in a review control, and one number states it.
 *   cases_reviewed_by_a_second_person
 *                                 separation applied per case rather than only at the top
 *                                 of the export. A run can show two names on the cover and
 *                                 have every case decided by one of them.
 *
 * Money never meets a float: the totals are `bigint` sums, they cross as exact decimal
 * digits, and the two proportions are computed by scaled integer division.
 */

import { digitsOf, ratioOf, ratioOfCounts, sumPaise } from '@/engine/rules';
import type { CaseId, Decision, ExceptionCase, Ratio, ReviewerId } from '@/lib/types';

/** The endpoint's definition, verbatim. Shipped in the artifact beside the number. */
export const PRECISION_OF_REVIEW_DEFINITION =
  'exception cases carrying at least one recorded decision, divided by exception cases in the run';

export const VALUE_PRECISION_DEFINITION =
  'money at risk on exception cases carrying at least one recorded decision, divided by money at risk across exception cases in the run';

export const LARGEST_UNREVIEWED_DEFINITION =
  'the money at risk on the largest exception case carrying no recorded decision — an exception of this size passed through the control unexamined';

export const SECOND_PERSON_DEFINITION =
  'exception cases whose recorded decision was made by someone other than the preparer';

export interface ReviewPrecision {
  readonly exception_cases: number;
  readonly cases_with_recorded_decision: number;
  readonly precision_of_review: Ratio;

  /** Exact decimal digits. Never a float, never narrowed to a JS number. */
  readonly money_at_risk_paise: string;
  readonly money_reviewed_paise: string;
  readonly value_precision_of_review: Ratio;

  readonly largest_unreviewed_case_id: CaseId | null;
  readonly largest_unreviewed_case_paise: string;

  readonly cases_reviewed_by_a_second_person: number;

  readonly definitions: Readonly<Record<string, string>>;
  readonly note: string;
}

const NOTE =
  'The headline ratio is the definition already shipped by the review-evidence endpoint, reused verbatim so the two cannot disagree. The value-weighted ratio, the largest unreviewed exception and the per-case separation count are added here; the largest unreviewed exception is the level of precision the control was actually performed at.';

export interface PrecisionInput {
  readonly cases: readonly ExceptionCase[];
  readonly decisions: readonly Decision[];
  /** Used only for the per-case separation count. Null means it cannot be established. */
  readonly preparer: ReviewerId | null;
}

export function measurePrecision(input: PrecisionInput): ReviewPrecision {
  const decisionsByCase = new Map<string, Decision[]>();
  for (const decision of input.decisions) {
    const key = String(decision.case_id);
    decisionsByCase.set(key, [...(decisionsByCase.get(key) ?? []), decision]);
  }

  const decisionsOn = (exception: ExceptionCase): readonly Decision[] => {
    const recorded = decisionsByCase.get(String(exception.case_id)) ?? [];
    if (recorded.length > 0) return recorded;
    return exception.decision === null ? [] : [exception.decision];
  };

  const reviewed: ExceptionCase[] = [];
  const unreviewed: ExceptionCase[] = [];
  let secondPerson = 0;

  for (const exception of input.cases) {
    const recorded = decisionsOn(exception);
    if (recorded.length === 0) {
      unreviewed.push(exception);
      continue;
    }
    reviewed.push(exception);
    if (
      input.preparer !== null &&
      recorded.some((decision) => String(decision.reviewer) !== String(input.preparer))
    ) {
      secondPerson += 1;
    }
  }

  const atRisk = sumPaise(input.cases.map((exception) => exception.money_at_risk_paise));
  const reviewedValue = sumPaise(reviewed.map((exception) => exception.money_at_risk_paise));

  // Largest first, then by case id, so the answer does not depend on input order.
  const largest = [...unreviewed].sort((a, b) => {
    const left = sumPaise([a.money_at_risk_paise]);
    const right = sumPaise([b.money_at_risk_paise]);
    if (left !== right) return right > left ? 1 : -1;
    return a.case_id < b.case_id ? -1 : a.case_id > b.case_id ? 1 : 0;
  })[0];

  return {
    exception_cases: input.cases.length,
    cases_with_recorded_decision: reviewed.length,
    precision_of_review: ratioOfCounts(reviewed.length, input.cases.length),

    money_at_risk_paise: digitsOf(atRisk),
    money_reviewed_paise: digitsOf(reviewedValue),
    value_precision_of_review: ratioOf(reviewedValue, atRisk),

    largest_unreviewed_case_id: largest === undefined ? null : largest.case_id,
    largest_unreviewed_case_paise:
      largest === undefined ? '0' : digitsOf(largest.money_at_risk_paise),

    cases_reviewed_by_a_second_person: secondPerson,

    definitions: Object.freeze({
      precision_of_review: PRECISION_OF_REVIEW_DEFINITION,
      value_precision_of_review: VALUE_PRECISION_DEFINITION,
      largest_unreviewed_case_paise: LARGEST_UNREVIEWED_DEFINITION,
      cases_reviewed_by_a_second_person: SECOND_PERSON_DEFINITION,
    }),
    note: NOTE,
  };
}
