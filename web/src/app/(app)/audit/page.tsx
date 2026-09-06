"use client";

import { useState } from "react";
import { AUDIT_EVENTS, type AuditEvent, type AuditQuery } from "@/lib/api";
import { useAudit } from "@/hooks/useAudit";
import { config } from "@/lib/config";
import { AUDIT_EVENT_LABELS } from "@/lib/labels";
import { AuditStream } from "@/components/exceptions/AuditStream";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/States";

const SELECT = "h-9 rounded-sm border border-line-strong bg-surface px-2 text-sm text-ink focus:border-focus focus:outline-none";
const DEFAULT_QUERY: AuditQuery = { run_id: config.currentRunId, event: "all", limit: 100 };

export default function AuditPage() {
  const [query, setQuery] = useState<AuditQuery>(DEFAULT_QUERY);
  const { slice, loading, error, refresh } = useAudit(query);
  return <div className="h-full overflow-y-auto"><div className="mx-auto w-full max-w-[100rem] space-y-4 px-4 py-5 sm:px-6 sm:py-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-ink">Audit</h1><p className="mt-1 text-base text-ink-muted">Append-only journal and backend-verified chain report.</p></div><Button size="sm" variant="outline" onClick={refresh} loading={loading}>Refresh</Button></header>
    <Panel><div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center"><select aria-label="Event" className={SELECT} value={query.event ?? "all"} onChange={(event) => setQuery((previous) => ({ ...previous, event: event.target.value as AuditEvent | "all" }))}><option value="all">All events</option>{AUDIT_EVENTS.map((event) => <option key={event} value={event}>{AUDIT_EVENT_LABELS[event]}</option>)}</select><select aria-label="Run" className={SELECT} value={query.run_id ? "run" : "all"} onChange={(event) => setQuery((previous) => ({ ...previous, run_id: event.target.value === "run" ? config.currentRunId : null }))}><option value="run">This run only</option><option value="all">Every run</option></select><span className="font-mono text-xs text-ink-faint sm:ml-auto">{slice ? `${slice.entries.length} entries` : ""}</span></div>
      {error ? <ErrorState message={error} action={<Button size="sm" variant="outline" onClick={refresh}>Try again</Button>} /> : loading && !slice ? <LoadingRows rows={8} /> : slice && slice.entries.length > 0 ? <AuditStream slice={slice} /> : <EmptyState title="No journal entry matches" description="Widen the filters to see the rest of the journal." />}
    </Panel>
  </div></div>;
}
