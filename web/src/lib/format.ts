/** Presentation helpers. Pure functions, no domain knowledge beyond shapes. */

import type { EvidenceValue } from "@/lib/api";

/**
 * Money is integer paise everywhere in state and on the wire. This is the only
 * place it becomes a decimal, and it becomes one for exactly as long as it
 * takes to reach the DOM. `en-IN` grouping is deliberate: an AP analyst reads
 * lakh and crore, and 18,43,205 vs 1,843,205 is the kind of detail that decides
 * whether an interface looks like it was built for them.
 */
export function formatMoney(
  amount_paise: number | null | undefined,
  currency: string,
): string {
  if (amount_paise === null || amount_paise === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: amount_paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount_paise / 100);
}

/** Same as `formatMoney`, with an explicit sign so a delta reads as a delta. */
export function formatMoneyDelta(amount_paise: number, currency: string): string {
  const magnitude = formatMoney(Math.abs(amount_paise), currency);
  if (amount_paise === 0) return magnitude;
  return `${amount_paise > 0 ? "+" : "−"}${magnitude}`;
}

export function formatEvidenceValue(value: EvidenceValue | null): string {
  if (!value) return "Not supplied";
  if (value.kind === "money") return formatMoney(value.amount_paise, value.currency);
  if (value.kind === "integer") return `${value.value}${value.unit ?? ""}`;
  if (value.kind === "date") return formatDate(value.value);
  return value.value;
}

/**
 * The difference between what a record says and what it was compared against.
 *
 * Every branch is arithmetic over values the API returned. Money stays in
 * integer paise until `formatMoneyDelta` renders it, and a percentage is only
 * offered where a non-zero reference makes one meaningful — a ratio against
 * zero is not a fact about the invoice.
 */
export interface Delta {
  /** The rendered difference, or null when the pair cannot produce one. */
  label: string | null;
  /** True when the two sides are not the same value. */
  differs: boolean;
  /** Optional secondary reading, e.g. "5% of reference". Never a literal. */
  detail: string | null;
}

const NO_DELTA: Delta = { label: null, differs: false, detail: null };

export function describeDelta(
  observed: EvidenceValue,
  expected: EvidenceValue | null,
): Delta {
  if (!expected) return { label: "No reference", differs: false, detail: null };
  if (observed.kind !== expected.kind) return NO_DELTA;

  if (observed.kind === "money" && expected.kind === "money") {
    if (observed.currency !== expected.currency) return NO_DELTA;
    const difference = observed.amount_paise - expected.amount_paise;
    return {
      label: formatMoneyDelta(difference, observed.currency),
      differs: difference !== 0,
      detail:
        expected.amount_paise === 0
          ? null
          : `${describeRatio(difference, expected.amount_paise)} of reference`,
    };
  }

  if (observed.kind === "integer" && expected.kind === "integer") {
    const difference = observed.value - expected.value;
    const unit = observed.unit ?? "";
    return {
      label: difference === 0 ? `0${unit}` : `${difference > 0 ? "+" : "−"}${Math.abs(difference)}${unit}`,
      differs: difference !== 0,
      detail: null,
    };
  }

  if (observed.kind === "date" && expected.kind === "date") {
    const days = diffDays(expected.value, observed.value);
    if (days === null) return NO_DELTA;
    return {
      label: days === 0 ? "Same day" : `${days > 0 ? "+" : "−"}${Math.abs(days)}d`,
      differs: days !== 0,
      detail: null,
    };
  }

  if (observed.kind === "text" && expected.kind === "text") {
    const identical = observed.value === expected.value;
    return { label: identical ? "Identical" : "Differs", differs: !identical, detail: null };
  }

  return NO_DELTA;
}

/** Signed ratio of two integers, rendered as a rounded percentage. */
function describeRatio(numerator: number, denominator: number): string {
  const ratio = Math.round((Math.abs(numerator) / Math.abs(denominator)) * 100);
  return `${numerator < 0 ? "−" : "+"}${ratio}%`;
}

/** Whole days from `from` to `to`. Null when either side is not a date. */
export function diffDays(from: string, to: string): number | null {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return DATE_ONLY.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_TIME.format(date);
}

/** "14m ago", "3h ago", "2d ago". */
export function formatRelative(iso: string, from: number = Date.now()): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const diff = from - target;
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return `just now`;
  if (abs < hour) return `${Math.round(abs / minute)}m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${suffix}`;
  return `${Math.round(abs / day)}d ${suffix}`;
}

export interface SlaState {
  label: string;
  breached: boolean;
  urgent: boolean;
}

/** Time remaining against an SLA target, with breach/urgency flags. */
export function describeSla(slaDueAt: string, from: number = Date.now()): SlaState {
  const due = new Date(slaDueAt).getTime();
  if (Number.isNaN(due)) return { label: "—", breached: false, urgent: false };

  const remaining = due - from;
  const hours = remaining / 3_600_000;

  if (remaining < 0) {
    return { label: `Breached ${formatRelative(slaDueAt, from)}`, breached: true, urgent: true };
  }
  if (hours < 1) {
    return {
      label: `${Math.max(1, Math.round(remaining / 60_000))}m left`,
      breached: false,
      urgent: true,
    };
  }
  if (hours < 24) {
    return { label: `${Math.round(hours)}h left`, breached: false, urgent: hours < 4 };
  }
  return { label: `${Math.round(hours / 24)}d left`, breached: false, urgent: false };
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
