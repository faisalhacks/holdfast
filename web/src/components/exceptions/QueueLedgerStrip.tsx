import type { RunSummary } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/States";

/**
 * The run's figures as one strip, not a grid of tiles. Four of the five values
 * are single digits; giving each a card would spend a third of the pane
 * restating the queue that is directly below it.
 */
export function QueueLedgerStrip({ summary }: { summary: RunSummary | null }) {
  if (!summary) {
    return (
      <div className="border-b border-line px-3 py-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-1.5 h-3 w-44" />
      </div>
    );
  }

  return (
    <div className="border-b border-line px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="label-section">At risk</span>
        <span className="num font-mono text-xl font-semibold text-ink">
          {formatMoney(summary.money_at_risk_paise, summary.currency)}
        </span>
      </div>
      <p className="num mt-0.5 font-mono text-xs text-ink-faint">
        {summary.open} open · {summary.inReview} in review ·{" "}
        <span className={summary.held > 0 ? "text-blocking" : undefined}>{summary.held} held</span>{" "}
        · {summary.routed} routed
      </p>
    </div>
  );
}
