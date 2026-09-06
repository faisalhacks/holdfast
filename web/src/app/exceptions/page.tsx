"use client";

import { useCallback, useState } from "react";
import type { ExceptionQuery } from "@/lib/api";
import { useExceptionQueue } from "@/hooks/useExceptionQueue";
import { PageHeader } from "@/components/layout/AppShell";
import { ExceptionTable } from "@/components/exceptions/ExceptionTable";
import { QueueFilters } from "@/components/exceptions/QueueFilters";
import { QueueStatsBar } from "@/components/exceptions/QueueStatsBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/States";

const DEFAULT_QUERY: ExceptionQuery = {
  status: "all",
  severity: "all",
  category: "all",
  search: "",
  sort: "amount_desc",
  page: 1,
  pageSize: 10,
};

export default function ExceptionQueuePage() {
  const [query, setQuery] = useState<ExceptionQuery>(DEFAULT_QUERY);
  const { page, stats, loading, error, refresh } = useExceptionQueue(query);

  const patchQuery = useCallback((patch: Partial<ExceptionQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch }));
  }, []);

  const isFiltered =
    query.status !== "all" ||
    query.severity !== "all" ||
    query.category !== "all" ||
    Boolean(query.search?.trim());

  return (
    <>
      <PageHeader
        title="Exception queue"
        description="Exceptions that need an operational next step, ordered by money at risk."
        action={
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />

      <QueueStatsBar stats={stats} loading={loading} />

      <Card className="mx-4 mb-6 sm:mx-6">
        <QueueFilters
          query={query}
          onChange={patchQuery}
          resultCount={page?.total ?? null}
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
        ) : page && page.items.length > 0 ? (
          <>
            <ExceptionTable items={page.items} />
            <Pagination
              page={page.page}
              pageSize={page.pageSize}
              total={page.total}
              onPageChange={(next) => patchQuery({ page: next })}
            />
          </>
        ) : (
          <EmptyState
            title={isFiltered ? "No matching exceptions" : "No exceptions in this run"}
            description={
              isFiltered
                ? "Adjust or clear the filters to see the rest of the review queue."
                : "The API returned no exceptions for the selected run."
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
