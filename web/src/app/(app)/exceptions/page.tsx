"use client";

import Link from "next/link";
import { useMemo } from "react";
import { config } from "@/lib/config";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { useRunSummary } from "@/hooks/useRunSummary";
import { describeSla, formatMoney } from "@/lib/format";
import { SeverityToken } from "@/components/ui/Badge";
import { KeyHint } from "@/components/ui/KeyHint";
import { Panel, PanelHeader } from "@/components/ui/Panel";

/*
 * A small money-ordered read, purely so this pane can name the case a reviewer
 * should probably open first. The queue in the layout does its own read; this
 * one is deliberately short.
 */
const REST_QUERY = {
  status: "all",
  severity: "all",
  category: "all",
  search: "",
  sort: "amount_desc",
  page: 1,
  pageSize: 20,
} as const;

/**
 * The centre pane with nothing selected.
 *
 * It states where the run stands and which case carries the most money, rather
 * than leaving a reviewer looking at a screen-sized blank while the queue sits
 * beside it fully loaded. Everything here is a figure the API returned; there
 * is no illustration and no encouragement.
 */
export default function ExceptionQueueRestState() {
  const { summary } = useRunSummary(config.currentRunId);
  const { page } = useExceptionQueue(REST_QUERY);

  const items = useMemo(() => page?.items ?? [], [page]);
  const top = items[0] ?? null;
  const breached = useMemo(
    () => items.filter((item) => describeSla(item.slaDueAt).breached).length,
    [items],
  );

  const attention: string[] = [];
  if (breached > 0) {
    attention.push(
      `${breached} exception${breached === 1 ? " has" : "s have"} breached the SLA target`,
    );
  }
  if (summary && summary.held > 0) {
    attention.push(
      `${summary.held} payment${summary.held === 1 ? " is" : "s are"} held pending review`,
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl space-y-4 px-5 py-6 sm:px-8 sm:py-8">
        <header>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Select an exception to review
          </h1>
          <p className="mt-1.5 text-base text-ink-muted">
            The queue is ordered by money at risk, descending. Open the top item, or search for a
            reference.
          </p>
        </header>

        {top ? (
          <Panel>
            <PanelHeader title="Highest exposure" />
            <Link
              href={`/exceptions/${top.id}`}
              className="block px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={
                    top.exposure_paise !== null
                      ? "num text-xl font-semibold tracking-tight text-ink"
                      : "num text-xl font-semibold tracking-tight text-ink-faint"
                  }
                >
                  {formatMoney(top.exposure_paise, top.currency)}
                </span>
                <SeverityToken severity={top.severity} />
              </div>
              <p className="mt-1.5 text-base text-ink">{top.title}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <span className="font-mono text-ink-muted">{top.reference}</span>
                {top.entity.label !== top.reference ? (
                  <>
                    <span aria-hidden className="opacity-40">·</span>
                    <span>{top.entity.label}</span>
                  </>
                ) : null}
                <span aria-hidden className="opacity-40">·</span>
                <span>{describeSla(top.slaDueAt).label}</span>
              </p>
            </Link>
          </Panel>
        ) : null}

        {attention.length > 0 ? (
          <Panel>
            <PanelHeader title="Needs attention first" />
            <ul className="divide-y divide-line">
              {attention.map((line) => (
                <li key={line} className="px-4 py-3 text-base text-ink sm:px-5">
                  {line}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <p className="px-1 text-base">
          <Link
            href="/overview"
            className="rounded-xs text-focus-ink underline-offset-4 hover:underline"
          >
            See how the whole run stands &rarr;
          </Link>
        </p>

        <p className="flex flex-wrap items-center gap-2 px-1 text-xs text-ink-faint">
          <KeyHint>j</KeyHint>
          <KeyHint>k</KeyHint>
          <span>move</span>
          <span aria-hidden className="opacity-40">·</span>
          <KeyHint>↵</KeyHint>
          <span>open</span>
          <span aria-hidden className="opacity-40">·</span>
          <KeyHint>/</KeyHint>
          <span>search</span>
        </p>
      </div>
    </div>
  );
}
