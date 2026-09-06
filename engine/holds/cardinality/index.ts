// W05c — engine/holds/cardinality. Public surface.
//
// ─── What this module is ─────────────────────────────────────────────────────────────
//
// The cardinality family. It answers one question about one invoice — how many statement
// lines settled it, and what is left over — and raises one typed hold when the answer is
// "not all of it": `cardinality_residual`.
//
//   evidence.ts    which payments the search may look at, recovered from RAW columns
//   window.ts      the 45-day bound, applied symmetrically around the invoice date
//   subset-sum.ts  bounded exact search, and the tie rule that governs it
//   analyse.ts     the two directions — many-to-one, and the bulk remittance
//   family.ts      the HoldFamily the registry wires in
//   paise.ts       integer minor units, checked at the boundary
//
// ─── The one decision worth reading ──────────────────────────────────────────────────
//
// A 45-day window over this ledger holds around fifty statement lines, and subset-sum
// over fifty unconstrained integers hits almost any target. We measured it: the amount of
// the bulk remittance in the frozen dataset is reachable by at least five different
// subsets of the invoices sitting in its own window, and none of them is the right one.
//
// So two rules, and they are the whole family:
//
//   1. A payment enters the search only when a reference token recovered from the raw
//      bank narration ties it to the invoice. Amount alone never admits a line — the
//      amount is what is being solved for, and admitting a line because its amount is
//      convenient is circular.
//
//   2. When two or more subsets reach the same sum, NOTHING is attributed. Not the
//      shortest, not the most recent, not the largest-first. Every tie-breaker available
//      here is a coin toss with a reason written on it, and the wrong side of that coin
//      is a false clear. The invoice is held with both rivals recorded, and a human
//      applies one. An unmatched item is better than a wrong match; that principle is
//      taken from a Tier-1 bank's own reconciliation benchmark and it is the reason this
//      family will sometimes hold an invoice that could have been settled.
//
// ─── Wiring ──────────────────────────────────────────────────────────────────────────
//
// `engine/holds/registry.ts` is frozen and orchestrator-owned. This module exports the
// family; the orchestrator adds the import at the Wave 3 merge gate.

export { cardinalityFamily } from './family';
export { analyse } from './analyse';
export type { CardinalityAnalysis, LinkedPayment, SettlementShape } from './analyse';
export { boundedSubsetSum } from './subset-sum';
export type { SearchKind, SearchOutcome, SubsetItem } from './subset-sum';
export { cores, referenceLink } from './evidence';
export type { Cores, LinkTier } from './evidence';
export { dayDelta, insideWindow } from './window';
