import type { RunOverview } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { InlineError, Skeleton } from "@/components/ui/States";

export function QueueLedgerStrip({ summary, error }: { summary: RunOverview | null; error?: string | null }) {
  if (error) return <div className="border-b border-line px-4 py-3.5"><InlineError label="Run unavailable" message={error} /></div>;
  if (!summary) return <div className="border-b border-line px-4 py-3.5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-2 h-7 w-40" /></div>;
  return (
    <div className="border-b border-line px-4 py-3.5">
      <p className="label-field">Money at risk</p>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-ink">{formatMoney(summary.exceptions.money_at_risk)}</p>
      <p className="num mt-1.5 text-xs text-ink-faint">
        {summary.exceptions.open_case_count} open cases · <span className={summary.holds.open_count > 0 ? "font-medium text-blocking" : undefined}>{summary.holds.open_count} open holds</span> · {summary.reviewer_activity.decision_count} decisions
      </p>
    </div>
  );
}
