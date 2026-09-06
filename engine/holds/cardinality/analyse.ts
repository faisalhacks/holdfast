// W05c — the analysis. One invoice, one verdict about how it was settled.
//
// ── The two directions ───────────────────────────────────────────────────────────────
//
//   many-to-one   several statement lines settle one invoice — an instalment plan, a
//                 part payment followed by a top-up, a supplier paying in tranches. The
//                 search runs over PAYMENTS with the invoice gross as the target.
//
//   one-to-many   one remittance settles several invoices — the bulk payment. The search
//                 runs over INVOICES with the payment amount as the target, and this
//                 invoice is either inside the funded allocation or it is not.
//
// A residual is what is left of the invoice after whichever of those actually happened.
//
// ── What is deliberately NOT a cardinality residual ──────────────────────────────────
//
// One payment, one invoice, short by a bank charge or a withholding. That is an amount
// variance and it belongs to the variance family; the delta has a cause and a tolerance,
// and re-labelling it as a cardinality problem would put the same exception in two
// queues under two different names. This family fires only when the CARDINALITY is the
// problem — when the accepted settlement is made of two or more parts, or when a bulk
// remittance names this invoice and does not fund it. That boundary is the family's own
// name, which makes it a boundary nobody has to remember.

import type { HoldContext } from '@/engine/holds/registry';
import type {
  Days,
  Invoice,
  InvoiceId,
  Paise,
  Payment,
  PaymentId,
} from '@/lib/types';
import {
  cores,
  matcherLinkedPayments,
  referenceLink,
  vendorCorroborated,
  type Cores,
  type LinkTier,
} from './evidence';
import { minorUnits, NIL } from './paise';
import { boundedSubsetSum, type SearchOutcome, type SubsetItem } from './subset-sum';
import { dayDelta, insideWindow } from './window';

export type SettlementShape =
  | 'not_applicable'
  | 'one_to_one'
  | 'many_to_one'
  | 'one_to_many';

export interface LinkedPayment {
  readonly payment: Payment;
  readonly tier: LinkTier;
  readonly delta_days: Days;
  /** True when this line names two or more distinct invoices — a bulk remittance. */
  readonly bulk: boolean;
  readonly vendor_corroborated: boolean;
}

export interface CardinalityAnalysis {
  readonly invoice_id: InvoiceId;
  readonly shape: SettlementShape;
  /** The amount that has to be settled: the invoice gross. */
  readonly target_paise: Paise;
  /** What the ACCEPTED settlement covers. Zero whenever nothing was attributed. */
  readonly settled_paise: Paise;
  /** target minus settled. Positive means a residual remains. */
  readonly residual_paise: Paise;
  readonly settled_by: readonly PaymentId[];
  readonly search: SearchOutcome;
  readonly pool: readonly LinkedPayment[];
  /** Linked to this invoice by reference, but outside the date window. */
  readonly outside_window: readonly PaymentId[];
  /** True when admitting the out-of-window lines would settle the invoice exactly. */
  readonly window_would_close: boolean;
  /** Same-vendor credit notes dated inside the window. They change what is owed. */
  readonly crossing_credit_notes: readonly InvoiceId[];
  readonly bulk_payment_id: PaymentId | null;
  readonly bulk_claimants: readonly InvoiceId[];
  readonly bulk_funded: readonly InvoiceId[];
  /**
   * True when the only remittance naming this invoice is dated outside the window.
   *
   * The money exists and the advice names the document, but the two are five months
   * apart. The bound says do not match it, and the bound is right — so nothing is
   * attributed, the whole invoice is the residual, and the exception is put in front of
   * a person with the remittance id attached rather than quietly matched or quietly
   * dropped.
   */
  readonly bulk_outside_window: boolean;
}

function bounded(value: number, floor: number): number {
  return Number.isSafeInteger(value) && value >= floor ? value : floor;
}

function coreCache(): (raw: string) => Cores {
  const cache = new Map<string, Cores>();
  return (raw: string): Cores => {
    const hit = cache.get(raw);
    if (hit) return hit;
    const made = cores(raw);
    cache.set(raw, made);
    return made;
  };
}

/** A document that a payment can be applied against. Credit notes are not settled by one. */
function settleable(invoice: Invoice): boolean {
  return !invoice.is_credit_note && invoice.gross_paise > 0;
}

function inert(invoice: Invoice, search: SearchOutcome): CardinalityAnalysis {
  return {
    invoice_id: invoice.id,
    shape: 'not_applicable',
    target_paise: NIL,
    settled_paise: NIL,
    residual_paise: NIL,
    settled_by: [],
    search,
    pool: [],
    outside_window: [],
    window_would_close: false,
    crossing_credit_notes: [],
    bulk_payment_id: null,
    bulk_claimants: [],
    bulk_funded: [],
    bulk_outside_window: false,
  };
}

