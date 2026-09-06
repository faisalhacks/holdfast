import Link from "next/link";
import type { ExceptionDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { SeverityToken, StatusToken } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Fields";

/**
 * The selected case, stated once and at full size.
 *
 * The metric strip carries only fields every `ExceptionDetail` has. Variance
 * and tolerance exist on some cases and not others, so they stay in the
 * comparison ledger and the tolerance console where the contract guarantees
 * them, rather than appearing here and vanishing on the next case.
 */
export function CaseHeader({ exception }: { exception: ExceptionDetail }) {
  const sla = describeSla(exception.slaDueAt);
  const hasExposure = exception.exposure_paise !== null;

  return (
    <header className="rounded-md border border-line-strong bg-surface shadow-panel">
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/exceptions"
            className="rounded-xs text-xs text-ink-muted hover:text-ink lg:hidden"
          >
            &larr; Queue
          </Link>
          <span className="font-mono text-sm text-ink-muted">{exception.reference}</span>
          <SeverityToken severity={exception.severity} />
          <StatusToken status={exception.status} />
          <span className="text-xs text-ink-faint">{CATEGORY_LABELS[exception.category]}</span>
        </div>

        <h1 className="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-ink">
          {exception.title}
        </h1>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {exception.entity.label !== exception.reference ? (
            <>
              <span className="font-medium text-ink">{exception.entity.label}</span>
              <span aria-hidden className="opacity-40">·</span>
            </>
          ) : null}
          <span>{exception.agent}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="font-mono text-xs">{exception.runId}</span>
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-3">
        <Metric
          label="Amount at risk"
          tone={hasExposure ? "default" : undefined}
          className={cn("bg-surface", !hasExposure && "text-ink-faint")}
        >
          <span className={hasExposure ? undefined : "text-ink-faint"}>
            {formatMoney(exception.exposure_paise, exception.currency)}
          </span>
        </Metric>
        <Metric label="Raised" className="bg-surface">
          <span className="text-base font-medium text-ink">
            {formatRelative(exception.raisedAt)}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-ink-faint">
            {formatDateTime(exception.raisedAt)}
          </span>
        </Metric>
        <Metric
          label="Time left"
          tone={sla.breached ? "blocking" : sla.urgent ? "material" : "default"}
          className="bg-surface"
        >
          <span className="text-md">{sla.label}</span>
          <span className="mt-0.5 block text-xs font-normal text-ink-faint">
            due {formatDateTime(exception.slaDueAt)}
          </span>
        </Metric>
      </dl>
    </header>
  );
}
