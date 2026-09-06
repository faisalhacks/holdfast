// Representative rows for the in-memory repository.
//
// This exists so the frontend is never blocked on the schema, the generator or the
// engine. It is a small, hand-checked reconciliation month: fourteen documents that
// settle cleanly and eight that do not, one per exception shape the contract names —
// a price variance, a duplicate pair, a bulk settlement with a residual, a payment whose
// narration carries no reference, a tax amount outside its band, a credit note that
// crosses a period, and a settlement booked in the following period.
//
// Everything derived is derived. Totals, coverage, money at risk, residuals, hashes and
// the journal chain are all computed from these rows at build time, so no figure the API
// publishes is written down twice.
//
// No real company, vendor, tax registration or bank identifier appears here. Dates are
// relative to the moment the process starts, so the queue always looks like this month.

import { HOLD_TYPES } from '@/lib/types';
import { HOLD_POLICY } from '@/engine/holds/registry';
import type {
  ActiveHold,
  AmountEvidence,
  ApplicationStatus,
  AuditEntry,
  CaseId,
  Conflict,
  DateEvidence,
  Decision,
  DecisionId,
  DeltaCause,
  EvidenceSet,
  FeedbackRule,
  FeedbackRuleId,
  FieldPath,
  Hold,
  HoldId,
  HoldPolicy,
  HoldType,
  Invoice,
  InvoiceId,
  IsoDate,
  IsoTimestamp,
  MatchCandidate,
  MatchCandidateId,
  MatchStatus,
  NormalisationNote,
  Paise,
  Payment,
  PaymentId,
  Ratio,
  ReferenceEvidence,
  ReviewerId,
  Run,
  RunId,
  ScoreBreakdown,
  ScoreWeights,
  Sha256,
  Tolerance,
  ToleranceChange,
  ToleranceChangeId,
  Vendor,
  VendorEvidence,
  VendorId,
} from '@/lib/types';
import { canonicalJson, dateAt, periodOf, sha256, timestampAt } from './ids';
import { paiseFromDigits, sumPaise } from './money';
import { sealEntry } from './journal';
import type { AuditDraft, OutcomeRow } from './repository';
import { computeRunTotals } from './totals';

// ── tiny brand helpers ──────────────────────────────────────────────────────────

const paise = (n: number): Paise => n as Paise;
const fp = (p: string): FieldPath => p as FieldPath;

const DAY_MS = 24 * 60 * 60 * 1000;
const ORIGIN = Date.now();

/** An instant `daysAgo` days back, at a fixed wall-clock time, milliseconds zeroed. */
function ago(daysAgo: number, hour: number, minute: number): number {
  const d = new Date(ORIGIN - daysAgo * DAY_MS);
  d.setUTCHours(hour, minute, 0, 0);
  return d.getTime();
}

const ts = (daysAgo: number, hour: number, minute: number): IsoTimestamp =>
  timestampAt(ago(daysAgo, hour, minute));
const day = (daysAgo: number): IsoDate => dateAt(ago(daysAgo, 0, 0));

// ── reviewers ───────────────────────────────────────────────────────────────────

export const REVIEWERS = {
  clerk: 'rev_a_iyer' as ReviewerId,
  manager: 'rev_s_bhatt' as ReviewerId,
  controller: 'rev_m_dsouza' as ReviewerId,
} as const;

// ── hold policy ─────────────────────────────────────────────────────────────────
//
// Read from engine/holds/registry.ts, which is frozen and is the single source.
//
// The API previously kept its own copy, written before the registry landed. The two had
// drifted on four of eleven types — `matching`, `tax_amount_range`, `no_reference` and
// `period_deferral` — so the queue was reporting that a tax_amount_range hold permitted
// accounting entries while the engine's policy said it blocked them. A detail screen whose
// "what this blocks" line disagrees with the engine is a screen that lies to a reviewer,
// and it would have lied on camera. One table, one owner.

export const HOLD_POLICIES: readonly HoldPolicy[] = HOLD_TYPES.map((t) => HOLD_POLICY[t]);

const POLICY_BY_TYPE = new Map<HoldType, HoldPolicy>(HOLD_POLICIES.map((p) => [p.type, p]));

function policy(type: HoldType): HoldPolicy {
  const found = POLICY_BY_TYPE.get(type);
  if (found === undefined) throw new Error(`no hold policy declared for "${type}"`);
  return found;
}

// ── scorer ──────────────────────────────────────────────────────────────────────

const SCORER_VERSION = 'holdfast-scorer@0.1.0-seed';
const ENGINE_VERSION = 'holdfast-engine@0.1.0-seed';

/** Declared weights, reported with every score so a reviewer can add the number up. */
const WEIGHTS: ScoreWeights = {
  amount: 0.4,
  reference: 0.3,
  date: 0.15,
  vendor: 0.15,
};

interface ScoreParts {
  readonly amount: Ratio;
  readonly reference: Ratio;
  readonly date: Ratio;
  readonly vendor: Ratio;
}

function breakdown(parts: ScoreParts): ScoreBreakdown {
  const component = (score: Ratio, weight: Ratio) => ({
    score,
    weight,
    contribution: score * weight,
  });
  const amount = component(parts.amount, WEIGHTS.amount);
  const reference = component(parts.reference, WEIGHTS.reference);
  const date = component(parts.date, WEIGHTS.date);
  const vendor = component(parts.vendor, WEIGHTS.vendor);
  return {
    amount,
    reference,
    date,
    vendor,
    weights: WEIGHTS,
    composite:
      amount.contribution + reference.contribution + date.contribution + vendor.contribution,
    scorer_version: SCORER_VERSION,
  };
}

// ── tolerances in force for the seeded run ──────────────────────────────────────

const TOLERANCES = {
  amount: { kind: 'absolute_paise', value: paise(20000) } as Tolerance,
  amountTight: { kind: 'absolute_paise', value: paise(2000) } as Tolerance,
  taxBand: { kind: 'absolute_paise', value: paise(40000) } as Tolerance,
  date: { kind: 'days', value: 30 } as Tolerance,
  dateTight: { kind: 'days', value: 5 } as Tolerance,
  reference: { kind: 'similarity', value: 0.9 } as Tolerance,
  vendor: { kind: 'similarity', value: 0.85 } as Tolerance,
} as const;

// ── evidence builders ───────────────────────────────────────────────────────────

function amountWithin(delta: number, base: number, tolerance: Tolerance): boolean {
  switch (tolerance.kind) {
    case 'exact':
      return delta === 0;
    case 'absolute_paise':
      return Math.abs(delta) <= Math.abs(tolerance.value);
    case 'percentage':
      return Math.abs(delta) <= Math.abs(base) * tolerance.value;
    default:
      return false;
  }
}