const IDLE: SearchOutcome = {
  kind: 'none',
  sum: 0,
  chosen: [],
  rivalSum: 0,
  rivals: [],
  method: 'trivial',
  nodes: 0,
};

/**
 * The whole analysis. Pure: it reads the context, allocates nothing outside itself, and
 * returns a description of what it found rather than a decision about what to do.
 */
export function analyse(ctx: HoldContext): CardinalityAnalysis {
  const invoice = ctx.invoice;
  if (!settleable(invoice)) return inert(invoice, IDLE);

  const target = minorUnits(invoice.gross_paise);
  const windowDays = bounded(ctx.policy.date_window_days, 0);
  const maxSize = Math.max(1, bounded(ctx.policy.max_subset_size, 1));
  const coresOf = coreCache();
  const invoiceCores = coresOf(invoice.reference);
  const matcherIds = matcherLinkedPayments(ctx.candidates, String(invoice.id));

  // ── Every ledger document, this one included, addressable by id ────────────────────
  const ledger = new Map<string, Invoice>();
  ledger.set(String(invoice.id), invoice);
  for (const other of ctx.ledger) ledger.set(String(other.id), other);

  // ── Which payments carry evidence for THIS invoice ─────────────────────────────────
  const inWindow: LinkedPayment[] = [];
  const outsideWindow: LinkedPayment[] = [];
  for (const payment of ctx.payments) {
    if (payment.amount_paise <= 0) continue;
    const narration = coresOf(payment.narration_raw);
    const tier: LinkTier | null =
      referenceLink(invoiceCores, narration) ??
      (matcherIds.has(payment.id) ? 'matcher_candidate' : null);
    if (tier === null) continue;
    const delta = dayDelta(payment.value_date, invoice.invoice_date);
    if (delta === null) continue;
    const claimants = claimantsOf(payment, narration, ledger, coresOf, windowDays);
    const link: LinkedPayment = {
      payment,
      tier,
      delta_days: delta,
      bulk: distinctReferences(claimants, coresOf) >= 2,
      vendor_corroborated: vendorCorroborated(invoice.vendor_name_raw, narration),
    };
    if (insideWindow(payment.value_date, invoice.invoice_date, windowDays)) inWindow.push(link);
    else outsideWindow.push(link);
  }

  const crossing = crossingCreditNotes(invoice, ctx.ledger, windowDays);
  const bulkLinks = inWindow.filter((l) => l.bulk);
  const direct = inWindow.filter((l) => !l.bulk);

  if (bulkLinks.length > 0) {
    return bulkAllocation(invoice, target, maxSize, windowDays, coresOf, ledger, {
      bulkLinks,
      pool: inWindow,
      outsideWindow,
      crossing,
    });
  }

  // Nothing at all inside the window. Before falling silent, look once at whether a
  // multi-invoice remittance names this document from outside it — the difference
  // between "no payment found" and "the money is over there, five months away" is the
  // difference between an exception a person can act on and one they cannot.
  if (inWindow.length === 0) {
    const stranded = strandedRemittances(outsideWindow, ledger, coresOf);
    if (stranded.length > 0) {
      return strandedBulk(invoice, target, stranded, {
        pool: inWindow,
        outsideWindow,
        crossing,
      });
    }
  }

  return manyToOne(invoice, target, maxSize, {
    direct,
    pool: inWindow,
    outsideWindow,
    crossing,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// many-to-one: several statement lines against one invoice
// ─────────────────────────────────────────────────────────────────────────────

interface Shared {
  readonly pool: readonly LinkedPayment[];
  readonly outsideWindow: readonly LinkedPayment[];
  readonly crossing: readonly InvoiceId[];
}

function manyToOne(
  invoice: Invoice,
  target: Paise,
  maxSize: number,
  parts: Shared & { readonly direct: readonly LinkedPayment[] }
): CardinalityAnalysis {
  const { direct, pool, outsideWindow, crossing } = parts;
  const base = {
    invoice_id: invoice.id,
    target_paise: target,
    pool,
    outside_window: outsideWindow.map((l) => l.payment.id),
    crossing_credit_notes: crossing,
    bulk_payment_id: null,
    bulk_claimants: [] as readonly InvoiceId[],
    bulk_funded: [] as readonly InvoiceId[],
    bulk_outside_window: false,
  };

  if (direct.length === 0) {
    return { ...inert(invoice, IDLE), ...base, shape: 'not_applicable', target_paise: NIL };
  }

  const items = direct.map((l) => ({ key: String(l.payment.id), value: l.payment.amount_paise }));
  const search = boundedSubsetSum(items, target, maxSize);

  // Would a wider window close this exactly? Reported, never acted on: the window is a
  // frozen policy constant and this family does not get to widen it. A reviewer does.
  const wider =
    search.kind === 'exact'
      ? null
      : boundedSubsetSum(
          [...items, ...outsideWindow.filter((l) => !l.bulk).map((l) => ({ key: String(l.payment.id), value: l.payment.amount_paise }))],
          target,
          maxSize
        );
  const windowWouldClose = wider !== null && wider.kind === 'exact';

  // A settlement is only ATTRIBUTED when the search named one. On a tie, or when the node
  // budget ran out, nothing is applied and the residual is the whole invoice — see the
  // tie rule in subset-sum.ts, which is the single place that decision is made.
  const attributed = search.kind === 'exact' || search.kind === 'partial';

  // The shape is the cardinality of what was actually accepted, falling back to the size
  // of the pool when nothing was. One line against one invoice is a one-to-one settlement
  // however short it falls, and a shortfall there is an amount variance, not this family's.
  const accepted = attributed ? search.chosen.length : direct.length;

  return {
    ...base,
    shape: accepted >= 2 ? 'many_to_one' : 'one_to_one',
    settled_paise: attributed ? minorUnits(search.sum) : NIL,
    residual_paise: attributed ? minorUnits(target - search.sum) : target,
    settled_by: attributed ? search.chosen.map((k) => k as unknown as PaymentId) : [],
    search,
    window_would_close: windowWouldClose,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// one-to-many: a bulk remittance, and whether it funds this invoice
// ─────────────────────────────────────────────────────────────────────────────

function bulkAllocation(
  invoice: Invoice,
  target: Paise,
  maxSize: number,
  windowDays: number,
  coresOf: (raw: string) => Cores,
  ledger: ReadonlyMap<string, Invoice>,
  parts: Shared & { readonly bulkLinks: readonly LinkedPayment[] }
): CardinalityAnalysis {
  const { bulkLinks, pool, outsideWindow, crossing } = parts;
  const base = {
    invoice_id: invoice.id,
    target_paise: target,
    pool,
    outside_window: outsideWindow.map((l) => l.payment.id),
    crossing_credit_notes: crossing,
    window_would_close: false,
  };

  // Two different bulk remittances both naming this invoice is an allocation question no
  // arithmetic answers. Nothing is attributed.
  if (bulkLinks.length > 1) {
    const rivals = bulkLinks.slice(0, 2).map((l) => [String(l.payment.id)]);
    return {
      ...base,
      shape: 'one_to_many',
      settled_paise: NIL,
      residual_paise: target,
      settled_by: [],
      search: { kind: 'ambiguous', sum: 0, chosen: [], rivalSum: 0, rivals, method: 'trivial', nodes: 0 },
      bulk_payment_id: null,
      bulk_claimants: [],
      bulk_funded: [],
      bulk_outside_window: false,
    };
  }

  const link = bulkLinks[0];
  if (!link) return { ...inert(invoice, IDLE), ...base, target_paise: NIL };
  const remittance = link.payment;
  const narration = coresOf(remittance.narration_raw);
  const claimants = claimantsOf(remittance, narration, ledger, coresOf, windowDays);
  const claimed = claimants.reduce((sum, doc) => sum + doc.gross_paise, 0);

  const shared = {
    ...base,
    shape: 'one_to_many' as const,
    bulk_payment_id: remittance.id,
    bulk_claimants: claimants.map((c) => c.id),
    bulk_outside_window: false,
  };

  // The remittance covers everything it names. Whatever is left over is an unapplied
  // credit on the payment side, not a residual on this invoice.
  if (claimed <= remittance.amount_paise) {
    return {
      ...shared,
      settled_paise: target,
      residual_paise: NIL,
      settled_by: [remittance.id],
      search: { kind: 'exact', sum: target, chosen: [String(remittance.id)], rivalSum: 0, rivals: [], method: 'trivial', nodes: 0 },
      bulk_funded: claimants.map((c) => c.id),
    };
  }

  // It does not. Which of the named invoices the money actually funds is a subset-sum
  // over the INVOICES, and this one is either inside that allocation or it is the
  // residual left over after it.
  const items: SubsetItem[] = claimants.map((c) => ({ key: String(c.id), value: c.gross_paise }));
  const search = boundedSubsetSum(items, remittance.amount_paise, maxSize);
  const attributable = search.kind === 'exact' || search.kind === 'partial';
  const funded = attributable ? search.chosen : [];
  const isFunded = funded.includes(String(invoice.id));

  return {
    ...shared,
    settled_paise: isFunded ? target : NIL,
    residual_paise: isFunded ? NIL : target,
    settled_by: isFunded ? [remittance.id] : [],
    search,
    bulk_funded: funded.map((k) => k as unknown as InvoiceId),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every ledger document this statement line names AND is in date range of.
 *
 * The second half of that is what keeps a truncated remittance advice from turning into a
 * bulk payment by accident: a reference fragment collides with a document from four
 * months ago, but that document's own window excludes this line, so it is not a claimant.
 */
function claimantsOf(
  payment: Payment,
  narration: Cores,
  ledger: ReadonlyMap<string, Invoice>,
  coresOf: (raw: string) => Cores,
  /** null lifts the date bound — used only to RECOGNISE a remittance, never to match one. */
  windowDays: number | null
): readonly Invoice[] {
  const out: Invoice[] = [];
  for (const doc of ledger.values()) {
    if (!settleable(doc)) continue;
    if (referenceLink(coresOf(doc.reference), narration) === null) continue;
    if (windowDays !== null && !insideWindow(payment.value_date, doc.invoice_date, windowDays)) continue;
    out.push(doc);
  }
  return out.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
}

/**
 * Out-of-window lines that are recognisably multi-invoice remittances.
 *
 * The date bound is lifted for RECOGNITION only. Recognising a bulk advice and matching
 * against one are different acts: the first tells a reviewer where the money is, the
 * second moves an invoice to settled. Only the first happens here, and the outcome is
 * always a hold.
 */
function strandedRemittances(
  outsideWindow: readonly LinkedPayment[],
  ledger: ReadonlyMap<string, Invoice>,
  coresOf: (raw: string) => Cores
): readonly { readonly link: LinkedPayment; readonly claimants: readonly Invoice[] }[] {
  const out: { link: LinkedPayment; claimants: readonly Invoice[] }[] = [];
  for (const link of outsideWindow) {
    const narration = coresOf(link.payment.narration_raw);
    const claimants = claimantsOf(link.payment, narration, ledger, coresOf, null);
    if (distinctReferences(claimants, coresOf) >= 2) out.push({ link, claimants });
  }
  return out;
}

function strandedBulk(
  invoice: Invoice,
  target: Paise,
  stranded: readonly { readonly link: LinkedPayment; readonly claimants: readonly Invoice[] }[],
  parts: Shared
): CardinalityAnalysis {
  const first = stranded[0];
  const ambiguous = stranded.length > 1;
  return {
    invoice_id: invoice.id,
    shape: 'one_to_many',
    target_paise: target,
    settled_paise: NIL,
    residual_paise: target,
    settled_by: [],
    search: ambiguous
      ? {
          kind: 'ambiguous',
          sum: 0,
          chosen: [],
          rivalSum: 0,
          rivals: stranded.slice(0, 2).map((s) => [String(s.link.payment.id)]),
          method: 'trivial',
          nodes: 0,
        }
      : IDLE,
    pool: parts.pool,
    outside_window: parts.outsideWindow.map((l) => l.payment.id),
    window_would_close: false,
    crossing_credit_notes: parts.crossing,
    bulk_payment_id: first ? first.link.payment.id : null,
    bulk_claimants: first ? first.claimants.map((c) => c.id) : [],
    bulk_funded: [],
    bulk_outside_window: true,
  };
}

/**
 * How many DISTINCT documents a line names.
 *
 * Distinct by reference, not by id, and that is the whole point: two ledger rows carrying
 * the same reference are a suspected duplicate invoice, which is another family's hold.
 * Counting them as two would turn every duplicate pair into a phantom bulk remittance.
 */
function distinctReferences(claimants: readonly Invoice[], coresOf: (raw: string) => Cores): number {
  const seen = new Set<string>();
  for (const doc of claimants) seen.add(coresOf(doc.reference).stripped);
  return seen.size;
}

/** Same-vendor credit notes dated inside the window. They change what is actually owed. */
function crossingCreditNotes(
  invoice: Invoice,
  ledger: readonly Invoice[],
  windowDays: number
): readonly InvoiceId[] {
  const out: InvoiceId[] = [];
  for (const doc of ledger) {
    if (!doc.is_credit_note) continue;
    if (String(doc.vendor_id) !== String(invoice.vendor_id)) continue;
    if (!insideWindow(doc.invoice_date, invoice.invoice_date, windowDays)) continue;
    out.push(doc.id);
  }
  return out;
}
