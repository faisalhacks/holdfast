import type { RunSummary } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/labels";
import { InlineError, Skeleton } from "@/components/ui/States";

const SEGMENTS = [
  { key: "open", label: STATUS_LABELS.open, fill: "bg-ink-faint/45" },
  { key: "in_review", label: STATUS_LABELS.in_review, fill: "bg-focus" },
  { key: "routed", label: STATUS_LABELS.routed, fill: "bg-cleared" },
] as const;

/**
 * Where the run's cases stand, as one bar.
 *
 * The three segments come from the run summary and are mutually exclusive, so
 * they can share a bar. `held` cannot: a hold is a state a case carries, not a
 * position in this sequence, and an open case may or may not be held. It is
 * stated underneath instead of being wedged into the same hundred per cent.
 */
export function StatusComposition({
  summary,
  error,
}: {
  summary: RunSummary | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <InlineError
        className="px-4 py-4 sm:px-5"
        label="Run summary unavailable"
        message={error}
      />
    );
  }

  if (!summary) {
    return (
      <div className="px-4 py-4 sm:px-5">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="mt-3 h-4 w-48" />
      </div>
    );
  }

  const counts = {
    open: summary.open,
    in_review: summary.inReview,
    routed: summary.routed,
  } as const;
  const total = counts.open + counts.in_review + counts.routed;

  return (
    <div className="px-4 py-4 sm:px-5">
      {total > 0 ? (
        <div
          aria-hidden
          className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-3"
        >
          {SEGMENTS.map((segment) =>
            counts[segment.key] > 0 ? (
              <span
                key={segment.key}
                className={segment.fill}
                style={{ width: `${(counts[segment.key] / total) * 100}%` }}
              />
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">No cases in this run.</p>
      )}

      <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-baseline gap-2">
            <span aria-hidden className={`size-2 shrink-0 translate-y-px rounded-full ${segment.fill}`} />
            <span className="text-base text-ink-muted">{segment.label}</span>
            <span className="num text-base font-medium text-ink">{counts[segment.key]}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3.5 border-t border-line pt-3 text-base text-ink-muted">
        <span className={summary.held > 0 ? "font-medium text-blocking" : "text-ink"}>
          {summary.held}
        </span>{" "}
        {summary.held === 1 ? "payment is held" : "payments are held"}. A hold is carried
        alongside a case&rsquo;s status, not instead of it.
      </p>
    </div>
  );
}
