/** Presentation helpers. Pure functions, no domain knowledge beyond shapes. */

import type { EvidenceValue } from "@/lib/api";

export function formatMoney(amount_paise: number | null | undefined, currency: string): string {
  if (amount_paise === null || amount_paise === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amount_paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount_paise / 100);
}

export function formatEvidenceValue(value: EvidenceValue | null): string {
  if (!value) return "No reference supplied";
  if (value.kind === "money") return formatMoney(value.amount_paise, value.currency);
  if (value.kind === "integer") return `${value.value}${value.unit ?? ""}`;
  if (value.kind === "date") return value.value;
  return value.value;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

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
    return { label: `${Math.max(1, Math.round(remaining / 60_000))}m left`, breached: false, urgent: true };
  }
  if (hours < 24) {
    return { label: `${Math.round(hours)}h left`, breached: false, urgent: hours < 4 };
  }
  return { label: `${Math.round(hours / 24)}d left`, breached: false, urgent: false };
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
