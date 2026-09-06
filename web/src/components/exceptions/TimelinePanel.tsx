import type { TimelineEvent, TimelineEventKind } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { TIMELINE_KIND_LABELS } from "@/lib/labels";

const KIND_DOT: Record<TimelineEventKind, string> = {
  run: "bg-line-strong",
  signal: "bg-caution",
  escalation: "bg-high",
  comment: "bg-brand",
  routing: "bg-positive",
  hold: "bg-caution",
  tolerance: "bg-brand",
};

export function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  const ordered = [...events].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ol className="relative px-4 py-2">
      {ordered.map((event, index) => (
        <li key={event.id} className="relative border-b border-line/60 py-3 pl-5 last:border-b-0">
          <span
            aria-hidden
            className={cn("absolute top-1.5 left-0 size-2 rounded-full", KIND_DOT[event.kind])}
          />
          {index < ordered.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-5 bottom-[-0.75rem] left-[3.5px] w-px bg-line-strong"
            />
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-sm text-ink">{event.title}</span>
            <span className="font-mono text-[11px] text-ink-faint">{formatRelative(event.at)}</span>
          </div>
          {event.detail ? (
            <p className="mt-1 text-xs text-ink-muted">{event.detail}</p>
          ) : null}
          <p className="mt-1 font-mono text-[11px] text-ink-faint">
            {TIMELINE_KIND_LABELS[event.kind]} · {event.actor} · {formatDateTime(event.at)}
          </p>
        </li>
      ))}
    </ol>
  );
}
