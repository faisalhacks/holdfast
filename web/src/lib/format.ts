/** Presentation helpers. Pure functions, no domain knowledge beyond shapes. */

import type { Money, Tolerance } from "@/lib/api";

const GROUPS = new Intl.NumberFormat("en-IN");

/**
 * Formats an exact paise count as rupees.
 *
 * The arithmetic is BigInt on the exact digits the backend sent, so a monetary value is
 * never converted to a float on its way to the screen — including the wide values the
 * contract carries as a decimal string.
 */
export function formatMoney(money: Money | null | undefined): string {
  if (!money) return "—";
  let paise: bigint;
  try {
    paise = BigInt(money.digits);
  } catch {
    return "—";
  }
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = absolute / 100n;
  const remainder = absolute % 100n;
  const body =
    remainder === 0n
      ? GROUPS.format(rupees)
      : `${GROUPS.format(rupees)}.${remainder.toString().padStart(2, "0")}`;
  return `${negative ? "−" : ""}₹${body}`;
}

/** Signed form, for a delta where the direction is the point. */
export function formatMoneyDelta(money: Money | null | undefined): string {
  if (!money) return "—";
  const formatted = formatMoney(money);
  return money.digits.startsWith("-") ? formatted : `+${formatted}`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** A tolerance in its own units, named by kind so nothing reads as a bare number. */
export function formatTolerance(tolerance: Tolerance): string {
  switch (tolerance.kind) {
    case "exact":
      return "exact match";
    case "absolute_paise":
      return formatMoney(tolerance.value);
    case "percentage":
      return formatPercent(tolerance.value, 2);
    case "days":
      return `${tolerance.value} day${tolerance.value === 1 ? "" : "s"}`;
    case "similarity":
      return `${formatPercent(tolerance.value, 0)} similarity`;
  }
}

export function formatDays(days: number): string {
  const rounded = Math.round(days);
  const magnitude = Math.abs(rounded);
  return `${rounded > 0 ? "+" : ""}${rounded} day${magnitude === 1 ? "" : "s"}`;
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

  if (abs < minute) return "just now";
  if (abs < hour) return `${Math.round(abs / minute)}m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${suffix}`;
  return `${Math.round(abs / day)}d ${suffix}`;
}

/** How long a case has been held. The backend supplies the day count; this only words it. */
export function formatAge(ageDays: number): string {
  if (ageDays <= 0) return "held today";
  return `held ${ageDays} day${ageDays === 1 ? "" : "s"}`;
}

export function titleCase(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
