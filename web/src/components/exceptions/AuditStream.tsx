import type { TimelineEvent } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { TIMELINE_KIND_LABELS, isHumanEvent } from "@/lib/labels";

/**
 * The per-exception event stream, newest first.
 *
 * System and human actions are distinguished by the typed event kind rather
 * than by pattern-matching the actor string, so the distinction never depends
 * on how a backend happens to spell a name. Absolute time leads; an auditor
 * reads the clock, not "3h ago".
 */
export function AuditStream({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="px-3 py-4 text-sm text-ink-faint">No events recorded.</p>;
  }

  const ordered = [...events].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ol className="divide-y divide-line/70">
      {ordered.map((event) => {
        const human = isHumanEvent(event.kind);
        return (
          <li key={event.id} className="px-3 py-2">
            <p className="num flex items-baseline justify-between gap-2 font-mono text-2xs text-ink-faint">
              <span>{formatDateTime(event.at)}</span>
              <span>{formatRelative(event.at)}</span>
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 translate-y-[-1px] rounded-full",
                  human ? "bg-focus" : "bg-transparent ring-1 ring-ink-faint",
                )}
              />
              <span className="font-mono text-2xs tracking-wider text-ink-faint uppercase">
                {TIMELINE_KIND_LABELS[event.kind]}
              </span>
              <span className="min-w-0 text-base text-ink">{event.title}</span>
            </p>
            <p className="mt-0.5 pl-3 font-mono text-2xs text-ink-faint">
              {human ? "user" : "system"} &middot; {event.actor}
            </p>
            {event.detail ? (
              <p className="mt-0.5 pl-3 text-sm text-ink-muted">{event.detail}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
