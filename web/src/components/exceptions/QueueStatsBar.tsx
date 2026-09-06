import type { RunSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/States";

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 border-b border-line px-3 py-3 odd:border-r md:border-b-0 md:border-r md:last:border-r-0 md:first:pl-0">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("mt-1 font-mono text-xl tabular-nums", tone ?? "text-ink")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export function QueueStatsBar({
  stats,
  loading,
}: {
  stats: RunSummary | null;
  loading: boolean;
}) {
  if (loading && !stats) {
    return (
      <div className="flex gap-4 px-4 pb-4 sm:px-6">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 flex-1" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="mx-4 mb-4 grid grid-cols-2 rounded-lg border border-line bg-surface/60 px-3 sm:mx-6 md:grid-cols-5 md:px-4">
      <Stat label="Open" value={String(stats.open)} hint="Awaiting a reviewer" />
      <Stat label="In review" value={String(stats.inReview)} hint="Picked up" />
      <Stat
        label="Active holds"
        value={String(stats.held)}
        tone={stats.held > 0 ? "text-critical" : "text-ink"}
        hint="Awaiting release"
      />
      <Stat
        label="Routed"
        value={String(stats.routed)}
        tone="text-positive"
        hint="Next owner assigned"
      />
      <Stat
        label="Exposure at risk"
        value={formatMoney(stats.money_at_risk_paise, stats.currency)}
        hint="From run summary"
      />
    </div>
  );
}
