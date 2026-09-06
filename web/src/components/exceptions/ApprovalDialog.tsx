"use client";

import { useEffect, useRef } from "react";
import type { ApprovalPreview } from "@/lib/api";
import { formatMoney, formatTolerance } from "@/lib/format";
import { HOLD_TYPE_LABELS, TOLERANCE_DIRECTION_LABELS } from "@/lib/labels";
import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { PendingApproval } from "@/hooks/useCaseDossier";

/**
 * The human-approval step for a destructive operation.
 *
 * The backend refused the request with 428 and described what it WOULD do. Everything
 * rendered here comes out of that preview — no figure is recomputed in the browser, so the
 * reviewer confirms exactly what the backend is about to record. Confirming repeats the
 * same request carrying `X-Holdfast-Human-Approval` naming this reviewer; the header must
 * equal the reviewer in the body, so a machine cannot approve on their behalf by omission.
 */
export function ApprovalDialog({
  request,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  request: PendingApproval;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        aria-describedby="approval-body"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-lg border border-line bg-surface shadow-xl sm:rounded-lg"
      >
        <div className="border-b border-line px-5 py-4">
          <p className="text-[11px] font-semibold tracking-widest text-material uppercase">
            Human approval required
          </p>
          <h2 id="approval-title" className="mt-1 text-base font-semibold text-ink">
            {request.preview.operation === "release_hold"
              ? "Release holds on this case"
              : "Release the holds this tolerance change governs"}
          </h2>
          <p className="mt-1 text-xs text-ink-muted">{request.message}</p>
        </div>

        <div id="approval-body" className="px-5 py-4">
          {request.preview.operation === "release_hold" ? (
            <ReleasePreview preview={request.preview} />
          ) : (
            <TolerancePreview preview={request.preview} />
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <p className="text-xs text-ink-muted">
            Confirming records this against{" "}
            <span className="font-mono text-ink">{request.reviewer}</span> in the append-only
            journal, and repeats the request with the{" "}
            <span className="font-mono">X-Holdfast-Human-Approval</span> header naming them.
            Releasing a hold does not pay anything.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-blocking">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelRef}
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onConfirm} loading={pending} disabled={pending}>
              Approve as {request.reviewer}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function ReleasePreview({
  preview,
}: {
  preview: Extract<ApprovalPreview, { operation: "release_hold" }>;
}) {
  return (
    <>
      {preview.document_becomes_payable ? (
        <p className="mb-3 rounded-md border border-blocking/40 bg-blocking/10 px-3 py-2 text-xs text-blocking">
          This releases the last hold on the document. It becomes payable in the system that
          pays it.
        </p>
      ) : null}
      {preview.releases_a_hold_that_would_not_lift_on_its_own ? (
        <p className="mb-3 rounded-md border border-material/40 bg-material/10 px-3 py-2 text-xs text-material">
          At least one of these holds would not lift on its own. Releasing it is a judgement,
          not a formality.
        </p>
      ) : null}

      <p className="text-[10px] tracking-wide text-ink-faint uppercase">
        Holds to release ({preview.holds_to_release.length})
      </p>
      <ul className="mt-2 space-y-2">
        {preview.holds_to_release.map((hold) => (
          <li key={hold.id} className="rounded-md border border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span>
              <SeverityBadge severity={hold.severity} />
              {hold.blocks_accounting ? (
                <Badge className="border-blocking/40 bg-blocking/10 text-blocking">
                  Blocks accounting
                </Badge>
              ) : null}
              {!hold.auto_releasable ? (
                <Badge className="border-material/35 bg-material/10 text-material">
                  Will not lift on its own
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-ink-muted">{hold.reason}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{hold.id}</p>
            {hold.conflicts.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {hold.conflicts.map((conflict) => (
                  <li key={conflict.code} className="text-[11px] text-ink-faint">
                    <span className="font-mono">{conflict.code}</span>
                    {conflict.clause ? ` · ${conflict.clause}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <dl className="mt-4">
        <Line label="Case">
          <span className="font-mono text-xs">{preview.case_id}</span>
        </Line>
        <Line label="Invoice">
          <span className="font-mono text-xs">{preview.invoice_id}</span>
        </Line>
        <Line label="Invoice gross">
          <span className="font-mono tabular-nums">{formatMoney(preview.invoice_gross)}</span>
        </Line>
        <Line label="Money at risk">
          <span className="font-mono tabular-nums">{formatMoney(preview.money_at_risk)}</span>
        </Line>
        <Line label="Holds still open afterwards">
          {preview.holds_still_open_afterwards.length === 0 ? (
            <span className="text-blocking">none — the document becomes payable</span>
          ) : (
            preview.holds_still_open_afterwards
              .map((hold) => HOLD_TYPE_LABELS[hold.type])
              .join(", ")
          )}
        </Line>
      </dl>
    </>
  );
}

function TolerancePreview({
  preview,
}: {
  preview: Extract<ApprovalPreview, { operation: "tolerance_change_release" }>;
}) {
  return (
    <>
      {preview.widening ? (
        <p className="mb-3 rounded-md border border-material/40 bg-material/10 px-3 py-2 text-xs text-material">
          This widens a tolerance and releases the holds it governs. The widening is recorded
          as a decision, with who made it and why — it is never silent.
        </p>
      ) : null}
      {preview.includes_holds_that_would_not_lift_on_their_own ? (
        <p className="mb-3 rounded-md border border-blocking/40 bg-blocking/10 px-3 py-2 text-xs text-blocking">
          The set includes at least one hold that would not lift on its own.
        </p>
      ) : null}

      <dl>
        <Line label="Direction">{TOLERANCE_DIRECTION_LABELS[preview.direction]}</Line>
        <Line label="Scope">{preview.scope_description}</Line>
        <Line label="From">
          <span className="font-mono">{formatTolerance(preview.from)}</span>
        </Line>
        <Line label="To">
          <span className="font-mono">{formatTolerance(preview.to)}</span>
        </Line>
        <Line label="Holds that would release">
          {preview.holds_that_would_release_count}
        </Line>
        <Line label="Money that would stop being held">
          <span className="font-mono tabular-nums">
            {formatMoney(preview.money_that_would_stop_being_held)}
          </span>
        </Line>
      </dl>

      {preview.holds_that_would_release.length > 0 ? (
        <>
          <p className="mt-4 text-[10px] tracking-wide text-ink-faint uppercase">
            Every hold in scope
          </p>
          <ul className="mt-2 space-y-1.5">
            {preview.holds_that_would_release.map((hold) => (
              <li
                key={hold.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span>
                  <SeverityBadge severity={hold.severity} />
                  <span className="font-mono text-[11px] text-ink-faint">{hold.case_id}</span>
                </div>
                <span className="font-mono text-xs text-ink tabular-nums">
                  {formatMoney(hold.invoice_gross)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">
          The backend found no open hold this change would reach.
        </p>
      )}
    </>
  );
}
