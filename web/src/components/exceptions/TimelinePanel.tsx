import type { AuditEntry, AuditEvent, AuditSlice, ChainReport } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import { AUDIT_EVENT_LABELS } from "@/lib/labels";

const EVENT_DOT: Partial<Record<AuditEvent, string>> = {
  hold_applied: "bg-caution",
  hold_released: "bg-positive",
  decision_recorded: "bg-brand",
  tolerance_changed: "bg-brand",
  application_status_changed: "bg-brand",
  proposal_received: "bg-line-strong",
  proposal_discarded: "bg-negative",
  candidate_scored: "bg-line-strong",
  run_started: "bg-line-strong",
  run_completed: "bg-line-strong",
};

function describeActor(entry: AuditEntry): string {
  if (entry.actor.kind === "human") return entry.actor.reviewer;
  if (entry.actor.kind === "model") {
    return `${entry.actor.model_id} @ ${entry.actor.call_site}`;
  }
  return entry.actor.component;
}

/**
 * The chain report the backend computed over the slice it returned.
 *
 * `intact` is the integrity claim; `contiguous` says whether the slice covers an unbroken
 * span, which a filtered read usually does not. Both are stated, because reporting only the
 * first would let a filtered view read as a claim about the whole journal.
 */
export function ChainStatus({ chain }: { chain: ChainReport }) {
  return (
    <div
      className={cn(
        "border-b px-4 py-2.5 text-xs",
        chain.intact
          ? "border-line bg-surface-2/60 text-ink-muted"
          : "border-critical/40 bg-critical/10 text-critical",
      )}
    >
      <p>
        <span className="font-semibold">
          {chain.intact ? "Hash chain re-verified" : "Hash chain BROKEN"}
        </span>
        <span className="mx-1.5 opacity-50">·</span>
        {chain.entries_examined} entr{chain.entries_examined === 1 ? "y" : "ies"}
        {chain.first_sequence !== null
          ? `, sequence ${chain.first_sequence}–${chain.last_sequence}`
          : ""}
        {chain.contiguous ? ", contiguous" : ", filtered slice — not contiguous"}
      </p>
      {chain.missing_sequences.length > 0 ? (
        <p className="mt-1 font-mono text-[11px]">
          missing sequences: {chain.missing_sequences.join(", ")}
        </p>
      ) : null}
      {chain.broken_links.length > 0 ? (
        <p className="mt-1 font-mono text-[11px]">
          broken links: {chain.broken_links.join(", ")}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] opacity-80">{chain.note}</p>
    </div>
  );
}

/**
 * The journal slice, newest first.
 *
 * `detail` is structured on the wire and is rendered as key/value pairs rather than being
 * flattened into a sentence — the backend never writes a narrative paragraph and neither
 * does this.
 */
export function TimelinePanel({ slice }: { slice: AuditSlice }) {
  const ordered = [...slice.entries].sort((a, b) => b.sequence - a.sequence);

  if (ordered.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-faint">No journal entry matches.</p>;
  }

  return (
    <>
      <ChainStatus chain={slice.chain} />
      <ol className="relative px-4 py-2">
        {ordered.map((entry, index) => (
          <li
            key={entry.id}
            className="relative border-b border-line/60 py-3 pl-5 last:border-b-0"
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 left-0 size-2 rounded-full",
                EVENT_DOT[entry.event] ?? "bg-line-strong",
              )}
            />
            {index < ordered.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-5 bottom-[-0.75rem] left-[3.5px] w-px bg-line-strong"
              />
            ) : null}

            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-sm text-ink">{AUDIT_EVENT_LABELS[entry.event]}</span>
              <span className="font-mono text-[11px] text-ink-faint">
                {formatRelative(entry.occurred_at)}
              </span>
            </div>

            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {Object.entries(entry.detail).map(([key, value]) => (
                <div key={key} className="flex gap-1 text-[11px]">
                  <dt className="text-ink-faint">{key.replaceAll("_", " ")}</dt>
                  <dd className="font-mono text-ink-muted">{String(value)}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-1 font-mono text-[11px] text-ink-faint">
              #{entry.sequence} · {entry.actor.kind}:{describeActor(entry)} ·{" "}
              {entry.entity.entity} {entry.entity.id} · {formatDateTime(entry.occurred_at)}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