function amountEvidence(args: {
  invoiceAmount: Paise;
  paymentAmount: Paise | null;
  tolerance: Tolerance;
  cause: DeltaCause;
}): AmountEvidence {
  const settled = args.paymentAmount ?? paise(0);
  const delta = paise(settled - args.invoiceAmount);
  return {
    field: 'amount',
    path: fp('invoice.gross_paise'),
    invoice_value: args.invoiceAmount,
    payment_value: args.paymentAmount,
    tolerance: args.tolerance,
    within_tolerance: amountWithin(delta, args.invoiceAmount, args.tolerance),
    normalisation: null,
    delta,
    cause: args.cause,
  };
}

function dateEvidence(args: {
  invoiceDate: IsoDate;
  paymentDate: IsoDate | null;
  tolerance: Tolerance;
}): DateEvidence {
  const a = Date.parse(String(args.invoiceDate));
  const b = args.paymentDate === null ? a : Date.parse(String(args.paymentDate));
  const delta = Math.round((b - a) / DAY_MS);
  const within = args.tolerance.kind === 'days' ? Math.abs(delta) <= args.tolerance.value : false;
  return {
    field: 'date',
    path: fp('invoice.invoice_date'),
    invoice_value: args.invoiceDate,
    payment_value: args.paymentDate,
    tolerance: args.tolerance,
    within_tolerance: within,
    normalisation: null,
    delta,
  };
}

function vendorEvidence(args: {
  invoiceName: string;
  paymentName: string | null;
  similarity: Ratio;
  invoiceVendorId: VendorId | null;
  paymentVendorId: VendorId | null;
  normalisation?: NormalisationNote | null;
}): VendorEvidence {
  const floor = TOLERANCES.vendor.kind === 'similarity' ? TOLERANCES.vendor.value : 0;
  return {
    field: 'vendor',
    path: fp('invoice.vendor_name_raw'),
    invoice_value: args.invoiceName,
    payment_value: args.paymentName,
    tolerance: TOLERANCES.vendor,
    within_tolerance: args.similarity >= floor,
    normalisation: args.normalisation ?? null,
    delta: args.similarity,
    invoice_vendor_id: args.invoiceVendorId,
    payment_vendor_id: args.paymentVendorId,
  };
}

function referenceEvidence(args: {
  invoiceReference: string;
  paymentReference: string | null;
  similarity: Ratio;
  displaced?: boolean;
  displacedFrom?: FieldPath | null;
  normalisation?: NormalisationNote | null;
}): ReferenceEvidence {
  const floor = TOLERANCES.reference.kind === 'similarity' ? TOLERANCES.reference.value : 0;
  return {
    field: 'reference',
    path: fp('invoice.normalised_reference'),
    invoice_value: args.invoiceReference,
    payment_value: args.paymentReference,
    tolerance: TOLERANCES.reference,
    within_tolerance: args.similarity >= floor,
    normalisation: args.normalisation ?? null,
    delta: args.similarity,
    displaced: args.displaced ?? false,
    displaced_from: args.displacedFrom ?? null,
  };
}

// ── vendors ─────────────────────────────────────────────────────────────────────

const VENDORS: readonly Vendor[] = [
  {
    id: 'ven_trivarna' as VendorId,
    name: 'Trivarna Precision Components Pvt Ltd',
    normalised_name: 'trivarna precision components',
    tax_identifier: '29AAZZT1111A1Z5',
  },
  {
    id: 'ven_aavarta' as VendorId,
    name: 'Aavarta Logistics LLP',
    normalised_name: 'aavarta logistics',
    tax_identifier: '27AAZZA2222B1Z3',
  },
  {
    id: 'ven_nirvaha' as VendorId,
    name: 'Nirvaha Paper Mills Ltd',
    normalised_name: 'nirvaha paper mills',
    tax_identifier: '33AAZZN3333C1Z1',
  },
  {
    id: 'ven_suchitra' as VendorId,
    name: 'Suchitra Facilities Services Pvt Ltd',
    normalised_name: 'suchitra facilities services',
    tax_identifier: null,
  },
];

function vendorAt(index: number): Vendor {
  const v = VENDORS[index % VENDORS.length];
  if (v === undefined) throw new Error('vendor table is empty');
  return v;
}

// ── invoice construction ────────────────────────────────────────────────────────

interface InvoiceSpec {
  readonly id: string;
  readonly reference: string;
  readonly vendor: Vendor;
  readonly daysAgo: number;
  readonly net: number;
  readonly igst?: number;
  readonly cgst?: number;
  readonly sgst?: number;
  readonly cess?: number;
  readonly creditNote?: boolean;
  readonly purchaseOrder?: string | null;
  readonly recurrence?: 'monthly' | 'quarterly' | 'instalment' | null;
}

function makeInvoice(spec: InvoiceSpec): Invoice {
  const igst = spec.igst ?? 0;
  const cgst = spec.cgst ?? 0;
  const sgst = spec.sgst ?? 0;
  const cess = spec.cess ?? 0;
  const taxTotal = igst + cgst + sgst + cess;
  const invoiceDate = day(spec.daysAgo);
  return {
    id: spec.id as InvoiceId,
    reference: spec.reference,
    normalised_reference: spec.reference.replace(/[^A-Za-z0-9]/g, '').toLowerCase(),
    vendor_id: spec.vendor.id,
    vendor_name_raw: spec.vendor.name,
    invoice_date: invoiceDate,
    received_date: day(Math.max(spec.daysAgo - 2, 0)),
    due_date: dateAt(ago(spec.daysAgo, 0, 0) + 30 * DAY_MS),
    period: periodOf(invoiceDate),
    gross_paise: paise(spec.net + taxTotal),
    net_paise: paise(spec.net),
    tax: {
      total_paise: paise(taxTotal),
      igst_paise: paise(igst),
      cgst_paise: paise(cgst),
      sgst_paise: paise(sgst),
      cess_paise: paise(cess),
    },
    currency: 'INR',
    is_credit_note: spec.creditNote ?? false,
    recurrence: spec.recurrence ?? null,
    purchase_order_reference: spec.purchaseOrder ?? null,
    created_at: ts(spec.daysAgo, 6, 30),
  };
}

interface PaymentSpec {
  readonly id: string;
  readonly amount: number;
  readonly daysAgo: number;
  readonly narration: string;
  readonly reference: string | null;
  readonly vendorName: string | null;
  readonly vendorId: VendorId | null;
  readonly status: ApplicationStatus;
  readonly bankTransactionId: string;
}

function makePayment(spec: PaymentSpec): Payment {
  return {
    id: spec.id as PaymentId,
    value_date: day(spec.daysAgo),
    amount_paise: paise(spec.amount),
    currency: 'INR',
    narration_raw: spec.narration,
    narration_normalised: spec.narration.replace(/\s+/g, ' ').trim().toLowerCase(),
    reference_extracted: spec.reference,
    vendor_name_extracted: spec.vendorName,
    vendor_id: spec.vendorId,
    application_status: spec.status,
    bank_transaction_id: spec.bankTransactionId,
    created_at: ts(spec.daysAgo, 7, 5),
  };
}

