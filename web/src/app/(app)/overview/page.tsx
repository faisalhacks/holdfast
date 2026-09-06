"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { config } from "@/lib/config";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { useRunSummary } from "@/hooks/useRunSummary";
import { AGE_BUCKET_LABELS, byAge, bySeverity, peak } from "@/lib/overview";
import { HOLD_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/labels";
import { BarList, type BarRow } from "@/components/ui/Bar";
import { Panel, PanelBasis, PanelHeader } from "@/components/ui/Panel";
import { ErrorState, LoadingRows, Skeleton } from "@/components/ui/States";
import type { Tone } from "@/components/ui/Token";
import { HighestExposure } from "@/components/overview/HighestExposure";
import { KpiBand } from "@/components/overview/KpiBand";
import { StatusComposition } from "@/components/overview/StatusComposition";

const OVERVIEW_QUERY = { limit: 100, offset: 0 } as const;
const SEVERITY_TONE = { blocking: "blocking", material: "material", advisory: "advisory" } as const;
const AGE_TONE = { today: "neutral", one_to_seven: "focus", eight_to_thirty: "material", over_thirty: "blocking" } as const;

export default function OverviewPage() {
  const { summary, error: summaryError } = useRunSummary(config.currentRunId);
  const { page, loading, error: queueError } = useExceptionQueue(OVERVIEW_QUERY);
  const items = useMemo(() => page?.cases ?? [], [page]);

  const holdRows = useMemo<BarRow[]>(() => {
    const groups = summary?.holds.by_type ?? [];
    const scale = peak(groups.map((group) => group.open_count));
    return groups.filter((group) => group.open_count > 0 || group.released_count > 0).map((group) => ({ key: group.hold_type, label: HOLD_TYPE_LABELS[group.hold_type], fraction: group.open_count / scale, value: String(group.open_count), detail: group.released_count > 0 ? `${group.released_count} released` : null, tone: group.policy?.blocks_accounting ? "blocking" as Tone : "focus" as Tone }));
  }, [summary]);
  const severityRows = useMemo<BarRow[]>(() => { const groups = bySeverity(items); const scale = peak(groups.map((group) => group.count)); return groups.map((group) => ({ key: group.key, label: SEVERITY_LABELS[group.key], fraction: group.count / scale, value: String(group.count), detail: null, tone: SEVERITY_TONE[group.key] })); }, [items]);
  const ageRows = useMemo<BarRow[]>(() => { const groups = byAge(items); const scale = peak(groups.map((group) => group.count)); return groups.map((group) => ({ key: group.key, label: AGE_BUCKET_LABELS[group.key], fraction: group.count / scale, value: String(group.count), detail: null, tone: AGE_TONE[group.key] })); }, [items]);
  const basis = page ? `counted over ${items.length} of ${page.total_matching} matching cases` : queueError ? "queue read failed" : "counting…";
  const fromQueue = (skeleton: ReactNode, content: ReactNode) => queueError ? <ErrorState title="Queue unavailable" message={queueError} /> : loading && !page ? skeleton : content;

  return <div className="h-full overflow-y-auto"><div className="mx-auto w-full max-w-[100rem] space-y-4 px-4 py-5 sm:px-6 sm:py-6">
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"><div><h1 className="text-2xl font-semibold tracking-tight text-ink">Overview</h1><p className="mt-1 text-base text-ink-muted">Reconciliation run <span className="font-mono text-sm text-ink">{config.currentRunId}</span></p></div><Link href="/exceptions" className="rounded-xs text-base text-focus-ink underline-offset-4 hover:underline">Open the queue &rarr;</Link></header>
    <KpiBand summary={summary} error={summaryError} />
    <div className="grid gap-4 lg:grid-cols-2"><Panel><PanelHeader title="Open holds by type" />{summaryError ? <ErrorState title="Run unavailable" message={summaryError} /> : !summary ? <div className="p-4"><Skeleton className="h-32 w-full" /></div> : <BarList rows={holdRows} />}<PanelBasis>Open and released counts are supplied by the run overview, with accounting behavior taken from each hold policy.</PanelBasis></Panel>
    <Panel><PanelHeader title="Where the run stands" /><StatusComposition summary={summary} error={summaryError} /><PanelHeader title="Open-case severity" className="border-t" />{fromQueue(<div className="p-4"><Skeleton className="h-28 w-full" /></div>, <BarList rows={severityRows} />)}<PanelBasis>Outcome counts come from the run overview. Severity is {basis}.</PanelBasis></Panel></div>
    <div className="grid gap-4 xl:grid-cols-3"><Panel className="xl:col-span-2"><PanelHeader title="Highest exposure" action={<Link href="/exceptions" className="rounded-xs text-xs text-focus-ink underline-offset-4 hover:underline">Open the queue &rarr;</Link>} />{fromQueue(<LoadingRows rows={4} />, <HighestExposure items={items.slice(0, 6)} />)}</Panel><Panel><PanelHeader title="Age of held cases" />{fromQueue(<div className="p-4"><Skeleton className="h-28 w-full" /></div>, <BarList rows={ageRows} />)}<PanelBasis>Age in whole days is supplied by the queue route, {basis}.</PanelBasis></Panel></div>
    <p className="px-1 pb-2 text-xs text-ink-faint">This run only. No historical trend is invented.</p>
  </div></div>;
}
