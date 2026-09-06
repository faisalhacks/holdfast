"use client";

import { useCallback, useState } from "react";
import type { QueueQuery } from "@/lib/api";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { PageHeader } from "@/components/layout/AppShell";
import { ExceptionTable } from "@/components/exceptions/ExceptionTable";
import { QueueFilters } from "@/components/exceptions/QueueFilters";
import { QueueStatsBar } from "@/components/exceptions/QueueStatsBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/States";
import { offsetToPage, pageToOffset } from "@/lib/paging";

const PAGE_SIZE = 10;

const DEFAULT_QUERY: QueueQuery = {
  hold_type: "all",
  blocks_accounting: null,
  undecided_only: false,
  limit: PAGE_SIZE,
  offset: 0,
};

export default function ExceptionQueuePage() {
  const [query, setQuery] = useState<QueueQuery>(DEFAULT_QUERY);
  const { page, run, loading, error, refresh } = useExceptionQueue(query);

  const patchQuery = useCallback((patch: Partial<QueueQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch }));
  }, []);

  const isFiltered =
    (query.hold_type ?? "all") !== "all" ||
    query.blocks_accounting !== null ||
    Boolean(query.undecided_only);

  return (
    <>
      <PageHeader
        title="Exception queue"
        description="Cases the engine could not clear, ordered by money at risk — the ordering the API returns them in."
        action={
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />

      <QueueStatsBar run={run} page={page} loading={loading} />

      <Card className="mx-4 mb-6 sm:mx-6">
        <QueueFilters
          query={query}
          onChange={patchQuery}
          resultCount={page?.total_matching ?? null}
          onClear={() => setQuery(DEFAULT_QUERY)}
        />

        {error ? (
          <ErrorState
            message={error}
            action={
              <Button size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            }
          />
        ) : loading && !page ? (
          <LoadingRows rows={8} />
        ) : page && page.cases.length > 0 ? (
          <>
            <ExceptionTable items={page.cases} />
            <Pagination
              page={offsetToPage(page.offset, page.limit)}
              pageSize={page.limit}
              total={page.total_matching}
              onPageChange={(next) => patchQuery({ offset: pageToOffset(next, page.limit) })}
            />
          </>
        ) : (
          <EmptyState
            title={isFiltered ? "No case matches these filters" : "No open case in this run"}
            description={
              isFiltered
                ? "Adjust or clear the filters to see the rest of the queue."
                : "The API returned no exception case for the selected run."
            }
            action={
              isFiltered ? (
                <Button size="sm" variant="outline" onClick={() => setQuery(DEFAULT_QUERY)}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
    </>
  );
}
