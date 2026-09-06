import type { EvidenceValue, ExceptionDetail, Severity } from "@/lib/api/types";

const RUN_ID = "run_demo_7f31";
const HOUR = 3_600_000;
const text = (value: string): EvidenceValue => ({ kind: "text", value });
const money = (amount_paise: number): EvidenceValue => ({ kind: "money", amount_paise, currency: "INR" });
const integer = (value: number, unit: string | null = null): EvidenceValue => ({ kind: "integer", value, unit });
const date = (value: string): EvidenceValue => ({ kind: "date", value });

export function buildExceptionFixtures(now = new Date()): ExceptionDetail[] {
  const at = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();
  const base = (id: string, reference: string, severity: Severity, exposure_paise: number | null): ExceptionDetail => ({
    id, reference, title: "", status: "open", severity, category: "data_mismatch",
    agent: "Reconciliation agent", workflow: "Invoice reconciliation", runId: RUN_ID,
    entity: { type: "invoice", id: reference, label: reference }, exposure_paise, currency: "INR",
    raisedAt: at(-2), slaDueAt: at(3), assignee: null, policy: null, signals: [], evidence: [],
    timeline: [{ id: `${id}_raised`, kind: "escalation", actor: "Reconciliation agent", at: at(-2), title: "Exception raised", detail: "Field evidence required operational review." }],
    routingDecision: null, hold: null, tolerance: null,
  });

  const invoice = base("exc_01j9dq4f", "EXC-4821", "critical", 18_432_050);
  Object.assign(invoice, {
    title: "Invoice total exceeds purchase order tolerance", category: "threshold_breach",
    signals: [
      { id: "sig_1", label: "Invoice total", observed: money(202_752_550), expected: money(184_320_500), status: "fail", source: "invoice.total_paise ↔ purchase_order.total_paise" },
      { id: "sig_2", label: "Variance", observed: money(18_432_050), expected: money(9_216_025), status: "fail", source: "computed delta ↔ 5% policy limit" },
      { id: "sig_3", label: "Invoice date", observed: date("2026-09-04"), expected: date("2026-09-04"), status: "pass", source: "invoice.date ↔ purchase_order.service_date" },
      { id: "sig_4", label: "Vendor reference", observed: text("NORTHWIND-884"), expected: text("NORTHWIND-884"), status: "pass", source: "invoice.vendor_ref ↔ supplier.vendor_ref" },
    ],
    evidence: [{ id: "ev_1", label: "Invoice extract", kind: "extract", summary: "Total 202752550 paise; vendor reference NORTHWIND-884.", capturedAt: at(-2.2), sourceRef: "invoice:INV-009184" }],
    policy: { id: "POL-AP-17", name: "Invoice variance", clause: "Hold when invoice variance exceeds the configured supplier tolerance." },
    hold: { id: "hold_4821", status: "held", amount_paise: 18_432_050, currency: "INR", reason: "Invoice variance exceeds tolerance", releasedAt: null, releaseReason: null },
    tolerance: { from: 5, to: 5, scope: "supplier:NORTHWIND:invoice_variance_percent" },
  });

  const bank = base("exc_01j9dq8a", "EXC-4817", "critical", 9_675_000);
  Object.assign(bank, {
    title: "Supplier bank account changed", status: "in_review", category: "policy_violation", assignee: "treasury.ops",
    signals: [
      { id: "sig_5", label: "Account suffix", observed: text("••4829"), expected: text("••1732"), status: "fail", source: "invoice.bank_account ↔ supplier_master.bank_account" },
      { id: "sig_6", label: "Vendor match score", observed: integer(91, "%"), expected: integer(95, "%"), status: "warn", source: "invoice.vendor ↔ supplier_master.vendor" },
    ],
    evidence: [{ id: "ev_2", label: "Supplier master record", kind: "system_record", summary: "Approved account suffix is 1732.", capturedAt: at(-3), sourceRef: "supplier:SUP-204" }],
    hold: { id: "hold_4817", status: "held", amount_paise: 9_675_000, currency: "INR", reason: "Unverified bank account change", releasedAt: null, releaseReason: null },
  });

  const tax = base("exc_01j9dqb2", "EXC-4808", "high", 1_420_000);
  Object.assign(tax, { title: "Tax identifier differs from supplier record", signals: [
    { id: "sig_7", label: "Tax identifier", observed: text("29AACCN8842K1ZP"), expected: text("29AACCN8842K1ZX"), status: "fail", source: "invoice.gstin ↔ supplier_master.gstin" },
    { id: "sig_8", label: "Vendor match score", observed: integer(87, "%"), expected: integer(95, "%"), status: "warn", source: "invoice.vendor ↔ supplier_master.vendor" },
  ] });

  const missing = base("exc_01j9dqc4", "EXC-4799", "high", null);
  Object.assign(missing, { title: "Purchase order reference is missing", category: "missing_evidence", raisedAt: at(-8), slaDueAt: at(-1), signals: [
    { id: "sig_9", label: "Purchase order reference", observed: text("Not supplied"), expected: text("Required"), status: "unknown", source: "invoice.purchase_order_ref ↔ policy.required_fields" },
  ] });

  const routed = base("exc_01j9dqe6", "EXC-4788", "low", 311_040);
  Object.assign(routed, {
    title: "Posting date falls outside accounting period", status: "routed", category: "policy_violation", assignee: "ap.corrections",
    signals: [{ id: "sig_10", label: "Posting date", observed: date("2026-08-31"), expected: date("2026-09-01"), status: "fail", source: "ledger.posting_date ↔ open_period.start_date" }],
    routingDecision: { id: "route_4788", exceptionId: routed.id, resolution_path: "internal_correction", owner_next: "ap.corrections", reason: "Posting date requires correction to the open period.", routedAt: at(-1) },
    timeline: [...routed.timeline, { id: "tl_route", kind: "routing", actor: "reviewer", at: at(-1), title: "Routed for internal correction", detail: "Owner: ap.corrections" }],
  });
  return [invoice, bank, tax, missing, routed];
}
