import type { RunOverview } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";
import { InlineError, Skeleton } from "@/components/ui/States";

function Cell({ label, value, note, tone, className }: { label: string; value: string; note?: string; tone?: "blocking" | "cleared"; className?: string }) {
  return <div className={cn("px-5 py-4", className)}><p className="label-field">{label}</p><p className={cn("num mt-1.5 text-2xl font-semibold", tone === "blocking" ? "text-blocking" : tone === "cleared" ? "text-cleared" : "text-ink")}>{value}</p>{note ? <p className="mt-1 text-xs text-ink-faint">{note}</p> : null}</div>;
}

export function KpiBand({ summary, error }: { summary: RunOverview | null; error?: string | null }) {
  if (error) return <Panel><InlineError className="px-5 py-4" label="Run unavailable" message={`${error} Backend figures are hidden rather than shown as zero.`} /></Panel>;
  if (!summary) return <Panel><div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="bg-surface px-5 py-4"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2.5 h-7 w-28" /></div>)}</div></Panel>;
  return (
    <Panel>
      <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-surface px-5 py-4 sm:col-span-2 xl:col-span-1"><p className="label-field">Money at risk</p><p className="num mt-1.5 text-3xl font-semibold tracking-tight text-ink">{formatMoney(summary.exceptions.money_at_risk)}</p><p className="mt-1 text-xs text-ink-faint">open exception cases</p></div>
        <Cell label="Open cases" value={String(summary.exceptions.open_case_count)} className="bg-surface" />
        <Cell label="Open holds" value={String(summary.holds.open_count)} note="payment controls in force" tone={summary.holds.open_count > 0 ? "blocking" : undefined} className="bg-surface" />
        <Cell label="Human required" value={String(summary.totals?.human_required_count ?? "—")} className="bg-surface" />
        <Cell label="Decisions" value={String(summary.reviewer_activity.decision_count)} note={`${summary.reviewer_activity.distinct_reviewers} named reviewers`} tone={summary.reviewer_activity.decision_count > 0 ? "cleared" : undefined} className="bg-surface" />
      </div>
    </Panel>
  );
}
