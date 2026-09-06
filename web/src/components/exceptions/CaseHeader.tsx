import Link from "next/link";
import type { ExceptionDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatDateTime, formatMoney, formatRelative } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { SeverityToken, StatusToken } from "@/components/ui/Badge";
import { StateDot } from "@/components/ui/Token";

/**
 * The selected case: what it is, what it is worth, and what is blocking it.
 *
 * Identity, the summary strip and the conflict band are one surface rather
 * than three stacked cards. They answer one question between them — what am I
 * looking at and how bad is it — and splitting that across three borders makes
 * a reviewer assemble the answer themselves.
 *
 * Every field here is one the contract guarantees on an `ExceptionDetail`.
 * There is no purchase-order or invoice number in the frontend contract, so
 * the identity line carries the entity the API actually named, the workflow
 * that raised the case, and the run it belongs to.
 */
export function CaseHeader({ exception }: { exception: ExceptionDetail }) {
  const sla = describeSla(exception.slaDueAt);
  const hasExposure = exception.exposure_paise !== null;
  const hold = exception.hold;
  const held = hold?.status === "held";

  const failing = exception.signals.filter((signal) => signal.status === "fail");
  const missing = exception.signals.filter((signal) => signal.status === "unknown");
  const showConflict = failing.length > 0 || missing.length > 0 || Boolean(hold);

  return (
    <section className="overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel">
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

        <h1 className="mt-3 text-xl leading-snug font-semibold tracking-tight text-ink sm:text-[1.5rem]">
          {exception.title}
        </h1>

        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {exception.entity.label !== exception.reference ? (
            <>
              <span className="font-medium text-ink">{exception.entity.label}</span>
              <span aria-hidden className="opacity-40">·</span>
            </>
          ) : null}
          <span>{exception.workflow}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="font-mono text-xs">{exception.runId}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span title={formatDateTime(exception.raisedAt)}>
            raised {formatRelative(exception.raisedAt)}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="label-field">Amount at risk</dt>
          <dd
            className={cn(
              "num mt-1.5 text-xl font-semibold tracking-tight 2xl:text-2xl",
              hasExposure ? "text-ink" : "text-ink-faint",
            )}
          >
            {formatMoney(exception.exposure_paise, exception.currency)}
          </dd>
        </div>

        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="label-field">Time left</dt>
          <dd
            className={cn(
              "mt-1.5 text-md font-semibold",
              sla.breached ? "text-blocking" : sla.urgent ? "text-material" : "text-ink",
            )}
          >
            {sla.label}
          </dd>
          <p className="mt-0.5 text-xs text-ink-faint">due {formatDateTime(exception.slaDueAt)}</p>
        </div>

        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="label-field">Hold state</dt>
          {hold ? (
            <>
              <dd
                className={cn(
                  "mt-1.5 flex items-baseline gap-2 text-md font-semibold",
                  held ? "text-blocking" : "text-cleared",
                )}
              >
                <StateDot tone={held ? "blocking" : "cleared"} className="translate-y-[-2px]" />
                {held ? "Payment held" : "Hold released"}
              </dd>
              <p className="num mt-0.5 text-xs text-ink-faint">
                {held && hold.amount_paise !== null
                  ? formatMoney(hold.amount_paise, hold.currency)
                  : hold.releasedAt
                    ? formatDateTime(hold.releasedAt)
                    : hold.reason}
              </p>
            </>
          ) : (
            <>
              <dd className="mt-1.5 text-md font-semibold text-ink-muted">No hold</dd>
              <p className="mt-0.5 text-xs text-ink-faint">Nothing is blocking payment</p>
            </>
          )}
        </div>
      </dl>

      {/*
        A restatement of what the ledger below already shows: which fields are
        failing, and what the hold is blocking. It emits no conflict codes —
        the contract carries no `Conflict[]`, and inventing ERP-shaped tokens
        here would put words in the engine's mouth.
      */}
      {showConflict ? (
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-t px-4 py-3 sm:px-5",
            held ? "border-blocking/20 bg-blocking/6" : "border-line bg-surface-2",
          )}
        >
          <span className="label-field">Conflict summary</span>
          {failing.length > 0 ? (
            <p className="text-base text-ink">
              {failing.length} field{failing.length === 1 ? "" : "s"} outside reference:{" "}
              <span className="text-ink-muted">
                {failing.map((signal) => signal.label).join(", ")}
              </span>
            </p>
          ) : null}
          {missing.length > 0 ? (
            <p className="text-base text-ink-muted">
              {missing.length} without a reference value
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
