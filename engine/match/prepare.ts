// W04b — the ledger, normalised once, explicitly, by the caller.
//
// THE ENGINE NORMALISES FROM THE RAW COLUMNS, and this file is where that commitment is
// kept on the matching side. The dataset also carries `normalised_reference`,
// `normalised_name`, `narration_normalised`, `reference_extracted` and
// `vendor_name_extracted`. Not one of them is read here. They were written by whatever
// produced the dataset; an engine that consumes them measures that producer's normalisation
// and reports it as its own, and the headline number stops being a measurement of this
// system. The inputs are `reference`, `vendor_name_raw`, `purchase_order_reference` and
// `narration_raw`, and nothing else.
//
// The same commitment stated the other way: BOTH SIDES GO THROUGH THE SAME PROFILES. An
// invoice vendor name and the vendor residue recovered from a bank narration are both
// canonicalised by `vendor.v1`; an invoice reference and a reference token pulled out of a
// narration are both canonicalised by `reference.v1`. Normalising the two sides differently
// is how a matcher flatters itself.
//
// Nothing here compares, scores or ranks. It produces one canonical view per record, so the
// cross-product that follows does 34,600 comparisons over already-canonical strings instead
// of 34,600 normalisations.

import type {
  FieldPath,
  Invoice,
  InvoiceId,
  NormalisationNote,
  Payment,
  PaymentId,
  Side,
  VendorId,
} from '@/lib/types';
import type { DisplacementFinding, NormaliseConfig, NormaliseField } from '@/engine/normalise';
import {
  DEFAULT_CONFIG,
  normaliseField,
  normaliseInvoice,
  normalisePaymentLine,
} from '@/engine/normalise';
import { asPaise } from './money';
import { dayIndex } from './dates';
import type {
  PreparedInvoice,
  PreparedLedger,
  PreparedPayment,
  ReferenceSource,
  ReferenceView,
  VendorView,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Field paths — where a value came from, for the evidence and the conflicts
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_PATHS = Object.freeze({
  invoice_reference: 'invoice.reference' as FieldPath,
  invoice_purchase_order: 'invoice.purchase_order_reference' as FieldPath,
  invoice_vendor: 'invoice.vendor_name_raw' as FieldPath,
  invoice_gross: 'invoice.gross_paise' as FieldPath,
  invoice_date: 'invoice.invoice_date' as FieldPath,
  payment_narration: 'payment.narration_raw' as FieldPath,
  payment_amount: 'payment.amount_paise' as FieldPath,
  payment_value_date: 'payment.value_date' as FieldPath,
});

// ─────────────────────────────────────────────────────────────────────────────
// One reference token
// ─────────────────────────────────────────────────────────────────────────────

interface ReferenceViewInput {
  readonly source: ReferenceSource;
  readonly raw: string;
  readonly side: Side;
  readonly config: NormaliseConfig;
  readonly displacedFrom: FieldPath | null;
}

function referenceView(input: ReferenceViewInput): ReferenceView {
  const field = normaliseField('reference', input.raw, input.side, input.config);
  return {
    source: input.source,
    value: field.result.value,
    digits: field.result.digits,
    raw: field.result.raw,
    displaced: input.displacedFrom !== null,
    displaced_from: input.displacedFrom,
    note: field.note,
  };
}

/**
 * The reference tokens a displacement scan found sitting in a vendor field.
 *
 * `findDisplacedTokens` is engine/normalise's, and it answers a question about ONE field of
 * ONE record: is this token even the shape this field holds. Turning that finding into a
 * reference candidate — and recording where it actually sat — is the matcher's call, and
 * this is where it is made. `ReferenceEvidence.displaced` and `displaced_from` are filled
 * from exactly these.
 */
function displacedReferences(
  findings: readonly DisplacementFinding[],
  side: Side,
  from: FieldPath,
  config: NormaliseConfig,
): readonly ReferenceView[] {
  const out: ReferenceView[] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    if (finding.belongs_to !== 'reference') continue;
    if (seen.has(finding.token)) continue;
    seen.add(finding.token);
    out.push(
      referenceView({
        source: 'displaced_from_vendor',
        raw: finding.token,
        side,
        config,
        displacedFrom: from,
      }),
    );
  }
  return out;
}

function vendorView(
  value: string,
  raw: string,
  note: NormalisationNote | null,
  resolved: VendorId | null,
  declared: VendorId | null,
): VendorView {
  return { value, raw, vendor_id: resolved ?? declared, note };
}

// ─────────────────────────────────────────────────────────────────────────────
// Records
// ─────────────────────────────────────────────────────────────────────────────

