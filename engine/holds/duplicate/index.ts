// W05a — engine/holds/duplicate. Public surface.
//
// ─── What this family is ─────────────────────────────────────────────────────────────
//
// Duplicate detection over the INVOICE ledger, run BEFORE matching. It is an overpayment
// and fraud control, not a match verdict: it compares payables with payables and never
// looks at a payment, a candidate or a tolerance. Modelling it as a match failure is the
// standard mistake — see the header of detect.ts for the three ways that gets it wrong.
//
// ─── Wiring ──────────────────────────────────────────────────────────────────────────
//
//     import { duplicateFamily } from './duplicate';   // engine/holds/registry.ts
//
// The registry is frozen and orchestrator-owned; this directory exports and does not
// register. `duplicateFamily.handles` is `['duplicate_candidate']` and nothing else.
//
// ─── The three moving parts ──────────────────────────────────────────────────────────
//
//   detect.ts      the two flavours — a repeated reference, and a vendor+amount+date
//                  collision under different references — plus a near-date signal that is
//                  deliberately below the bar until value raises it
//   recurrence.ts  suppression of legitimate recurring and instalment streams, which is
//                  the half that decides whether the control is usable at all
//   conflicts.ts   fixed clauses; every proposal carries at least one Conflict, because
//                  `applyAll()` throws on an empty array and it is right to
//
// ─── The amount cap ──────────────────────────────────────────────────────────────────
//
// Enforced here, not in the UI. `policy.amount_cap_paise` arrives through `HoldContext`
// from the frozen `policy` block of eval/thresholds.json; this directory contains no
// rupee figure of its own, so the worker enforcing the limit cannot tune it. Above the
// cap a named reviewer acts regardless of signal strength, and the record says so with an
// explicit `amount_over_cap` conflict rather than leaving it to be inferred.
//
// The one thing the cap does NOT override is a corroborated recurring series. A high-value
// monthly retainer would otherwise be held every single month forever, which is precisely
// the alert fatigue that stops anyone reading the queue. Suppression there rests on
// observed structure — three or more documents, distinct periods, distinct references,
// a regular cadence — not on a flag, and it collapses the moment that structure breaks.

export {
  arrivalRank,
  arrivedAfter,
  canonicalReference,
  civilDate,
  dayOfMonthDrift,
  daysBetween,
  monthsBetween,
} from './keys';
export type { CivilDate } from './keys';

export {
  CADENCE_DAY_DRIFT_MAX,
  INSTALMENT_MIN_GAP_DAYS,
  SERIES_MIN_MEMBERS,
  recurrenceSuppression,
  seriesFor,
} from './recurrence';
export type { RecurrenceKind, RecurrenceSuppression, RecurringSeries } from './recurrence';

export { detectDuplicateSignals, isLive } from './detect';
export type { DuplicateAxis, DuplicatePolicy, DuplicateSignal, DuplicateSignalKind } from './detect';

export { DUPLICATE_CLAUSES, capConflict, conflictFor, distinctConflicts, severityFor } from './conflicts';

export { assessInvoice, assessLedger, duplicateFamily, proposalFor } from './family';
export type { DuplicateFinding } from './family';
