import Link from "next/link";
import type { CaseDossier } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatAge, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { HOLD_TYPE_LABELS } from "@/lib/labels";
import { AccountingBadge, ApplicationStatusBadge, PayableBadge, SeverityBadge } from "@/components/ui/Badge";
import { StateDot } from "@/components/ui/Token";

export function CaseHeader({ dossier }: { dossier: CaseDossier }) {
  const conflictCount = dossier.why_held.reduce((count, hold) => count + hold.conflicts.length, 0);
  return (
    <section className="overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel">
      <div className="px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/exceptions" className="rounded-xs text-xs text-ink-muted hover:text-ink lg:hidden">&larr; Queue</Link>
          <span className="font-mono text-sm text-ink-muted">{dossier.invoice.reference}</span>
          {dossier.severity ? <SeverityBadge severity={dossier.severity} /> : null}
          <ApplicationStatusBadge status={dossier.application_status} />
          <PayableBadge payable={dossier.payable} />
          <AccountingBadge blocks={dossier.blocks_accounting} />
        </div>
        <h1 className="mt-3 text-xl leading-snug font-semibold tracking-tight text-ink sm:text-[1.5rem]">{dossier.vendor.name}</h1>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span className="font-mono text-xs">{dossier.invoice_id}</span><span aria-hidden className="opacity-40">·</span><span className="font-mono text-xs">{dossier.case_id}</span><span aria-hidden className="opacity-40">·</span><span className="font-mono text-xs">{dossier.run_id}</span><span aria-hidden className="opacity-40">·</span><span title={formatDateTime(dossier.held_since)}>held {formatRelative(dossier.held_since)}</span>
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-4 py-3.5 sm:px-5"><dt className="label-field">Money at risk</dt><dd className="num mt-1.5 text-xl font-semibold tracking-tight text-ink 2xl:text-2xl">{formatMoney(dossier.money_at_risk)}</dd></div>
        <div className="bg-surface px-4 py-3.5 sm:px-5"><dt className="label-field">Age of hold</dt><dd className={cn("mt-1.5 text-md font-semibold", dossier.age_days > 30 ? "text-blocking" : dossier.age_days > 7 ? "text-material" : "text-ink")}>{formatAge(dossier.age_days)}</dd><p className="mt-0.5 text-xs text-ink-faint">since {formatDateTime(dossier.held_since)}</p></div>
        <div className="bg-surface px-4 py-3.5 sm:px-5"><dt className="label-field">Hold state</dt><dd className={cn("mt-1.5 flex items-baseline gap-2 text-md font-semibold", dossier.open_hold_count > 0 ? "text-blocking" : "text-cleared")}><StateDot tone={dossier.open_hold_count > 0 ? "blocking" : "cleared"} className="translate-y-[-2px]" />{dossier.open_hold_count} open · {dossier.released_hold_count} released</dd><p className="mt-0.5 text-xs text-ink-faint">{dossier.openHolds.map((hold) => HOLD_TYPE_LABELS[hold.type]).join(", ") || "No hold in force"}</p></div>
      </dl>
      {dossier.why_held.length > 0 ? <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t border-blocking/20 bg-blocking/6 px-4 py-3 sm:px-5"><span className="label-field">Why held</span><p className="text-base text-ink">{dossier.why_held.length} typed hold{dossier.why_held.length === 1 ? "" : "s"} · {conflictCount} conflict{conflictCount === 1 ? "" : "s"}</p><span className="text-base text-ink-muted">{dossier.why_held.map((hold) => HOLD_TYPE_LABELS[hold.hold_type]).join(", ")}</span></div> : null}
    </section>
  );
}
