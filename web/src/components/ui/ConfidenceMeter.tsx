import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

/**
 * Compact normalized meter for structured evidence scores.
 */
export function ConfidenceMeter({
  value,
  className,
  showLabel = true,
  label = "Score",
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
  label?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const tone =
    clamped < 0.5 ? "bg-critical" : clamped < 0.8 ? "bg-medium" : "bg-positive";

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
      {showLabel ? (
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {formatPercent(clamped)}
        </span>
      ) : null}
    </div>
  );
}
