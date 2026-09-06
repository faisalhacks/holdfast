import Link from "next/link";
import type { ExceptionDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { SeverityToken, StatusToken } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Fields";

export function CaseHeader({ exception }: { exception: ExceptionDetail }) {
  const sla = describeSla(exception.slaDueAt);
  const hasExposure = exception.exposure_paise !== null;

  return (
    <header className="border-b border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/exceptions"
          className="rounded-xs font-mono text-xs text-ink-faint hover:text-ink lg:hidden"
        >
          ← Queue
        </Link>
        <span className="font-mono text-sm text-ink-muted">{exception.reference}</span>
        <SeverityToken severity={exception.severity} />
        <StatusToken status={exception.status} />
        <span className="text-xs text-ink-faint">{CATEGORY_LABELS[exception.category]}</span>
      </div>

      <h1 className="mt-1.5 text-lg leading-snug font-semibold text-ink">{exception.title}</h1>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2 sm:grid-cols-3 xl:grid-cols-5">
        <Field label="Subject">{exception.entity.label}</Field>
        <Field label="Agent" mono>
          {exception.agent}
        </Field>
        <Field label="Run" mono>
          {exception.runId}
        </Field>
        <Field label="Exposure">
          <span
            className={cn("font-mono text-md font-semibold", hasExposure ? "text-ink" : "text-ink-faint")}
          >
            {formatMoney(exception.exposure_paise, exception.currency)}
          </span>
        </Field>
        <Field label="SLA">
          <span
            className={cn(
              "text-base",
              sla.breached ? "text-blocking" : sla.urgent ? "text-material" : "text-ink",
            )}
          >
            {sla.label}
          </span>
          <span className="mt-0.5 block font-mono text-xs text-ink-faint">
            raised {formatRelative(exception.raisedAt)} · {formatDateTime(exception.raisedAt)}
          </span>
        </Field>
      </dl>
    </header>
  );
}