// ── the clean fourteen ──────────────────────────────────────────────────────────
//
// Net and tax are both written down as integers because deriving one from the other with
// a percentage would put a division into a money path. Each pair is 18% of the net.

const CLEAN: readonly { net: number; tax: number }[] = [
  { net: 1150000, tax: 207000 },
  { net: 2380000, tax: 428400 },
  { net: 3120000, tax: 561600 },
  { net: 4450000, tax: 801000 },
  { net: 5260000, tax: 946800 },
  { net: 6180000, tax: 1112400 },
  { net: 7340000, tax: 1321200 },
  { net: 8420000, tax: 1515600 },
  { net: 9510000, tax: 1711800 },
  { net: 10630000, tax: 1913400 },
  { net: 11780000, tax: 2120400 },
  { net: 12840000, tax: 2311200 },
  { net: 13960000, tax: 2512800 },
  { net: 15020000, tax: 2703600 },
];

function pad(n: number): string {
  return String(n).padStart(4, '0');
}

// ── exception invoices ──────────────────────────────────────────────────────────

const INV_PRICE = makeInvoice({
  id: 'inv_x_price',
  reference: 'TRV/2026/0412',
  vendor: vendorAt(0),
  daysAgo: 34,
  net: 16000000,
  cgst: 1440000,
  sgst: 1440000,
  purchaseOrder: 'PO-2026-0184',
});

const INV_DUP_A = makeInvoice({
  id: 'inv_x_dup_a',
  reference: 'AAV-2026-0415',
  vendor: vendorAt(1),
  daysAgo: 31,
  net: 5700000,
  igst: 1026000,
  purchaseOrder: 'PO-2026-0190',
});

const INV_DUP_B = makeInvoice({
  id: 'inv_x_dup_b',
  reference: 'AAV-2026-0415-R',
  vendor: vendorAt(1),
  daysAgo: 31,
  net: 5700000,
  igst: 1026000,
  purchaseOrder: 'PO-2026-0190',
});

const INV_CARD = makeInvoice({
  id: 'inv_x_card',
  reference: 'NIR/2026/0421',
  vendor: vendorAt(2),
  daysAgo: 29,
  net: 35000000,
  cgst: 3150000,
  sgst: 3150000,
  purchaseOrder: 'PO-2026-0201',
});

const INV_NOREF = makeInvoice({
  id: 'inv_x_noref',
  reference: 'AAV-2026-0423',
  vendor: vendorAt(1),
  daysAgo: 26,
  net: 7500000,
  igst: 1350000,
});

const INV_TAX = makeInvoice({
  id: 'inv_x_tax',
  reference: 'SUC/2026/0428',
  vendor: vendorAt(3),
  daysAgo: 24,
  net: 13200000,
  cgst: 1188000,
  sgst: 1188000,
  cess: 45000,
  purchaseOrder: 'PO-2026-0212',
});

const INV_CREDIT = makeInvoice({
  id: 'inv_x_credit',
  reference: 'TRV/2026/CN-0009',
  vendor: vendorAt(0),
  daysAgo: 22,
  net: -2700000,
  igst: -486000,
  creditNote: true,
});

const INV_PERIOD = makeInvoice({
  id: 'inv_x_period',
  reference: 'NIR/2026/0430',
  vendor: vendorAt(2),
  daysAgo: 19,
  net: 8300000,
  cgst: 747000,
  sgst: 747000,
  recurrence: 'monthly',
});

// ── payments ────────────────────────────────────────────────────────────────────

const PAY_PRICE = makePayment({
  id: 'pay_x_price',
  amount: 18832500,
  daysAgo: 12,
  narration: 'NEFT-INW-448120 TRIVARNA PRECISION COMPO TRV/2026/0412 LESS BANK CHG',
  reference: 'TRV/2026/0412',
  vendorName: 'TRIVARNA PRECISION COMPO',
  vendorId: vendorAt(0).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0448120',
});

const PAY_DUP = makePayment({
  id: 'pay_x_dup',
  amount: 6726000,
  daysAgo: 11,
  narration: 'RTGS-INW-551903 AAVARTA LOGISTICS AAV-2026-0415',
  reference: 'AAV-2026-0415',
  vendorName: 'AAVARTA LOGISTICS',
  vendorId: vendorAt(1).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0551903',
});

const PAY_CARD_1 = makePayment({
  id: 'pay_x_card_1',
  amount: 15000000,
  daysAgo: 14,
  narration: 'RTGS-INW-662011 NIRVAHA PAPER MILLS NIR/2026/0421 PART 1',
  reference: 'NIR/2026/0421',
  vendorName: 'NIRVAHA PAPER MILLS',
  vendorId: vendorAt(2).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0662011',
});

const PAY_CARD_2 = makePayment({
  id: 'pay_x_card_2',
  amount: 15000000,
  daysAgo: 10,
  narration: 'RTGS-INW-662488 NIRVAHA PAPER MILLS NIR/2026/0421 PART 2',
  reference: 'NIR/2026/0421',
  vendorName: 'NIRVAHA PAPER MILLS',
  vendorId: vendorAt(2).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0662488',
});

const PAY_CARD_3 = makePayment({
  id: 'pay_x_card_3',
  amount: 9000000,
  daysAgo: 8,
  narration: 'RTGS-INW-663120 NIRVAHA PAPER MILLS NIR/2026/0421 FINAL',
  reference: 'NIR/2026/0421',
  vendorName: 'NIRVAHA PAPER MILLS',
  vendorId: vendorAt(2).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0663120',
});

const PAY_NOREF = makePayment({
  id: 'pay_x_noref',
  amount: 8850000,
  daysAgo: 9,
  narration: 'NEFT INWARD CR  AAVARTA LOG  MISC SETTLEMENT  NO REF QUOTED',
  reference: null,
  vendorName: 'AAVARTA LOG',
  vendorId: vendorAt(1).id,
  status: 'unidentified',
  bankTransactionId: 'BTX-2026-0701445',
});

const PAY_TAX = makePayment({
  id: 'pay_x_tax',
  amount: 15621000,
  daysAgo: 7,
  narration: 'NEFT-INW-712330 SUCHITRA FACILITIES SUC/2026/0428',
  reference: 'SUC/2026/0428',
  vendorName: 'SUCHITRA FACILITIES',
  vendorId: vendorAt(3).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0712330',
});

const PAY_PERIOD = makePayment({
  id: 'pay_x_period',
  amount: 9794000,
  daysAgo: 4,
  narration: 'RTGS-INW-778201 NIRVAHA PAPER MILLS NIR/2026/0430',
  reference: 'NIR/2026/0430',
  vendorName: 'NIRVAHA PAPER MILLS',
  vendorId: vendorAt(2).id,
  status: 'unapplied',
  bankTransactionId: 'BTX-2026-0778201',
});

// ── assembly ────────────────────────────────────────────────────────────────────

