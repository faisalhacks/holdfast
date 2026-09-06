import Link from "next/link";
import type { CaseDossier } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatAge, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { HOLD_TYPE_LABELS } from "@/lib/labels";
import {
  AccountingBadge,
  ApplicationStatusBadge,
  Badge,
  PayableBadge,
  SeverityBadge,
} from "@/components/ui/Badge";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="mt-1 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

export function ExceptionHeader({ dossier }: { dossier: CaseDossier }) {
  return (
    <div className="border-b border-line px-4 pt-5 pb-5 sm:px-6 sm:pt-6">
      <Link
        href="/exceptions"
        className="text-xs text-ink-faint transition-colors hover:text-ink"
      >
        ← Exception queue
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-faint">{dossier.case_id}</span>
        {dossier.severity ? <SeverityBadge severity={dossier.severity} /> : null}
        <PayableBadge payable={dossier.payable} />
        <ApplicationStatusBadge status={dossier.application_status} />
        <AccountingBadge blocks={dossier.blocks_accounting} />
      </div>

      <h1 className="mt-2 max-w-4xl text-xl leading-snug font-semibold text-balance text-ink">
        {dossier.invoice.reference} · {dossier.vendor.name}
      </h1>

      <div className="mt-2 flex flex-wrap gap-1">
        {dossier.openHolds.map((hold) => (
          <Badge key={hold.id} className="border-line-strong bg-surface-2 text-ink-muted">
            {HOLD_TYPE_LABELS[hold.type]}
          </Badge>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-4 md:grid-cols-3 xl:grid-cols-5">
        <Meta label="Invoice">
          <span className="font-mono text-xs">{dossier.invoice_id}</span>
          <span className="block text-[11px] text-ink-faint">
            period {dossier.invoice.period}
          </span>
        </Meta>
        <Meta label="Vendor">
          <span className="text-sm">{dossier.vendor.name}</span>
          <span className="block font-mono text-[11px] text-ink-faint">
            {dossier.vendor.id}
          </span>
        </Meta>
        <Meta label="Run">
          <span className="font-mono text-xs">{dossier.run_id}</span>
        </Meta>
        <Meta label="Money at risk">
          <span
            className={cn(
              "font-mono text-base font-semibold tabular-nums",
              dossier.payable ? "text-ink-faint" : "text-high",
            )}
          >
            {formatMoney(dossier.money_at_risk)}
          </span>
          <span className="block text-[11px] text-ink-faint">
            gross {formatMoney(dossier.invoice.gross)}
          </span>
        </Meta>
        <Meta label="Held">
          <span className="text-sm text-ink">{formatAge(dossier.age_days)}</span>
          <span className="block text-[11px] text-ink-faint">
            since {formatRelative(dossier.held_since)} ·{" "}
            {formatDateTime(dossier.held_since)}
          </span>
        </Meta>
      </dl>
    </div>
  );
}
