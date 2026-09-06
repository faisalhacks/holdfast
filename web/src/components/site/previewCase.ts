import type { Signal } from "@/lib/api";

/*
 * The case shown in the marketing previews.
 *
 * These values mirror EXC-4821 in the demo dataset. They are stated here as
 * literals rather than imported, because UI code may not reach into the
 * fixtures directory — `npm run check:boundaries` enforces that, and a
 * marketing page is not a reason to weaken it.
 *
 * Nothing here is a performance claim. It is one sample exception: amounts in
 * integer paise, formatted only at render, exactly as the workstation does it.
 */

export const PREVIEW_RUN_ID = "run_demo_7f31";
export const PREVIEW_REFERENCE = "EXC-4821";
export const PREVIEW_TITLE = "Invoice total exceeds purchase order tolerance";
export const PREVIEW_CURRENCY = "INR";

/** Held amount for the case above, in paise. */
export const PREVIEW_HOLD_PAISE = 18_432_050;

/**
 * Money at risk across the run: the sum of exposure on every exception that has
 * not been routed, which is what the run summary reports.
 */
export const PREVIEW_AT_RISK_PAISE = 29_527_050;

/*
 * Times are written down rather than derived.
 *
 * The workstation computes "3h left" and "2h ago" from the clock, which is
 * right in the product and wrong on a page: a screenshot whose countdown
 * drifts every hour is a screenshot nobody can trust. These are the strings
 * that case shows when it is three hours from its target.
 */
export const PREVIEW_SLA_LABEL = "3h left";
export const PREVIEW_SLA_DUE = "06 Sept, 23:25";
export const PREVIEW_RAISED_RELATIVE = "2h ago";
export const PREVIEW_RAISED_AT = "06 Sept, 18:25";

export const PREVIEW_SIGNALS: Signal[] = [
  {
    id: "sig_1",
    label: "Invoice total",
    observed: { kind: "money", amount_paise: 202_752_550, currency: "INR" },
    expected: { kind: "money", amount_paise: 184_320_500, currency: "INR" },
    status: "fail",
    source: "invoice.total_paise ↔ purchase_order.total_paise",
  },
  {
    id: "sig_2",
    label: "Variance",
    observed: { kind: "money", amount_paise: 18_432_050, currency: "INR" },
    expected: { kind: "money", amount_paise: 9_216_025, currency: "INR" },
    status: "fail",
    source: "computed delta ↔ policy limit",
  },
  {
    id: "sig_3",
    label: "Invoice date",
    observed: { kind: "date", value: "2026-09-04" },
    expected: { kind: "date", value: "2026-09-04" },
    status: "pass",
    source: "invoice.date ↔ purchase_order.service_date",
  },
  {
    id: "sig_4",
    label: "Vendor reference",
    observed: { kind: "text", value: "NORTHWIND-884" },
    expected: { kind: "text", value: "NORTHWIND-884" },
    status: "pass",
    source: "invoice.vendor_ref ↔ supplier.vendor_ref",
  },
];

export interface PreviewRow {
  reference: string;
  title: string;
  /** Integer paise, or null where no exposure is recorded. */
  exposure_paise: number | null;
  severity: "critical" | "high" | "medium" | "low";
  meta: string;
  /** Written down, not derived. See PREVIEW_SLA_LABEL. */
  sla: string;
  breached?: boolean;
  routed?: boolean;
}

/** The queue, in the order the product puts it: money at risk, descending. */
export const PREVIEW_QUEUE: PreviewRow[] = [
  {
    reference: "EXC-4821",
    title: "Invoice total exceeds purchase order tolerance",
    exposure_paise: 18_432_050,
    severity: "critical",
    meta: "NORTHWIND-884",
    sla: "3h left",
  },
  {
    reference: "EXC-4817",
    title: "Supplier bank account changed",
    exposure_paise: 9_675_000,
    severity: "critical",
    meta: "treasury.ops",
    sla: "3h left",
  },
  {
    reference: "EXC-4808",
    title: "Tax identifier differs from supplier record",
    exposure_paise: 1_420_000,
    severity: "high",
    meta: "SUP-204",
    sla: "3h left",
  },
  {
    reference: "EXC-4788",
    title: "Posting date falls outside accounting period",
    exposure_paise: 311_040,
    severity: "low",
    meta: "ap.corrections",
    sla: "3h left",
    routed: true,
  },
  {
    reference: "EXC-4799",
    title: "Purchase order reference is missing",
    exposure_paise: null,
    severity: "high",
    meta: "unassigned",
    sla: "Breached 1h ago",
    breached: true,
  },
];
