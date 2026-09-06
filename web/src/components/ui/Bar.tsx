import { cn } from "@/lib/cn";
import type { Tone } from "./Token";

const FILLS: Record<Tone, string> = {
  neutral: "bg-ink-faint/45",
  focus: "bg-focus",
  blocking: "bg-blocking",
  material: "bg-material",
  advisory: "bg-advisory",
  cleared: "bg-cleared",
};

export interface BarRow {
  key: string;
  label: string;
  /** The share of the largest row in the set, 0..1. */
  fraction: number;
  /** The rendered figure. Already formatted; this component does no maths. */
  value: string;
  /** Optional second reading, e.g. a count beside a sum. */
  detail?: string | null;
  tone?: Tone;
}

/**
 * A ranked horizontal bar list.
 *
 * Every chart on the Overview is one of these. No library, no gradients, no
 * axis furniture: the label and the figure are the axis, and a bar exists only
 * to make the ordering readable at a glance.
 *
 * A row whose figure cannot be computed gets no bar at all rather than a
 * zero-length one, because "nothing to measure" and "measured zero" are
 * different statements.
 */
export function BarList({ rows, className }: { rows: BarRow[]; className?: string }) {
  if (rows.length === 0) {
    return <p className="px-4 py-5 text-sm text-ink-faint sm:px-5">Nothing to count.</p>;
  }

  return (
    <ul className={cn("space-y-3 px-4 py-4 sm:px-5", className)}>
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5">
          <span className="min-w-0 truncate text-base text-ink">{row.label}</span>
          <span className="num text-base font-medium text-ink">{row.value}</span>
          <span className="col-span-2 flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"
            >
              <span
                className={cn("block h-full rounded-full", FILLS[row.tone ?? "focus"])}
                style={{ width: `${Math.max(0, Math.min(1, row.fraction)) * 100}%` }}
              />
            </span>
            {row.detail ? (
              <span className="num shrink-0 text-xs text-ink-faint">{row.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
