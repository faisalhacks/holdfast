"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { config } from "@/lib/config";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { useRunSummary } from "@/hooks/useRunSummary";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, SEVERITY_LABELS } from "@/lib/labels";
import {
  SLA_BUCKET_LABELS,
  byCategory,
  bySeverity,
  bySlaBucket,
  peak,
  type SlaBucketKey,
} from "@/lib/overview";
import { SEVERITY_TONE } from "@/components/ui/Badge";
import { BarList, type BarRow } from "@/components/ui/Bar";
import { Panel, PanelBasis, PanelHeader } from "@/components/ui/Panel";
import { ErrorState, LoadingRows, Skeleton } from "@/components/ui/States";
import type { Tone } from "@/components/ui/Token";
import { HighestExposure } from "@/components/overview/HighestExposure";
import { KpiBand } from "@/components/overview/KpiBand";
import { StatusComposition } from "@/components/overview/StatusComposition";

/*
 * One page-sized read of the money-ordered queue. The Overview counts over what
 * it fetched and says so; it never pages the whole run to make a chart look
 * complete.
 */
const OVERVIEW_QUERY = {
  status: "all",
  severity: "all",
  category: "all",
  search: "",
  sort: "amount_desc",
  page: 1,
  pageSize: 100,
} as const;

const SLA_TONE: Record<SlaBucketKey, Tone> = {
  breached: "blocking",
  under_4h: "material",
  under_24h: "neutral",
  beyond_24h: "neutral",
};

/**
 * The run, as far as the API can describe it.
 *
 * Two reads exist: the run summary and the money-ordered queue. There is no
 * history endpoint, so there is no trend, no rate, and no target here — a
 * sparkline on this screen would be a drawing, not a measurement. Every panel
 * assembled from queue rows rather than from the summary states the set it was
 * counted over.
 */
export default function OverviewPage() {
  const { summary, error: summaryError } = useRunSummary(config.currentRunId);
  const { page, loading, error: queueError } = useExceptionQueue(OVERVIEW_QUERY);

  const items = useMemo(() => page?.items ?? [], [page]);
  const currency = summary?.currency ?? items[0]?.currency ?? "INR";

  const categoryRows = useMemo<BarRow[]>(() => {
    const groups = byCategory(items);
    const scale = peak(groups.map((group) => group.exposure_paise));
    return groups.map((group) => ({
      key: group.key,
      label: CATEGORY_LABELS[group.key],
      fraction: group.exposure_paise / scale,
      value:
        group.exposure_paise > 0
          ? formatMoney(group.exposure_paise, currency)
          : "Not recorded",
      detail:
        group.withoutExposure > 0
          ? `${group.count} case${group.count === 1 ? "" : "s"} · ${group.withoutExposure} without an exposure figure`
          : `${group.count} case${group.count === 1 ? "" : "s"}`,
      tone: "focus" as Tone,
    }));
  }, [items, currency]);

  const severityRows = useMemo<BarRow[]>(() => {
    const groups = bySeverity(items);
    const scale = peak(groups.map((group) => group.count));
    return groups.map((group) => ({
      key: group.key,
      label: SEVERITY_LABELS[group.key],
      fraction: group.count / scale,
      value: String(group.count),
      detail: null,
      tone: SEVERITY_TONE[group.key],
    }));
  }, [items]);

  const sla = useMemo(() => bySlaBucket(items), [items]);
  const slaRows = useMemo<BarRow[]>(() => {
    const scale = peak(sla.buckets.map((bucket) => bucket.count));
    return sla.buckets.map((bucket) => ({
      key: bucket.key,
      label: SLA_BUCKET_LABELS[bucket.key],
      fraction: bucket.count / scale,
      value: String(bucket.count),
      detail:
        bucket.exposure_paise > 0 ? formatMoney(bucket.exposure_paise, currency) : null,
      tone: SLA_TONE[bucket.key],
    }));
  }, [sla, currency]);

  const basis = page
    ? `counted over ${items.length} of ${page.total} in this run`
    : queueError
      ? "counted over nothing — the queue read failed"
      : "counting…";

  /*
   * Every panel below is assembled from queue rows. When that read fails there
   * are no rows, and an empty bar list is indistinguishable from a run with
   * nothing in it — so the failure is rendered instead of the chart. A chart
   * drawn over a failed read is not a quiet chart, it is a wrong one.
   */
  const fromQueue = (skeleton: ReactNode, content: ReactNode) => {
    if (queueError) return <ErrorState title="Queue unavailable" message={queueError} />;
    return loading && !page ? skeleton : content;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[100rem] space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Overview</h1>
            <p className="mt-1 text-base text-ink-muted">
              Reconciliation run{" "}
              <span className="font-mono text-sm text-ink">{config.currentRunId}</span>
              {page ? (
                <>
                  {" · "}
                  {page.total} exception{page.total === 1 ? "" : "s"}
                </>
              ) : null}
            </p>
          </div>
          <Link
            href="/exceptions"
            className="rounded-xs text-base text-focus-ink underline-offset-4 hover:underline"
          >
            Open the queue &rarr;
          </Link>
        </header>

        <KpiBand summary={summary} error={summaryError} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Recorded exposure by exception type" />
            {fromQueue(
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>,
              <BarList rows={categoryRows} />,
            )}
            <PanelBasis>
              Each case&rsquo;s recorded exposure, summed across every status, {basis}. A case
              with no exposure figure is named rather than counted as zero. The money-at-risk
              figure above is the run summary&rsquo;s own and may be scoped differently.
            </PanelBasis>
          </Panel>

          <Panel>
            <PanelHeader title="Where the run stands" />
            <StatusComposition summary={summary} error={summaryError} />
            <PanelHeader title="By severity" className="border-t" />
            {fromQueue(
              <div className="p-4">
                <Skeleton className="h-28 w-full" />
              </div>,
              <BarList rows={severityRows} />,
            )}
            <PanelBasis>
              Status counts come from the run summary. Severity is {basis}.
            </PanelBasis>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Highest exposure"
              action={
                <Link
                  href="/exceptions"
                  className="rounded-xs text-xs text-focus-ink underline-offset-4 hover:underline"
                >
                  Open the queue &rarr;
                </Link>
              }
            />
            {fromQueue(<LoadingRows rows={4} />, <HighestExposure items={items.slice(0, 6)} />)}
          </Panel>

          <Panel>
            <PanelHeader title="Time remaining" />
            {fromQueue(
              <div className="p-4">
                <Skeleton className="h-28 w-full" />
              </div>,
              <BarList rows={slaRows} />,
            )}
            <PanelBasis>
              Against each case&rsquo;s SLA target, {basis}
              {sla.undated > 0 ? `; ${sla.undated} carried no readable target` : ""}. The figure
              beside each bar is the recorded exposure of the cases in it.
            </PanelBasis>
          </Panel>
        </div>

        <p className="px-1 pb-2 text-xs text-ink-faint">
          This run only. The API exposes no history, so there is no trend on this screen.
        </p>
      </div>
    </div>
  );
}
