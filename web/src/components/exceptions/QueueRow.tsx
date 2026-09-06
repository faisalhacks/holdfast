import type { ExceptionSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatMoney } from "@/lib/format";
import { SeverityToken } from "@/components/ui/Badge";

/**
 * Three lines: money, what happened, who and how long.
 *
 * Money leads at the top of the type scale because the ordering is by exposure
 * and the ordering has to be visible without reading a word. The row carries
 * one token at most — severity — and says everything else in plain text; a row
 * wearing four chips is a row nobody scans.
 *
 * A routed case keeps its place but stops competing: the left edge goes green
 * and the title drops to muted, which is cheaper than another pill.
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
  const subject = item.assignee ?? (item.entity.label === item.reference ? null : item.entity.label);

  return (
    <div
      className={cn(
        "border-l-[3px] px-4 py-3.5 transition-colors",
        selected
          ? "border-focus bg-surface-3"
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
          "clamp-2 mt-1.5 text-base leading-snug",
          routed ? "text-ink-muted" : "text-ink",
        )}
      >
        {item.title}
      </p>

      <p className="mt-2 flex items-center gap-2 truncate text-xs text-ink-faint">
        <span className="shrink-0 font-mono text-ink-muted">{item.reference}</span>
        {subject ? (
          <>
            <span aria-hidden className="opacity-40">·</span>
            <span className="truncate">{subject}</span>
          </>
        ) : null}
        <span aria-hidden className="opacity-40">·</span>
        <span
          className={cn(
            "shrink-0",
            sla.breached
              ? "font-medium text-blocking"
              : sla.urgent
                ? "text-material"
                : "text-ink-faint",
          )}
        >
          {sla.label}
        </span>
      </p>

      {!hasExposure ? (
        <p className="mt-1.5 text-xs text-ink-faint">No exposure recorded</p>
      ) : null}
    </div>
  );
}
