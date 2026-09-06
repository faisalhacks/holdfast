import type { QueueCase } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatAge, formatMoney } from "@/lib/format";
import { HOLD_TYPE_LABELS, OWNER_ROLE_LABELS } from "@/lib/labels";
import { SeverityBadge } from "@/components/ui/Badge";

/** A money-first row over the real queue case returned by the backend. */
export function QueueRow({ item, selected, active }: { item: QueueCase; selected: boolean; active: boolean }) {
  const primaryHold = item.openHolds[0] ?? item.holds[0] ?? null;
  const routed = item.decision !== null;
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
        <span className="num text-lg font-semibold tracking-tight text-ink">
          {formatMoney(item.money_at_risk)}
        </span>
        {item.severity ? <SeverityBadge severity={item.severity} /> : null}
      </div>
      <p className={cn("mt-2 text-base leading-snug", selected ? "font-medium text-ink" : "text-ink-muted")}>
        {primaryHold ? HOLD_TYPE_LABELS[primaryHold.type] : "No open hold"}
      </p>
      <p className="mt-2.5 flex items-baseline gap-2 text-xs text-ink-faint">
        <span className="shrink-0 font-mono text-ink-muted">{item.invoice_id}</span>
        <span aria-hidden className="opacity-40">·</span>
        <span>{formatAge(item.age_days)}</span>
        <span className="ml-auto truncate">
          {item.suggested_next ? OWNER_ROLE_LABELS[item.suggested_next.owner_role] : item.case_id}
        </span>
      </p>
      <p className="mt-2 text-xs text-ink-faint">
        {item.blocks_accounting ? "Blocks accounting" : "Accounting entries permitted"}
        {routed ? " · decision recorded" : " · awaiting decision"}
      </p>
    </div>
  );
}
