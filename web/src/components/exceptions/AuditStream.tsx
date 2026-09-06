import type { AuditActor, AuditSlice } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { AUDIT_EVENT_LABELS } from "@/lib/labels";

function actorLabel(actor: AuditActor): string {
  if (actor.kind === "human") return actor.reviewer;
  if (actor.kind === "model") return `${actor.model_id} · ${actor.call_site}`;
  return actor.component;
}

export function AuditStream({ slice }: { slice: AuditSlice }) {
  if (slice.entries.length === 0) return <p className="px-4 py-5 text-sm text-ink-faint">No journal entries recorded.</p>;
  const ordered = [...slice.entries].sort((a, b) => b.sequence - a.sequence);
  return <div><div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs"><span className={slice.chain.intact ? "text-cleared" : "text-blocking"}>{slice.chain.intact ? "Hash chain intact" : "Hash chain requires attention"}</span><span className="font-mono text-ink-faint">{slice.chain.entries_examined} examined</span></div><ol className="divide-y divide-line">{ordered.map((entry) => <li key={entry.id} className="px-4 py-3.5"><p className="num flex items-baseline justify-between gap-2 font-mono text-xs text-ink-faint"><span>#{entry.sequence} · {formatDateTime(entry.occurred_at)}</span><span>{formatRelative(entry.occurred_at)}</span></p><p className="mt-1.5 flex items-baseline gap-2"><span aria-hidden className={entry.actor.kind === "human" ? "size-1.5 shrink-0 rounded-full bg-focus" : "size-1.5 shrink-0 rounded-full ring-1 ring-ink-faint"} /><span className="label-field shrink-0">{AUDIT_EVENT_LABELS[entry.event]}</span><span className="min-w-0 truncate text-base font-medium text-ink">{entry.entity.entity} · {entry.entity.id}</span></p><p className="mt-1 pl-4 font-mono text-xs text-ink-faint">{entry.actor.kind} · {actorLabel(entry.actor)}</p>{Object.keys(entry.detail).length > 0 ? <p className="mt-1 pl-4 font-mono text-2xs break-all text-ink-muted">{JSON.stringify(entry.detail)}</p> : null}</li>)}</ol></div>;
}
