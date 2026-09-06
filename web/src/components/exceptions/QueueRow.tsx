import type { ExceptionSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatMoney } from "@/lib/format";
import { SeverityToken } from "@/components/ui/Badge";
import { Token } from "@/components/ui/Token";

/**
 * Three lines: money, what happened, who and how long.
 *
 * Money leads and is right-aligned in a fixed column so the digits stack down
 * the queue — the ordering is by exposure, so the ordering has to be visible
 * without reading a single word.
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

  return (
    <div
      className={cn(
        "border-l-2 px-3 py-2 transition-colors",
        selected
          ? "border-focus bg-surface-3"
          : active
            ? "border-transparent bg-surface-2"
            : "border-transparent hover:bg-surface-2",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "num font-mono text-base font-semibold",
            hasExposure ? "text-ink" : "text-ink-faint",
          )}
        >
          {formatMoney(item.exposure_paise, item.currency)}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {item.status === "routed" ? <Token tone="cleared">Routed</Token> : null}
          <SeverityToken severity={item.severity} />
        </span>
      </div>

      <p className="clamp-2 mt-1 text-base leading-snug text-ink">{item.title}</p>

      <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-xs text-ink-faint">
        <span className="text-ink-muted">{item.reference}</span>
        <span aria-hidden className="opacity-40">·</span>
        <span className="truncate">{item.assignee ?? item.entity.label}</span>
        <span aria-hidden className="opacity-40">·</span>
        <span
          className={cn(
            "shrink-0",
            sla.breached ? "text-blocking" : sla.urgent ? "text-material" : "text-ink-faint",
          )}
        >
          {sla.label}
        </span>
      </p>

      {!hasExposure ? <p className="mt-1 text-xs text-ink-faint">No exposure recorded</p> : null}
    </div>
  );
}
