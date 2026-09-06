import type { QueuePage, RunOverview } from "@/lib/api";
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
    <div className="min-w-0 border-b border-line px-3 py-3 odd:border-r md:border-r md:border-b-0 md:first:pl-0 md:last:border-r-0">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("mt-1 font-mono text-xl tabular-nums", tone ?? "text-ink")}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/**
 * Counters for the run.
 *
 * Every figure is read from a backend field: four from `GET /api/runs/{runId}` and one from
 * the queue's own `money_at_risk_total_paise`, which is the total over the CURRENT filter
 * rather than the whole run. Nothing is computed here and no figure is hardcoded.
 */
export function QueueStatsBar({
  run,
  page,
  loading,
}: {
  run: RunOverview | null;
  page: QueuePage | null;
  loading: boolean;
}) {
  if (loading && !run) {
    return (
      <div className="flex gap-4 px-4 pb-4 sm:px-6">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 flex-1" />
        ))}
      </div>
    );
  }

  if (!run) return null;

  return (
    <div className="mx-4 mb-4 grid grid-cols-2 rounded-lg border border-line bg-surface/60 px-3 sm:mx-6 md:grid-cols-5 md:px-4">
      <Stat
        label="Open cases"
        value={String(run.exceptions.open_case_count)}
        hint="Needing a reviewer"
      />
      <Stat
        label="Open holds"
        value={String(run.holds.open_count)}
        tone={run.holds.open_count > 0 ? "text-critical" : "text-ink"}
        hint="Across the run"
      />
      <Stat
        label="Released"
        value={String(run.holds.released_count)}
        tone="text-positive"
        hint={`${run.holds.released_by_a_named_human} by a named human`}
      />
      <Stat
        label="Decisions"
        value={String(run.reviewer_activity.decision_count)}
        hint={`${run.reviewer_activity.distinct_reviewers} distinct reviewers`}
      />
      <Stat
        label="Money at risk"
        value={formatMoney(page ? page.money_at_risk_total : run.exceptions.money_at_risk)}
        hint={page ? "Across the current filter" : "Across the run"}
      />
    </div>
  );
}
