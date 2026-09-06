"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ExceptionSummary, Severity } from "@/lib/api";
import { config } from "@/lib/config";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { useRunSummary } from "@/hooks/useRunSummary";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, SEVERITY_LABELS } from "@/lib/labels";
import { SeverityToken } from "@/components/ui/Badge";
import { PanelHeader } from "@/components/ui/Panel";
import { LoadingRows, Skeleton } from "@/components/ui/States";

const OVERVIEW_QUERY = {
  status: "all",
  severity: "all",
  category: "all",
  search: "",
  sort: "amount_desc",
  page: 1,
  pageSize: 100,
} as const;

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function countBy<K extends string>(items: ExceptionSummary[], key: (item: ExceptionSummary) => K) {
  const out = new Map<K, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
}

/**
 * The run, as far as the API can describe it.
 *
 * Two reads exist: the run summary and the money-ordered queue. There is no
 * history endpoint, so there is no trend, no rate, and no target here — a
 * sparkline on this screen would be a drawing, not a measurement. The
 * composition counts state the set they were counted over.
 */
export default function OverviewPage() {
  const { summary } = useRunSummary(config.currentRunId);
  const { page, loading } = useExceptionQueue(OVERVIEW_QUERY);

  const items = useMemo(() => page?.items ?? [], [page]);
  const bySeverity = useMemo(() => countBy(items, (item) => item.severity), [items]);
  const byCategory = useMemo(() => countBy(items, (item) => item.category), [items]);
  const top = items.slice(0, 5);

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-line bg-surface px-3 py-3">
        <h1 className="label-section">Run</h1>
        <p className="mt-0.5 font-mono text-md text-ink">{config.currentRunId}</p>

        {summary ? (
          <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-line pt-3">
            <div>
              <dt className="label-section">Money at risk</dt>
              <dd className="num mt-0.5 font-mono text-xl font-semibold text-ink">
                {formatMoney(summary.money_at_risk_paise, summary.currency)}
              </dd>
            </div>
            <div>
              <dt className="label-section">Open</dt>
              <dd className="num mt-0.5 font-mono text-md text-ink">{summary.open}</dd>
            </div>
            <div>
              <dt className="label-section">In review</dt>
              <dd className="num mt-0.5 font-mono text-md text-ink">{summary.inReview}</dd>
            </div>
            <div>
              <dt className="label-section">Held</dt>
              <dd className="num mt-0.5 font-mono text-md text-blocking">{summary.held}</dd>
            </div>
            <div>
              <dt className="label-section">Routed</dt>
              <dd className="num mt-0.5 font-mono text-md text-cleared">{summary.routed}</dd>
            </div>
          </dl>
        ) : (
          <Skeleton className="mt-3 h-8 w-full max-w-lg" />
        )}
      </div>

      <PanelHeader
        title="Highest exposure"
        action={
          <Link href="/exceptions" className="text-xs text-focus-ink hover:text-ink">
            Open the queue →
          </Link>
        }
      />
      {loading && !page ? (
        <LoadingRows rows={4} />
      ) : top.length > 0 ? (
        <ul className="divide-y divide-line border-b border-line">
          {top.map((item) => (
            <li key={item.id}>
              <Link
                href={`/exceptions/${item.id}`}
                className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <span
                  className={
                    item.exposure_paise !== null
                      ? "num w-32 shrink-0 text-right font-mono text-base font-semibold text-ink"
                      : "num w-32 shrink-0 text-right font-mono text-base text-ink-faint"
                  }
                >
                  {formatMoney(item.exposure_paise, item.currency)}
                </span>
                <span className="w-24 shrink-0 font-mono text-sm text-ink-muted">
                  {item.reference}
                </span>
                <span className="min-w-0 flex-1 truncate text-base text-ink">{item.title}</span>
                <SeverityToken severity={item.severity} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-b border-line px-3 py-4 text-sm text-ink-faint">
          The API returned no exceptions for this run.
        </p>
      )}

      <PanelHeader
        title="Composition"
        count={page ? `counted over ${items.length} of ${page.total} in this run` : undefined}
      />
      <div className="grid gap-x-8 gap-y-4 px-3 py-3 sm:grid-cols-2">
        <div>
          <p className="label-section">By severity</p>
          <ul className="mt-1.5 space-y-1">
            {SEVERITY_ORDER.map((severity) => (
              <li key={severity} className="flex items-center justify-between gap-3">
                <span className="text-base text-ink-muted">{SEVERITY_LABELS[severity]}</span>
                <span className="num font-mono text-base text-ink">
                  {bySeverity.get(severity) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label-section">By category</p>
          <ul className="mt-1.5 space-y-1">
            {[...byCategory.entries()].map(([category, count]) => (
              <li key={category} className="flex items-center justify-between gap-3">
                <span className="text-base text-ink-muted">{CATEGORY_LABELS[category]}</span>
                <span className="num font-mono text-base text-ink">{count}</span>
              </li>
            ))}
            {byCategory.size === 0 ? (
              <li className="text-sm text-ink-faint">Nothing to count.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
