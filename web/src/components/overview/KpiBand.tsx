import type { RunSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";
import { InlineError, Skeleton } from "@/components/ui/States";

function Cell({
  label,
  value,
  note,
  tone,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "blocking" | "cleared";
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="label-field">{label}</p>
      <p
        className={cn(
          "num mt-1.5 text-2xl font-semibold",
          tone === "blocking" ? "text-blocking" : tone === "cleared" ? "text-cleared" : "text-ink",
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-ink-faint">{note}</p> : null}
    </div>
  );
}

/**
 * The run's headline figures, read straight from the run summary.
 *
 * "Held" is a count, not a sum. The frontend contract carries a hold's amount
 * only on the exception detail, so a rupee figure for held money would have to
 * be assembled from reads this screen does not make.
 *
 * A failed summary read is reported as a failure. It must never fall back to a
 * skeleton, and it must never fall back to zeroes: "0 held" is a statement that
 * no payment is blocked, which is a different and more dangerous claim than "we
 * could not read the run".
 */
export function KpiBand({
  summary,
  error,
}: {
  summary: RunSummary | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <Panel>
        <InlineError
          className="px-5 py-4"
          label="Run summary unavailable"
          message={`${error} Money at risk and the run's status counts are not shown, rather than shown as zero.`}
        />
      </Panel>
    );
  }

  if (!summary) {
    return (
      <Panel>
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="bg-surface px-5 py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-7 w-28" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-surface px-5 py-4 sm:col-span-2 xl:col-span-1">
          <p className="label-field">Money at risk</p>
          <p className="num mt-1.5 text-3xl font-semibold tracking-tight text-ink">
            {formatMoney(summary.money_at_risk_paise, summary.currency)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">across this run</p>
        </div>
        <Cell label="Open" value={String(summary.open)} className="bg-surface" />
        <Cell label="In review" value={String(summary.inReview)} className="bg-surface" />
        <Cell
          label="Held"
          value={String(summary.held)}
          note="payments blocked"
          tone={summary.held > 0 ? "blocking" : undefined}
          className="bg-surface"
        />
        <Cell
          label="Routed"
          value={String(summary.routed)}
          note="owner assigned"
          tone={summary.routed > 0 ? "cleared" : undefined}
          className="bg-surface"
        />
      </div>
    </Panel>
  );
}
