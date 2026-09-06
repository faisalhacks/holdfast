import type { RunSummary } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { InlineError, Skeleton } from "@/components/ui/States";

/**
 * The run's figures as one quiet block, not a grid of tiles. Four of the five
 * values are single digits; giving each a card would spend a third of the pane
 * restating the queue that is directly below it.
 */
export function QueueLedgerStrip({
  summary,
  error,
}: {
  summary: RunSummary | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <div className="border-b border-line px-4 py-3.5">
        <InlineError label="Run summary unavailable" message={error} />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="border-b border-line px-4 py-3.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-7 w-40" />
        <Skeleton className="mt-2 h-3 w-48" />
      </div>
    );
  }

  return (
    <div className="border-b border-line px-4 py-3.5">
      <p className="label-field">Money at risk</p>
      <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-ink">
        {formatMoney(summary.money_at_risk_paise, summary.currency)}
      </p>
      <p className="num mt-1.5 text-xs text-ink-faint">
        {summary.open} open · {summary.inReview} in review ·{" "}
        <span className={summary.held > 0 ? "font-medium text-blocking" : undefined}>
          {summary.held} held
        </span>{" "}
        · {summary.routed} routed
      </p>
    </div>
  );
}
