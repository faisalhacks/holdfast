import type { ConflictSeverity, EvidenceRow, HoldType, Money } from "@/lib/api";

const money = (digits: string): Money => ({ digits, safe: null });

export const PREVIEW_RUN_ID = "run_engine_a";
export const PREVIEW_CASE_ID = "case_demo_104";
export const PREVIEW_INVOICE_ID = "inv_demo_104";
export const PREVIEW_REFERENCE = "AG-884";
export const PREVIEW_VENDOR = "Aster Grove Supplies";
export const PREVIEW_HOLD: Money = money("18432050");
export const PREVIEW_AT_RISK: Money = money("29527050");

export const PREVIEW_EVIDENCE: EvidenceRow[] = [
  { field: "amount", path: "candidate.evidence.amount", invoiceValue: money("202752550"), paymentValue: money("184320500"), tolerance: { kind: "absolute_paise", value: money("9216025") }, within_tolerance: false, normalisation: null, deltaKind: "paise", deltaRatio: null, deltaMoney: money("18432050"), deltaDays: null, cause: "amount_variance", displaced: false, displaced_from: null },
  { field: "date", path: "candidate.evidence.date", invoiceValue: "2026-09-04", paymentValue: "2026-09-04", tolerance: { kind: "days", value: 2 }, within_tolerance: true, normalisation: null, deltaKind: "days", deltaRatio: null, deltaMoney: null, deltaDays: 0, cause: null, displaced: false, displaced_from: null },
  { field: "reference", path: "candidate.evidence.reference", invoiceValue: "AG-884", paymentValue: "AG-884", tolerance: { kind: "similarity", value: 0.9 }, within_tolerance: true, normalisation: null, deltaKind: "similarity", deltaRatio: 1, deltaMoney: null, deltaDays: null, cause: null, displaced: false, displaced_from: null },
];

export interface PreviewQueueRow {
  caseId: string;
  invoiceId: string;
  moneyAtRisk: Money;
  holdType: HoldType;
  severity: ConflictSeverity;
  age: string;
  blocksAccounting: boolean;
}

export const PREVIEW_QUEUE: PreviewQueueRow[] = [
  { caseId: PREVIEW_CASE_ID, invoiceId: PREVIEW_INVOICE_ID, moneyAtRisk: PREVIEW_HOLD, holdType: "price_variance", severity: "blocking", age: "held 2 days", blocksAccounting: true },
  { caseId: "case_demo_092", invoiceId: "inv_demo_092", moneyAtRisk: money("9675000"), holdType: "duplicate_candidate", severity: "blocking", age: "held 4 days", blocksAccounting: true },
  { caseId: "case_demo_081", invoiceId: "inv_demo_081", moneyAtRisk: money("1420000"), holdType: "tax_variance", severity: "material", age: "held 6 days", blocksAccounting: false },
  { caseId: "case_demo_078", invoiceId: "inv_demo_078", moneyAtRisk: money("311040"), holdType: "period_deferral", severity: "advisory", age: "held 9 days", blocksAccounting: false },
];
