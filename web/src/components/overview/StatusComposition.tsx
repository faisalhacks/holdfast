import type { RunOverview } from "@/lib/api";
import { InlineError, Skeleton } from "@/components/ui/States";

const SEGMENTS = [
  { key: "auto_cleared", label: "Auto-cleared", fill: "bg-cleared" },
  { key: "held", label: "Held", fill: "bg-blocking" },
  { key: "unmatched", label: "Unmatched", fill: "bg-material" },
] as const;

export function StatusComposition({ summary, error }: { summary: RunOverview | null; error?: string | null }) {
  if (error) return <InlineError className="px-4 py-4 sm:px-5" label="Run unavailable" message={error} />;
  if (!summary) return <div className="px-4 py-4 sm:px-5"><Skeleton className="h-2.5 w-full" /><Skeleton className="mt-3 h-4 w-48" /></div>;
  const counts = summary.outcome_mix;
  const total = counts.auto_cleared + counts.held + counts.unmatched;
  return (
    <div className="px-4 py-4 sm:px-5">
      {total > 0 ? <div aria-hidden className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-3">{SEGMENTS.map((segment) => counts[segment.key] > 0 ? <span key={segment.key} className={segment.fill} style={{ width: `${(counts[segment.key] / total) * 100}%` }} /> : null)}</div> : <p className="text-sm text-ink-faint">No outcomes recorded for this run.</p>}
      <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">{SEGMENTS.map((segment) => <li key={segment.key} className="flex items-baseline gap-2"><span aria-hidden className={`size-2 shrink-0 translate-y-px rounded-full ${segment.fill}`} /><span className="text-base text-ink-muted">{segment.label}</span><span className="num text-base font-medium text-ink">{counts[segment.key]}</span></li>)}</ul>
      <p className="mt-3.5 border-t border-line pt-3 text-base text-ink-muted">Run status: <span className="font-medium text-ink">{summary.status}</span>. These are the backend&apos;s mutually exclusive run outcomes.</p>
    </div>
  );
}
