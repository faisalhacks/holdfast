// W05c — engine/holds/cardinality. Public surface.
//
// The registry wires this in at the Wave 3 merge gate with one line:
//
//     import { cardinalityFamily } from './cardinality';
//
// `engine/holds/registry.ts` is frozen and this worker has not touched it.
//
// ─── What is in here ─────────────────────────────────────────────────────────────────
//
//   anchors.ts     which payments are ALLOWED into the search, from raw columns only
//   subset-sum.ts  bounded exact subset-sum over integer paise, meet-in-the-middle
//   settlement.ts  what the search proves about one invoice, and the tie rule
//   family.ts      the HoldFamily, and the conflicts every proposal carries
//
// ─── The one sentence version ────────────────────────────────────────────────────────
//
// Reference evidence chooses the candidates, amount arithmetic chooses among them, a
// settlement counts as proven only when exactly one subset fits, and anything not proven
// settled is a residual and therefore a hold.

export {
  CARDINALITY_FAMILY_ID,
  cardinalityFamily,
} from './family';

export {
  MIN_ANCHOR_DIGITS,
  MIN_ANCHOR_TOKEN,
  anchorRoute,
  anchoredPools,
  daysApart,
  invoiceAnchorKeys,
  invoicesAnchoredTo,
  isAnchored,
  namesInvoice,
  paymentIdsOf,
  supersedingAnchorExists,
  withinWindow,
} from './anchors';
export type { AnchorRoute, AnchoredPools, InvoiceAnchorKeys } from './anchors';

export { buildBoundedSubsetIndex, verdictFor } from './subset-sum';
export type { BoundedSubsetIndex, ExactVerdict, SubsetSolution } from './subset-sum';

export { findResidual } from './settlement';
export type { CardinalityPolicy, ResidualCause, ResidualFinding } from './settlement';
