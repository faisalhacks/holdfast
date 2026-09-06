import Link from "next/link";
import type { ExceptionDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="mt-1 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

export function ExceptionHeader({ exception }: { exception: ExceptionDetail }) {
  const sla = describeSla(exception.slaDueAt);

  return (
    <div className="border-b border-line px-4 pt-5 pb-5 sm:px-6 sm:pt-6">
      <Link
        href="/exceptions"
        className="text-xs text-ink-faint transition-colors hover:text-ink"
      >
        ← Exception queue
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-faint">{exception.reference}</span>
        <SeverityBadge severity={exception.severity} />
        <StatusBadge status={exception.status} />
        <span className="text-[11px] text-ink-faint">
          {CATEGORY_LABELS[exception.category]}
        </span>
      </div>

      <h1 className="mt-2 max-w-4xl text-xl leading-snug font-semibold text-balance text-ink">
        {exception.title}
      </h1>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-4 md:grid-cols-3 xl:grid-cols-5">
        <Meta label="Subject">{exception.entity.label}</Meta>
        <Meta label="Agent">
          <span className="font-mono text-xs">{exception.agent}</span>
          <span className="block text-[11px] text-ink-faint">{exception.workflow}</span>
        </Meta>
        <Meta label="Run">
          <span className="font-mono text-xs">{exception.runId}</span>
        </Meta>
        <Meta label="Exposure">
          <span className={cn("font-mono text-base font-semibold tabular-nums", exception.exposure_paise !== null ? "text-high" : "text-ink-faint")}>
            {formatMoney(exception.exposure_paise, exception.currency)}
          </span>
        </Meta>
        <Meta label="SLA">
          <span
            className={cn(
              "text-sm",
              sla.breached ? "text-critical" : sla.urgent ? "text-high" : "text-ink",
            )}
          >
            {sla.label}
          </span>
          <span className="block text-[11px] text-ink-faint">
            raised {formatRelative(exception.raisedAt)} · {formatDateTime(exception.raisedAt)}
          </span>
        </Meta>
      </dl>
    </div>
  );
}
