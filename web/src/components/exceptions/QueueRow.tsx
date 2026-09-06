import type { ExceptionSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatMoney } from "@/lib/format";
import { SeverityToken } from "@/components/ui/Badge";

/**
 * Three lines: money, what happened, who and how long.
 *
 * Money leads at the top of the type scale because the ordering is by exposure
 * and the ordering has to be visible without reading a word. The row carries
 * one token — severity — and says everything else in plain text.
 *
 * The selected row is the reviewer's place in a backlog they will leave and
 * come back to, so it is stated loudly: the accent bar, the wash, and a
 * weighted title. A routed case steps back the other way, on the same axis.
 */
export function QueueRow({
  item,
  selected,
  active,
}: {
  item: ExceptionSummary;
  selected: boolean;
  active: boolean;
}) {
  const sla = describeSla(item.slaDueAt);
  const hasExposure = item.exposure_paise !== null;
  const routed = item.status === "routed";
  const subject =
    item.assignee ?? (item.entity.label === item.reference ? null : item.entity.label);

  return (
    <div
      className={cn(
        "border-l-[3px] px-4 py-4 transition-colors",
        selected
          ? "border-focus bg-focus-wash"
          : routed
            ? "border-cleared/50 hover:bg-surface-2"
            : "border-transparent hover:bg-surface-2",
        !selected && active && "bg-surface-2",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "num text-lg font-semibold tracking-tight",
            hasExposure ? "text-ink" : "text-ink-faint",
          )}
        >
          {formatMoney(item.exposure_paise, item.currency)}
        </span>
        <span className="shrink-0">
          <SeverityToken severity={item.severity} />
        </span>
      </div>

      <p
        className={cn(
          "clamp-2 mt-2 text-base leading-snug",
          selected ? "font-medium text-ink" : routed ? "text-ink-muted" : "text-ink",
        )}
      >
        {item.title}
      </p>

      <p className="mt-2.5 flex items-baseline gap-2 text-xs text-ink-faint">
        <span className="shrink-0 font-mono text-ink-muted">{item.reference}</span>
        {subject ? (
          <>
            <span aria-hidden className="opacity-40">·</span>
            <span className="truncate">{subject}</span>
          </>
        ) : null}
        <span
          className={cn(
            "ml-auto shrink-0",
            sla.breached ? "font-medium text-blocking" : sla.urgent ? "text-material" : null,
          )}
        >
          {sla.label}
        </span>
      </p>

      {!hasExposure ? (
        <p className="mt-2 text-xs text-ink-faint">No exposure recorded</p>
      ) : null}
    </div>
  );
}
