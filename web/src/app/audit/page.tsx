"use client";

import { useState } from "react";
import type { AuditEvent, AuditQuery } from "@/lib/api";
import { AUDIT_EVENTS } from "@/lib/api";
import { useAudit } from "@/hooks/useAudit";
import { config } from "@/lib/config";
import { AUDIT_EVENT_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/layout/AppShell";
import { TimelinePanel } from "@/components/exceptions/TimelinePanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/States";

const SELECT_CLASS =
  "h-8 rounded-md border border-line-strong bg-surface-2 px-2 text-xs text-ink " +
  "transition-colors hover:border-brand/50 focus:border-brand focus:outline-none";

const DEFAULT_QUERY: AuditQuery = {
  run_id: config.currentRunId,
  event: "all",
  limit: 100,
};

/**
 * The append-only journal, read through `GET /api/audit`.
 *
 * Both filters are query parameters the route supports, so the chain report the backend
 * ships back describes exactly the slice on screen. There is no route in the API that
 * alters the journal, and none is called from here.
 */
export default function AuditLogPage() {
  const [query, setQuery] = useState<AuditQuery>(DEFAULT_QUERY);
  const { slice, loading, error, refresh } = useAudit(query);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every ingestion, hold, release, decision and tolerance change, in sequence, with the hash chain re-verified over the slice shown."
        action={
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card className="mx-4 mb-6 sm:mx-6">
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Event</span>
            <select
              aria-label="Event"
              className={SELECT_CLASS}
              value={query.event ?? "all"}
              onChange={(event) =>
                setQuery((previous) => ({
                  ...previous,
                  event: event.target.value as AuditEvent | "all",
                }))
              }
            >
              <option value="all">All events</option>
              {AUDIT_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {AUDIT_EVENT_LABELS[event]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="sr-only">Run</span>
            <select
              aria-label="Run"
              className={SELECT_CLASS}
              value={query.run_id ? "run" : "all"}
              onChange={(event) =>
                setQuery((previous) => ({
                  ...previous,
                  run_id: event.target.value === "run" ? config.currentRunId : null,
                }))
              }
            >
              <option value="run">This run only</option>
              <option value="all">Every run</option>
            </select>
          </label>

          <span className="font-mono text-xs text-ink-faint sm:ml-auto">
            {slice ? `${slice.entries.length} entries` : ""}
          </span>
        </div>

        {error ? (
          <ErrorState
            message={error}
            action={
              <Button size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            }
          />
        ) : loading && !slice ? (
          <LoadingRows rows={8} />
        ) : slice && slice.entries.length > 0 ? (
          <TimelinePanel slice={slice} />
        ) : (
          <EmptyState
            title="No journal entry matches"
            description="Widen the filters to see the rest of the journal."
          />
        )}
      </Card>
    </>
  );
}