export function prepareInvoice(
  invoice: Invoice,
  config: NormaliseConfig = DEFAULT_CONFIG,
): PreparedInvoice {
  const normalised = normaliseInvoice(invoice, config);
  const side: Side = 'invoice';

  const references: ReferenceView[] = [
    {
      source: 'reference_field',
      value: normalised.reference.result.value,
      digits: normalised.reference.result.digits,
      raw: normalised.reference.result.raw,
      displaced: false,
      displaced_from: null,
      note: normalised.reference.note,
    },
  ];

  if (normalised.purchase_order_reference !== null) {
    references.push({
      source: 'purchase_order',
      value: normalised.purchase_order_reference.result.value,
      digits: normalised.purchase_order_reference.result.digits,
      raw: normalised.purchase_order_reference.result.raw,
      displaced: false,
      displaced_from: null,
      note: normalised.purchase_order_reference.note,
    });
  }

  references.push(
    ...displacedReferences(
      normalised.vendor.displaced,
      side,
      FIELD_PATHS.invoice_vendor,
      config,
    ),
  );

  return {
    invoice,
    invoice_id: invoice.id,
    gross_paise: asPaise(invoice.gross_paise),
    references,
    vendor: vendorView(
      normalised.vendor.result.value,
      normalised.vendor.result.raw,
      normalised.vendor.note,
      normalised.vendor.result.resolved_vendor_id,
      invoice.vendor_id,
    ),
    day_index: dayIndex(invoice.invoice_date),
    due_day_index: dayIndex(invoice.due_date),
    received_day_index: dayIndex(invoice.received_date),
  };
}

/**
 * A bank line, from `narration_raw` alone.
 *
 * The narration is where every reference candidate on this side comes from, and that is
 * extraction rather than displacement: a narration is a mixed field by definition, so a
 * reference sitting in it is not out of place. Genuine payment-side displacement — a
 * reference token surviving into the VENDOR RESIDUE after the boilerplate is stripped — is
 * scanned for separately and marked, and in a well-behaved feed there is none.
 */
export function preparePayment(
  payment: Payment,
  config: NormaliseConfig = DEFAULT_CONFIG,
): PreparedPayment {
  const normalised = normalisePaymentLine(payment, config);
  const extraction = normalised.extraction;
  const side: Side = 'payment';

  const references: ReferenceView[] = extraction.references.map((field) => ({
    source: 'narration_token' as const,
    value: field.result.value,
    digits: field.result.digits,
    raw: field.result.raw,
    displaced: false,
    displaced_from: null,
    note: field.note,
  }));

  references.push(
    ...displacedReferences(
      extraction.vendor.displaced,
      side,
      FIELD_PATHS.payment_narration,
      config,
    ),
  );

  return {
    payment,
    payment_id: payment.id,
    amount_paise: asPaise(payment.amount_paise),
    references,
    vendor: vendorView(
      extraction.vendor.result.value,
      extraction.vendor.result.raw,
      extraction.vendor.note,
      extraction.vendor.result.resolved_vendor_id,
      payment.vendor_id,
    ),
    day_index: dayIndex(payment.value_date),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS: readonly NormaliseField[] = ['vendor', 'reference', 'narration', 'identifier'];

function profileIds(config: NormaliseConfig): Readonly<Record<NormaliseField, string>> {
  const out: Partial<Record<NormaliseField, string>> = {};
  for (const field of FIELDS) out[field] = config.profiles[field].id;
  return out as Record<NormaliseField, string>;
}

/**
 * Normalises every record once. The result is a VALUE the caller holds: pass it to
 * `matchLedger`, keep it, pass it again. There is no cache inside this module, deliberately
 * — a memo keyed on anything a caller cannot see makes two sweep runs disagree for a reason
 * neither run records, and a search over normalisation strategies is exactly the workload
 * that would hit it.
 */
export function prepareLedger(
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  config: NormaliseConfig = DEFAULT_CONFIG,
): PreparedLedger {
  const preparedInvoices = invoices.map((i) => prepareInvoice(i, config));
  const preparedPayments = payments.map((p) => preparePayment(p, config));
  const invoicesById = new Map<InvoiceId, PreparedInvoice>();
  for (const i of preparedInvoices) invoicesById.set(i.invoice_id, i);
  const paymentsById = new Map<PaymentId, PreparedPayment>();
  for (const p of preparedPayments) paymentsById.set(p.payment_id, p);

  return {
    invoices: preparedInvoices,
    payments: preparedPayments,
    invoices_by_id: invoicesById,
    payments_by_id: paymentsById,
    normalise_config: config,
    profile_ids: profileIds(config),
  };
}
