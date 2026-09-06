/**
 * W10 — who performed the control, and whether two different people did.
 *
 * Separation of duties is the first thing an auditor asks of a detective control: the
 * person who prepared the reconciliation must not be the only person who reviewed it. So
 * the export names both, says whether they were the same person, and — this is the part
 * that is easy to skip — names EVERYONE who acted, not just the two on the cover.
 *
 * WHY THE FULL PARTICIPANT LIST IS NOT OPTIONAL
 *
 * Reducing a run worked by five people to a preparer and a reviewer is a misrepresentation
 * in the exact direction that flatters us. The two headline names are a summary of the
 * participant list, which is printed beside them and adds up.
 *
 * WHERE THE NAMES COME FROM
 *
 * From the append-only journal by TIMESTAMP, merged with the decision rows. Preferring the
 * journal matters: it is the chained, append-only record, and deriving "who reviewed" from
 * the ORDER a repository happened to return decisions in makes the answer depend on a
 * query plan. Decisions are merged in rather than ignored because a decision is itself a
 * timestamped act by a named person, and a run whose journal was filtered would otherwise
 * lose people who demonstrably acted.
 *
 * A model is never a preparer and never a reviewer. `Actor` admits a model actor and the
 * contract confines it to proposal events; here only `kind: 'human'` is counted, so no
 * arrangement of the data can put a model's name on a reviewed reconciliation.
 *
 * WHEN NOBODY ACTED
 *
 * Both names come back null and `attributable` is false. An export that invented a name to
 * fill a required field would be the worst failure available to this module.
 */

import type {
  AuditEntry,
  AuditEvent,
  Decision,
  IsoTimestamp,
  ReviewerId,
} from '@/lib/types';

/**
 * The journal events that constitute performing the control — deciding a case, releasing a
 * hold, changing a tolerance. Ingestion and scoring are the system working, not a person
 * reviewing, and counting them as review acts would inflate the participant list with rows
 * nobody signed.
 */
export const REVIEW_EVENTS: readonly AuditEvent[] = Object.freeze([
  'decision_recorded',
  'hold_released',
  'tolerance_changed',
  'feedback_rule_created',
  'feedback_rule_deactivated',
  'application_status_changed',
]);

const REVIEW_EVENT_SET = new Set<string>(REVIEW_EVENTS.map(String));

export interface Participant {
  readonly reviewer: ReviewerId;
  readonly first_acted_at: IsoTimestamp;
  readonly last_acted_at: IsoTimestamp;
  /** Timestamped acts attributed to this person in this run. */
  readonly acts: number;
  /** Of those, the ones that constitute performing the control. */
  readonly review_acts: number;
}

export interface ReviewIdentities {
  readonly preparer: ReviewerId | null;
  readonly reviewer: ReviewerId | null;
  /** True when both names are known AND they are different people. Reported either way. */
  readonly separation_of_duties: boolean;
  /** True when at least one named person acted. False means nobody did. */
  readonly attributable: boolean;
  /** Everyone who acted, earliest first. */
  readonly participants: readonly Participant[];
  readonly first_act_at: IsoTimestamp | null;
  readonly last_act_at: IsoTimestamp | null;
  readonly derivation: string;
  readonly note: string;
}

interface Act {
  readonly reviewer: ReviewerId;
  readonly at: IsoTimestamp;
  readonly review_act: boolean;
  /** Journal order, used only to break a timestamp tie deterministically. */
  readonly ordinal: number;
}

const DERIVED =
  'preparer is the first named person to act in this run and reviewer is the last, taken from the append-only journal by timestamp and merged with the decision rows';
const SUPPLIED = 'preparer and reviewer were supplied by the caller and not derived';
const NOTE =
  'A model actor is never counted. When one person is both the first and the last to act, they are named twice and separation_of_duties is false — said plainly rather than left to be noticed.';

function collectActs(
  entries: readonly AuditEntry[],
  decisions: readonly Decision[],
): readonly Act[] {
  const acts: Act[] = [];
  entries.forEach((entry, index) => {
    if (entry.actor.kind !== 'human') return;
    acts.push({
      reviewer: entry.actor.reviewer,
      at: entry.occurred_at,
      review_act: REVIEW_EVENT_SET.has(String(entry.event)),
      ordinal: entry.sequence * 1000 + index,
    });
  });
  const base = entries.length * 1000;
  decisions.forEach((decision, index) => {
    acts.push({
      reviewer: decision.reviewer,
      at: decision.timestamp,
      review_act: true,
      ordinal: base + index,
    });
  });
  return acts.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return a.ordinal - b.ordinal;
  });
}

export interface IdentityInput {
  readonly entries: readonly AuditEntry[];
  readonly decisions: readonly Decision[];
  /** Override the derivation. Supplied names are reported as supplied, never as derived. */
  readonly preparer?: ReviewerId | null;
  readonly reviewer?: ReviewerId | null;
}

export function deriveIdentities(input: IdentityInput): ReviewIdentities {
  const acts = collectActs(input.entries, input.decisions);

  const byReviewer = new Map<string, { first: Act; last: Act; acts: number; review: number }>();
  for (const act of acts) {
    const key = String(act.reviewer);
    const current = byReviewer.get(key);
    if (current === undefined) {
      byReviewer.set(key, {
        first: act,
        last: act,
        acts: 1,
        review: act.review_act ? 1 : 0,
      });
      continue;
    }
    byReviewer.set(key, {
      first: current.first,
      last: act,
      acts: current.acts + 1,
      review: current.review + (act.review_act ? 1 : 0),
    });
  }

  const participants: Participant[] = [...byReviewer.values()]
    .map((row) => ({
      reviewer: row.first.reviewer,
      first_acted_at: row.first.at,
      last_acted_at: row.last.at,
      acts: row.acts,
      review_acts: row.review,
    }))
    .sort((a, b) => (a.first_acted_at < b.first_acted_at ? -1 : a.first_acted_at > b.first_acted_at ? 1 : 0));

  const first = acts[0] ?? null;
  const last = acts.length === 0 ? null : (acts[acts.length - 1] ?? null);

  const supplied = input.preparer !== undefined || input.reviewer !== undefined;
  const preparer = input.preparer ?? (first === null ? null : first.reviewer);
  const reviewer = input.reviewer ?? (last === null ? null : last.reviewer);

  return {
    preparer,
    reviewer,
    separation_of_duties:
      preparer !== null && reviewer !== null && String(preparer) !== String(reviewer),
    attributable: participants.length > 0,
    participants,
    first_act_at: first === null ? null : first.at,
    last_act_at: last === null ? null : last.at,
    derivation: supplied ? SUPPLIED : DERIVED,
    note: NOTE,
  };
}