export interface CaseRow {
  case_id: CaseId;
  run_id: RunId;
  invoice_id: InvoiceId;
  held_since: IsoTimestamp;
  money_at_risk_paise: Paise;
  application_status: ApplicationStatus;
}

export interface SeedData {
  vendors: Vendor[];
  invoices: Invoice[];
  payments: Payment[];
  runs: Run[];
  holds: Hold[];
  candidates: MatchCandidate[];
  caseRows: CaseRow[];
  outcomes: OutcomeRow[];
  decisions: Decision[];
  toleranceChanges: ToleranceChange[];
  feedbackRules: FeedbackRule[];
  audit: AuditEntry[];
  holdPolicies: readonly HoldPolicy[];
}

const RUN_A = 'run_engine_a' as RunId;
const RUN_B = 'run_rerun_b' as RunId;

const FBR_REFERENCE = 'fbr_reference_aavarta_slash' as FeedbackRuleId;
const FBR_VENDOR_ALIAS = 'fbr_vendor_alias_aavarta_log' as FeedbackRuleId;

interface HoldSpec {
  readonly id: string;
  readonly caseId: string;
  readonly invoice: Invoice;
  readonly type: HoldType;
  readonly conflicts: readonly Conflict[];
  readonly severityOverride?: Hold['severity'];
}

function makeHold(runId: RunId, spec: HoldSpec, appliedAt: IsoTimestamp): ActiveHold {
  const p = policy(spec.type);
  return {
    id: spec.id as HoldId,
    run_id: runId,
    case_id: spec.caseId as CaseId,
    invoice_id: spec.invoice.id,
    type: spec.type,
    reason: p.clause,
    applied_at: appliedAt,
    auto_releasable: p.auto_releasable,
    blocks_accounting: p.blocks_accounting,
    severity: spec.severityOverride ?? p.default_severity,
    conflicts: spec.conflicts,
    released_by: null,
    released_at: null,
    release_reason: null,
  };
}

function conflict(
  code: Conflict['code'],
  path: string,
  clause: string,
  severity: Conflict['severity'],
): Conflict {
  return { code, field_path: fp(path), clause, severity };
}

interface CandidateSpec {
  readonly id: string;
  readonly invoice: Invoice;
  readonly payments: readonly Payment[];
  readonly cardinality: MatchCandidate['cardinality'];
  readonly parts: ScoreParts;
  readonly evidence: EvidenceSet;
  readonly conflicts: readonly Conflict[];
  readonly proposedBy: MatchCandidate['proposed_by'];
  readonly rank: number;
}

function makeCandidate(
  runId: RunId,
  spec: CandidateSpec,
  createdAt: IsoTimestamp,
): MatchCandidate {
  const settled = sumPaise(spec.payments.map((p) => p.amount_paise));
  const residual = paiseFromDigits(
    (BigInt(spec.invoice.gross_paise) - settled).toString(),
    'residual_paise',
  );
  return {
    id: spec.id as MatchCandidateId,
    run_id: runId,
    invoice_id: spec.invoice.id,
    payment_ids: spec.payments.map((p) => p.id),
    cardinality: spec.cardinality,
    score: breakdown(spec.parts),
    evidence: spec.evidence,
    conflicts: spec.conflicts,
    residual_paise: residual,
    proposed_by: spec.proposedBy,
    reverified: true,
    rank: spec.rank,
    created_at: createdAt,
  };
}

function cleanEvidence(invoice: Invoice, payment: Payment): EvidenceSet {
  return {
    vendor: vendorEvidence({
      invoiceName: invoice.vendor_name_raw,
      paymentName: payment.vendor_name_extracted,
      similarity: 1,
      invoiceVendorId: invoice.vendor_id,
      paymentVendorId: payment.vendor_id,
    }),
    amount: amountEvidence({
      invoiceAmount: invoice.gross_paise,
      paymentAmount: payment.amount_paise,
      tolerance: TOLERANCES.amount,
      cause: 'unattributed',
    }),
    date: dateEvidence({
      invoiceDate: invoice.invoice_date,
      paymentDate: payment.value_date,
      tolerance: TOLERANCES.date,
    }),
    reference: referenceEvidence({
      invoiceReference: invoice.reference,
      paymentReference: payment.reference_extracted,
      similarity: 1,
      normalisation: null,
    }),
  };
}

