import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

/**
 * A normalised score in [0, 1], drawn as a bar.
 *
 * What this shows is always a DETERMINISTIC quantity the backend computed and published:
 * a scorer component, a composite, or a token-set similarity ratio. It is never a model's
 * own stated certainty — the backend has no such field, and nothing in this console
 * synthesises one. `label` must name the measured quantity, which is why it has no default.
 */
export function ScoreBar({
  value,
  label,
  className,
  showValue = true,
}: {
  value: number;
  label: string;
  className?: string;
  showValue?: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const tone =
    clamped < 0.5 ? "bg-blocking" : clamped < 0.8 ? "bg-material" : "bg-cleared";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${clamped * 100}%` }} />
      </div>
      {showValue ? (
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {formatPercent(clamped)}
        </span>
      ) : null}
    </div>
  );
}