/** Builds one complete, mutable dataset. The memory repository owns a single instance. */
export function buildSeed(): SeedData {
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const candidates: MatchCandidate[] = [];
  const holds: Hold[] = [];
  const caseRows: CaseRow[] = [];
  const outcomes: OutcomeRow[] = [];

  const runAStarted = ts(6, 2, 10);
  const runAFinished = ts(6, 2, 14);
  const runBStarted = ts(1, 2, 10);
  const runBFinished = ts(1, 2, 13);

  // ── the fourteen that settle cleanly ─────────────────────────────────────────
  CLEAN.forEach((spec, index) => {
    const vendor = vendorAt(index);
    const reference = `${vendor.normalised_name.slice(0, 3).toUpperCase()}/2026/${pad(1100 + index)}`;
    const invoice = makeInvoice({
      id: `inv_c${pad(index + 1)}`,
      reference,
      vendor,
      daysAgo: 40 - index,
      net: spec.net,
      igst: spec.tax,
      purchaseOrder: `PO-2026-${pad(index + 1)}`,
    });
    const payment = makePayment({
      id: `pay_c${pad(index + 1)}`,
      amount: spec.net + spec.tax,
      daysAgo: Math.max(20 - index, 3),
      narration: `NEFT-INW-${400000 + index} ${vendor.name.toUpperCase().slice(0, 24)} ${reference}`,
      reference,
      vendorName: vendor.name.toUpperCase().slice(0, 24),
      vendorId: vendor.id,
      status: 'applied',
      bankTransactionId: `BTX-2026-${pad(index + 1)}`,
    });
    invoices.push(invoice);
    payments.push(payment);
    candidates.push(
      makeCandidate(
        RUN_A,
        {
          id: `cand_a_c${pad(index + 1)}`,
          invoice,
          payments: [payment],
          cardinality: 'one_to_one',
          parts: { amount: 1, reference: 1, date: 1, vendor: 1 },
          evidence: cleanEvidence(invoice, payment),
          conflicts: [],
          proposedBy: 'deterministic_exact',
          rank: 1,
        },
        runAFinished,
      ),
    );
    outcomes.push({
      run_id: RUN_A,
      invoice_id: invoice.id,
      case_id: null,
      status: 'auto_cleared' as MatchStatus,
      hold_types: [],
      money_at_risk_paise: paise(0),
    });
  });

  // ── the eight exceptions ─────────────────────────────────────────────────────
  invoices.push(
    INV_PRICE,
    INV_DUP_A,
    INV_DUP_B,
    INV_CARD,
    INV_NOREF,
    INV_TAX,
    INV_CREDIT,
    INV_PERIOD,
  );
  payments.push(
    PAY_PRICE,
    PAY_DUP,
    PAY_CARD_1,
    PAY_CARD_2,
    PAY_CARD_3,
    PAY_NOREF,
    PAY_TAX,
    PAY_PERIOD,
  );

  const aliasNote: NormalisationNote = {
    side: 'payment',
    raw_value: 'AAVARTA LOG',
    normalised_value: 'aavarta logistics',
    rule: 'vendor alias, feedback rule',
    feedback_rule_id: FBR_VENDOR_ALIAS,
  };

  // price variance
  const candPrice = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_price',
      invoice: INV_PRICE,
      payments: [PAY_PRICE],
      cardinality: 'one_to_one',
      parts: { amount: 0.62, reference: 1, date: 1, vendor: 0.98 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_PRICE.vendor_name_raw,
          paymentName: PAY_PRICE.vendor_name_extracted,
          similarity: 0.98,
          invoiceVendorId: INV_PRICE.vendor_id,
          paymentVendorId: PAY_PRICE.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_PRICE.gross_paise,
          paymentAmount: PAY_PRICE.amount_paise,
          tolerance: TOLERANCES.amount,
          cause: 'bank_charge',
        }),
        date: dateEvidence({
          invoiceDate: INV_PRICE.invoice_date,
          paymentDate: PAY_PRICE.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_PRICE.reference,
          paymentReference: PAY_PRICE.reference_extracted,
          similarity: 1,
        }),
      },
      conflicts: [
        conflict(
          'amount_over_tolerance',
          'invoice.gross_paise',
          'settled amount is short of the invoice beyond the absolute tolerance',
          'material',
        ),
      ],
      proposedBy: 'deterministic_exact',
      rank: 1,
    },
    runAFinished,
  );

  // duplicate pair
  const dupConflicts: readonly Conflict[] = [
    conflict(
      'duplicate_vendor_amount_date',
      'invoice.vendor_id',
      'another document shares vendor, amount and invoice date',
      'blocking',
    ),
    conflict(
      'multiple_candidates_tied',
      'candidate.payment_ids',
      'one settlement is claimed by two documents at the same score',
      'material',
    ),
  ];

  const candDupA = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_dup_a',
      invoice: INV_DUP_A,
      payments: [PAY_DUP],
      cardinality: 'one_to_one',
      parts: { amount: 1, reference: 1, date: 1, vendor: 1 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_DUP_A.vendor_name_raw,
          paymentName: PAY_DUP.vendor_name_extracted,
          similarity: 1,
          invoiceVendorId: INV_DUP_A.vendor_id,
          paymentVendorId: PAY_DUP.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_DUP_A.gross_paise,
          paymentAmount: PAY_DUP.amount_paise,
          tolerance: TOLERANCES.amountTight,
          cause: 'unattributed',
        }),
        date: dateEvidence({
          invoiceDate: INV_DUP_A.invoice_date,
          paymentDate: PAY_DUP.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_DUP_A.reference,
          paymentReference: PAY_DUP.reference_extracted,
          similarity: 1,
        }),
      },
      conflicts: dupConflicts,
      proposedBy: 'deterministic_exact',
      rank: 1,
    },
    runAFinished,
  );

  const candDupB = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_dup_b',
      invoice: INV_DUP_B,
      payments: [PAY_DUP],
      cardinality: 'one_to_one',
      parts: { amount: 1, reference: 0.94, date: 1, vendor: 1 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_DUP_B.vendor_name_raw,
          paymentName: PAY_DUP.vendor_name_extracted,
          similarity: 1,
          invoiceVendorId: INV_DUP_B.vendor_id,
          paymentVendorId: PAY_DUP.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_DUP_B.gross_paise,
          paymentAmount: PAY_DUP.amount_paise,
          tolerance: TOLERANCES.amountTight,
          cause: 'unattributed',
        }),
        date: dateEvidence({
          invoiceDate: INV_DUP_B.invoice_date,
          paymentDate: PAY_DUP.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_DUP_B.reference,
          paymentReference: PAY_DUP.reference_extracted,
          similarity: 0.94,
        }),
      },
      conflicts: dupConflicts,
      proposedBy: 'deterministic_fuzzy',
      rank: 2,
    },
    runAFinished,
  );

  // bulk settlement with a residual
  const candCard = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_card',
      invoice: INV_CARD,
      payments: [PAY_CARD_1, PAY_CARD_2, PAY_CARD_3],
      cardinality: 'one_to_many',
      parts: { amount: 0.71, reference: 1, date: 0.9, vendor: 1 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_CARD.vendor_name_raw,
          paymentName: PAY_CARD_3.vendor_name_extracted,
          similarity: 1,
          invoiceVendorId: INV_CARD.vendor_id,
          paymentVendorId: PAY_CARD_3.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_CARD.gross_paise,
          paymentAmount: paiseFromDigits(
            sumPaise([
              PAY_CARD_1.amount_paise,
              PAY_CARD_2.amount_paise,
              PAY_CARD_3.amount_paise,
            ]).toString(),
            'settled_paise',
          ),
          tolerance: TOLERANCES.amount,
          cause: 'partial_settlement',
        }),
        date: dateEvidence({
          invoiceDate: INV_CARD.invoice_date,
          paymentDate: PAY_CARD_3.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_CARD.reference,
          paymentReference: PAY_CARD_3.reference_extracted,
          similarity: 1,
        }),
      },
      conflicts: [
        conflict(
          'residual_unsettled',
          'candidate.residual_paise',
          'the settled set leaves a residual on the document',
          'material',
        ),
      ],
      proposedBy: 'cardinality_search',
      rank: 1,
    },
    runAFinished,
  );

  // no reference in the narration
  const candNoref = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_noref',
      invoice: INV_NOREF,
      payments: [PAY_NOREF],
      cardinality: 'one_to_one',
      parts: { amount: 1, reference: 0, date: 0.88, vendor: 0.91 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_NOREF.vendor_name_raw,
          paymentName: PAY_NOREF.vendor_name_extracted,
          similarity: 0.91,
          invoiceVendorId: INV_NOREF.vendor_id,
          paymentVendorId: PAY_NOREF.vendor_id,
          normalisation: aliasNote,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_NOREF.gross_paise,
          paymentAmount: PAY_NOREF.amount_paise,
          tolerance: TOLERANCES.amountTight,
          cause: 'unattributed',
        }),
        date: dateEvidence({
          invoiceDate: INV_NOREF.invoice_date,
          paymentDate: PAY_NOREF.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_NOREF.reference,
          paymentReference: null,
          similarity: 0,
          normalisation: {
            side: 'payment',
            raw_value: PAY_NOREF.narration_raw,
            normalised_value: PAY_NOREF.narration_normalised,
            rule: 'reference extraction found no token',
            feedback_rule_id: null,
          },
        }),
      },
      conflicts: [
        conflict(
          'reference_absent',
          'payment.reference_extracted',
          'the narration carries no reference token',
          'material',
        ),
      ],
      proposedBy: 'deterministic_fuzzy',
      rank: 1,
    },
    runAFinished,
  );

  // tax amount outside its band
  const candTax = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_tax',
      invoice: INV_TAX,
      payments: [PAY_TAX],
      cardinality: 'one_to_one',
      parts: { amount: 1, reference: 1, date: 1, vendor: 1 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_TAX.vendor_name_raw,
          paymentName: PAY_TAX.vendor_name_extracted,
          similarity: 1,
          invoiceVendorId: INV_TAX.vendor_id,
          paymentVendorId: PAY_TAX.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_TAX.gross_paise,
          paymentAmount: PAY_TAX.amount_paise,
          tolerance: TOLERANCES.amount,
          cause: 'unattributed',
        }),
        date: dateEvidence({
          invoiceDate: INV_TAX.invoice_date,
          paymentDate: PAY_TAX.value_date,
          tolerance: TOLERANCES.date,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_TAX.reference,
          paymentReference: PAY_TAX.reference_extracted,
          similarity: 1,
        }),
      },
      conflicts: [
        conflict(
          'tax_total_mismatch',
          'invoice.tax.total_paise',
          'tax total exceeds the absolute band declared for this document class',
          'advisory',
        ),
      ],
      proposedBy: 'deterministic_exact',
      rank: 1,
    },
    runAFinished,
  );

  // credit note crossing a period, no candidate at all
  const creditConflicts: readonly Conflict[] = [
    conflict(
      'credit_note_crosses_period',
      'invoice.period',
      'the credit note settles against a document in an earlier period',
      'material',
    ),
    conflict(
      'no_candidate_found',
      'candidate.payment_ids',
      'no settlement line was found for this document',
      'material',
    ),
  ];

  // settlement booked in the following period
  const candPeriod = makeCandidate(
    RUN_A,
    {
      id: 'cand_a_period',
      invoice: INV_PERIOD,
      payments: [PAY_PERIOD],
      cardinality: 'one_to_one',
      parts: { amount: 1, reference: 1, date: 0.72, vendor: 1 },
      evidence: {
        vendor: vendorEvidence({
          invoiceName: INV_PERIOD.vendor_name_raw,
          paymentName: PAY_PERIOD.vendor_name_extracted,
          similarity: 1,
          invoiceVendorId: INV_PERIOD.vendor_id,
          paymentVendorId: PAY_PERIOD.vendor_id,
        }),
        amount: amountEvidence({
          invoiceAmount: INV_PERIOD.gross_paise,
          paymentAmount: PAY_PERIOD.amount_paise,
          tolerance: TOLERANCES.amount,
          cause: 'unattributed',
        }),
        date: dateEvidence({
          invoiceDate: INV_PERIOD.invoice_date,
          paymentDate: PAY_PERIOD.value_date,
          tolerance: TOLERANCES.dateTight,
        }),
        reference: referenceEvidence({
          invoiceReference: INV_PERIOD.reference,
          paymentReference: PAY_PERIOD.reference_extracted,
          similarity: 1,
        }),
      },
      conflicts: [
        conflict(
          'period_mismatch',
          'payment.value_date',
          'the settlement falls in the period after the invoice period',
          'advisory',
        ),
      ],
      proposedBy: 'deterministic_exact',
      rank: 1,
    },
    runAFinished,
  );

  candidates.push(
    candPrice,
    candDupA,
    candDupB,
    candCard,
    candNoref,
    candTax,
    candPeriod,
  );

  const exceptionHolds: readonly { spec: HoldSpec; status: ApplicationStatus }[] = [
    {
      spec: {
        id: 'hold_a_price',
        caseId: 'case_a_price',
        invoice: INV_PRICE,
        type: 'price_variance',
        conflicts: candPrice.conflicts,
      },
      status: 'unapplied',
    },
    {
      spec: {
        id: 'hold_a_dup_a',
        caseId: 'case_a_dup_a',
        invoice: INV_DUP_A,
        type: 'duplicate_candidate',
        conflicts: dupConflicts,
      },
      status: 'unapplied',
    },
    {
      spec: {
        id: 'hold_a_dup_b',
        caseId: 'case_a_dup_b',
        invoice: INV_DUP_B,
        type: 'duplicate_candidate',
        conflicts: dupConflicts,
      },
      status: 'unapplied',
    },
    {
      spec: {
        id: 'hold_a_card',
        caseId: 'case_a_card',
        invoice: INV_CARD,
        type: 'cardinality_residual',
        conflicts: candCard.conflicts,
      },
      status: 'unapplied',
    },
    {
      spec: {
        id: 'hold_a_noref',
        caseId: 'case_a_noref',
        invoice: INV_NOREF,
        type: 'no_reference',
        conflicts: candNoref.conflicts,
      },
      status: 'unidentified',
    },
    {
      spec: {
        id: 'hold_a_tax',
        caseId: 'case_a_tax',
        invoice: INV_TAX,
        type: 'tax_amount_range',
        conflicts: candTax.conflicts,
      },
      status: 'unapplied',
    },
    {
      spec: {
        id: 'hold_a_credit',
        caseId: 'case_a_credit',
        invoice: INV_CREDIT,
        type: 'credit_note_crossing',
        conflicts: creditConflicts,
      },
      status: 'on_account',
    },
    {
      spec: {
        id: 'hold_a_period',
        caseId: 'case_a_period',
        invoice: INV_PERIOD,
        type: 'period_deferral',
        conflicts: candPeriod.conflicts,
      },
      status: 'unapplied',
    },
  ];

  const candidateByInvoice = new Map<InvoiceId, MatchCandidate>();
  for (const c of candidates) {
    const existing = candidateByInvoice.get(c.invoice_id);
    if (existing === undefined || c.rank < existing.rank) candidateByInvoice.set(c.invoice_id, c);
  }

  for (const entry of exceptionHolds) {
    const hold = makeHold(RUN_A, entry.spec, runAFinished);
    holds.push(hold);

    const top = candidateByInvoice.get(entry.spec.invoice.id) ?? null;
    // Money at risk is the residual when a residual is what is unresolved, and the whole
    // document otherwise. Magnitude, so a credit note contributes what it is worth.
    const risk =
      entry.spec.type === 'cardinality_residual' && top !== null
        ? BigInt(top.residual_paise)
        : BigInt(entry.spec.invoice.gross_paise);
    const magnitude = risk < BigInt(0) ? -risk : risk;

    caseRows.push({
      case_id: entry.spec.caseId as CaseId,
      run_id: RUN_A,
      invoice_id: entry.spec.invoice.id,
      held_since: runAFinished,
      money_at_risk_paise: paiseFromDigits(magnitude.toString(), 'money_at_risk_paise'),
      application_status: entry.status,
    });

    outcomes.push({
      run_id: RUN_A,
      invoice_id: entry.spec.invoice.id,
      case_id: entry.spec.caseId as CaseId,
      status: 'held' as MatchStatus,
      hold_types: [entry.spec.type],
      money_at_risk_paise: paiseFromDigits(magnitude.toString(), 'money_at_risk_paise'),
    });
  }

  // ── the rerun: same frozen input, one feedback rule in force ─────────────────
  //
  // A rerun is a DIFF, never a mutation. Run A's rows are untouched; run B gets its own
  // holds, cases and outcomes, and the reference-pattern rule recovers the settlement
  // whose narration carried no usable token.

  const runBOutcomes: OutcomeRow[] = [];
  const runBHolds: Hold[] = [];
  const runBCases: CaseRow[] = [];

  for (const outcome of outcomes) {
    if (outcome.invoice_id === INV_NOREF.id) {
      runBOutcomes.push({
        run_id: RUN_B,
        invoice_id: outcome.invoice_id,
        case_id: null,
        status: 'auto_cleared' as MatchStatus,
        hold_types: [],
        money_at_risk_paise: paise(0),
      });
      continue;
    }
    runBOutcomes.push({
      ...outcome,
      run_id: RUN_B,
      case_id: outcome.case_id === null ? null : (`${outcome.case_id}_b` as CaseId),
    });
  }

  for (const hold of holds) {
    if (hold.invoice_id === INV_NOREF.id) continue;
    runBHolds.push({
      ...hold,
      id: `${hold.id}_b` as HoldId,
      run_id: RUN_B,
      case_id: `${hold.case_id}_b` as CaseId,
      applied_at: runBFinished,
    });
  }

  for (const row of caseRows) {
    if (row.invoice_id === INV_NOREF.id) continue;
    runBCases.push({ ...row, case_id: `${row.case_id}_b` as CaseId, run_id: RUN_B, held_since: runBFinished });
  }

  const runBCandidates = candidates
    .filter((c) => c.invoice_id !== INV_NOREF.id)
    .map((c) => ({ ...c, id: `${c.id}_b` as MatchCandidateId, run_id: RUN_B, created_at: runBFinished }));

  runBCandidates.push({
    ...candNoref,
    id: 'cand_b_noref' as MatchCandidateId,
    run_id: RUN_B,
    created_at: runBFinished,
    proposed_by: 'feedback_rule',
    conflicts: [],
    score: breakdown({ amount: 1, reference: 0.96, date: 0.88, vendor: 0.98 }),
    evidence: {
      ...candNoref.evidence,
      reference: referenceEvidence({
        invoiceReference: INV_NOREF.reference,
        paymentReference: 'AAV-2026-0423',
        similarity: 0.96,
        displaced: true,
        displacedFrom: fp('payment.narration_raw'),
        normalisation: {
          side: 'payment',
          raw_value: PAY_NOREF.narration_raw,
          normalised_value: 'aav-2026-0423',
          rule: 'reference pattern, feedback rule',
          feedback_rule_id: FBR_REFERENCE,
        },
      }),
    },
  });

  // ── feedback rules ───────────────────────────────────────────────────────────

  const feedbackRules: FeedbackRule[] = [
    {
      id: FBR_VENDOR_ALIAS,
      body: {
        kind: 'vendor_alias',
        raw_value: 'AAVARTA LOG',
        canonical_vendor_id: vendorAt(1).id,
      },
      learned_from_case_id: 'case_a_noref' as CaseId,
      created_by: REVIEWERS.clerk,
      created_at: ts(5, 11, 20),
      reason: 'the bank truncates this vendor name to eleven characters on every line',
      active: true,
      deactivated_by: null,
      deactivated_at: null,
    },
    {
      id: FBR_REFERENCE,
      body: {
        kind: 'reference_pattern',
        pattern: 'AAV[- ]?([0-9]{4})[- ]?([0-9]{4})',
        canonical_form: 'AAV-$1-$2',
      },
      learned_from_case_id: 'case_a_noref' as CaseId,
      created_by: REVIEWERS.clerk,
      created_at: ts(3, 15, 5),
      reason: 'this vendor quotes the reference without separators in the narration tail',
      active: true,
      deactivated_by: null,
      deactivated_at: null,
    },
  ];

  // ── a tolerance change, recorded as a decision ───────────────────────────────

  const toleranceChangeId = 'tch_tax_band_widened' as ToleranceChangeId;
  const toleranceDecisionId = 'dec_tax_band' as DecisionId;
  const toleranceAt = ts(3, 9, 40);

  const taxHold = holds.find((h) => h.id === ('hold_a_tax' as HoldId));
  if (taxHold === undefined) throw new Error('seed lost the tax hold');

  const releasedTaxHold: Hold = {
    ...taxHold,
    released_by: REVIEWERS.controller,
    released_at: toleranceAt,
    release_reason: `tolerance change ${toleranceChangeId}: absolute tax band widened`,
  };
  const taxIndex = holds.indexOf(taxHold);
  holds[taxIndex] = releasedTaxHold;

  const toleranceChanges: ToleranceChange[] = [
    {
      id: toleranceChangeId,
      from: TOLERANCES.taxBand,
      to: { kind: 'absolute_paise', value: paise(50000) },
      scope: { kind: 'hold_type', hold_type: 'tax_amount_range' },
      reviewer: REVIEWERS.controller,
      reason: 'cess on facilities contracts sits above the band the run was configured with',
      timestamp: toleranceAt,
      affected_hold_ids: [releasedTaxHold.id],
      decision_id: toleranceDecisionId,
      run_id: RUN_A,
    },
  ];

  // ── decisions ────────────────────────────────────────────────────────────────

  const decisions: Decision[] = [
    {
      id: 'dec_card_route' as DecisionId,
      run_id: RUN_A,
      case_id: 'case_a_card' as CaseId,
      invoice_id: INV_CARD.id,
      action: 'route',
      resolution_path: 're_application',
      owner_next: { role: 'treasury', party: 'Treasury operations' },
      reviewer: REVIEWERS.manager,
      reason: 'three inward lines settle this document; the residual needs a treasury view',
      timestamp: ts(4, 10, 15),
      hold_ids: ['hold_a_card' as HoldId],
      tolerance_change_id: null,
    },
    {
      id: toleranceDecisionId,
      run_id: RUN_A,
      case_id: 'case_a_tax' as CaseId,
      invoice_id: INV_TAX.id,
      action: 'change_tolerance',
      resolution_path: 'internal_correction',
      owner_next: { role: 'tax_team', party: 'Indirect tax' },
      reviewer: REVIEWERS.controller,
      reason: 'cess on facilities contracts sits above the band the run was configured with',
      timestamp: toleranceAt,
      hold_ids: [releasedTaxHold.id],
      tolerance_change_id: toleranceChangeId,
    },
    {
      id: 'dec_noref_rule' as DecisionId,
      run_id: RUN_A,
      case_id: 'case_a_noref' as CaseId,
      invoice_id: INV_NOREF.id,
      action: 'create_feedback_rule',
      resolution_path: 'internal_correction',
      owner_next: { role: 'ap_clerk', party: null },
      reviewer: REVIEWERS.clerk,
      reason: 'this vendor quotes the reference without separators in the narration tail',
      timestamp: ts(3, 15, 5),
      hold_ids: ['hold_a_noref' as HoldId],
      tolerance_change_id: null,
    },
  ];

  // ── runs ─────────────────────────────────────────────────────────────────────

  const datasetHash = sha256(canonicalJson({ invoices, payments })) as Sha256;
  const thresholdsHash = sha256(canonicalJson(TOLERANCES)) as Sha256;

  const runA: Run = {
    id: RUN_A,
    kind: 'engine',
    status: 'completed',
    started_at: runAStarted,
    finished_at: runAFinished,
    dataset_hash: datasetHash,
    thresholds_hash: thresholdsHash,
    engine_version: ENGINE_VERSION,
    scorer_version: SCORER_VERSION,
    idempotency_key: 'seed-run-engine-a',
    parent_run_id: null,
    feedback_rule_ids: [],
    totals: computeRunTotals({ invoices, payments, outcomes, holds }),
  };

  const runB: Run = {
    id: RUN_B,
    kind: 'rerun',
    status: 'completed',
    started_at: runBStarted,
    finished_at: runBFinished,
    dataset_hash: datasetHash,
    thresholds_hash: thresholdsHash,
    engine_version: ENGINE_VERSION,
    scorer_version: SCORER_VERSION,
    idempotency_key: 'seed-run-rerun-b',
    parent_run_id: RUN_A,
    feedback_rule_ids: [FBR_VENDOR_ALIAS, FBR_REFERENCE],
    totals: computeRunTotals({
      invoices,
      payments,
      outcomes: runBOutcomes,
      holds: runBHolds,
    }),
  };

  // ── the journal ──────────────────────────────────────────────────────────────

  const drafts: AuditDraft[] = [];
  const systemActor = { kind: 'system', component: 'holdfast-engine' } as const;

  drafts.push({
    occurred_at: runAStarted,
    actor: systemActor,
    event: 'run_started',
    entity: { entity: 'run', id: RUN_A },
    run_id: RUN_A,
    case_id: null,
    detail: {
      kind: runA.kind,
      engine_version: ENGINE_VERSION,
      scorer_version: SCORER_VERSION,
      invoices_total: invoices.length,
      payments_total: payments.length,
    },
  });

  for (const hold of holds) {
    drafts.push({
      occurred_at: hold.applied_at,
      actor: systemActor,
      event: 'hold_applied',
      entity: { entity: 'hold', id: hold.id },
      run_id: RUN_A,
      case_id: hold.case_id,
      detail: {
        hold_type: hold.type,
        invoice_id: String(hold.invoice_id),
        severity: hold.severity,
        blocks_accounting: hold.blocks_accounting,
        conflict_count: hold.conflicts.length,
      },
    });
  }

  drafts.push({
    occurred_at: runAFinished,
    actor: systemActor,
    event: 'run_completed',
    entity: { entity: 'run', id: RUN_A },
    run_id: RUN_A,
    case_id: null,
    detail: {
      held_count: runA.totals?.held_count ?? null,
      decided_count: runA.totals?.decided_count ?? null,
    },
  });

  for (const decision of decisions) {
    drafts.push({
      occurred_at: decision.timestamp,
      actor: { kind: 'human', reviewer: decision.reviewer },
      event: 'decision_recorded',
      entity: { entity: 'decision', id: decision.id },
      run_id: decision.run_id,
      case_id: decision.case_id,
      detail: {
        action: decision.action,
        resolution_path: decision.resolution_path,
        owner_role: decision.owner_next.role,
        hold_count: decision.hold_ids.length,
      },
    });
  }

  for (const change of toleranceChanges) {
    drafts.push({
      occurred_at: change.timestamp,
      actor: { kind: 'human', reviewer: change.reviewer },
      event: 'tolerance_changed',
      entity: { entity: 'tolerance_change', id: change.id },
      run_id: change.run_id,
      case_id: 'case_a_tax' as CaseId,
      detail: {
        scope_kind: change.scope.kind,
        from_kind: change.from.kind,
        to_kind: change.to.kind,
        affected_hold_count: change.affected_hold_ids.length,
      },
    });
    for (const holdId of change.affected_hold_ids) {
      drafts.push({
        occurred_at: change.timestamp,
        actor: { kind: 'human', reviewer: change.reviewer },
        event: 'hold_released',
        entity: { entity: 'hold', id: holdId },
        run_id: change.run_id,
        case_id: 'case_a_tax' as CaseId,
        detail: {
          released_by: String(change.reviewer),
          tolerance_change_id: String(change.id),
        },
      });
    }
  }

  for (const rule of feedbackRules) {
    drafts.push({
      occurred_at: rule.created_at,
      actor: { kind: 'human', reviewer: rule.created_by },
      event: 'feedback_rule_created',
      entity: { entity: 'feedback_rule', id: rule.id },
      run_id: RUN_A,
      case_id: rule.learned_from_case_id,
      detail: { kind: rule.body.kind, active: rule.active },
    });
  }

  drafts.push({
    occurred_at: runBStarted,
    actor: systemActor,
    event: 'run_started',
    entity: { entity: 'run', id: RUN_B },
    run_id: RUN_B,
    case_id: null,
    detail: {
      kind: runB.kind,
      parent_run_id: String(RUN_A),
      feedback_rules_in_force: runB.feedback_rule_ids.length,
    },
  });

  drafts.push({
    occurred_at: runBFinished,
    actor: systemActor,
    event: 'run_completed',
    entity: { entity: 'run', id: RUN_B },
    run_id: RUN_B,
    case_id: null,
    detail: {
      held_count: runB.totals?.held_count ?? null,
      decided_count: runB.totals?.decided_count ?? null,
    },
  });

  drafts.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0));

  const audit: AuditEntry[] = [];
  let prev: Sha256 | null = null;
  drafts.forEach((draft, index) => {
    const entry = sealEntry(draft, index + 1, prev, draft.occurred_at);
    audit.push(entry);
    prev = entry.payload_hash;
  });

  return {
    vendors: [...VENDORS],
    invoices,
    payments,
    runs: [runA, runB],
    holds: [...holds, ...runBHolds],
    candidates: [...candidates, ...runBCandidates],
    caseRows: [...caseRows, ...runBCases],
    outcomes: [...outcomes, ...runBOutcomes],
    decisions,
    toleranceChanges,
    feedbackRules,
    audit,
    holdPolicies: HOLD_POLICIES,
  };
}

/** Every hold type the API knows a policy for, for the meta route. */
export const KNOWN_HOLD_TYPES: readonly HoldType[] = HOLD_TYPES;
