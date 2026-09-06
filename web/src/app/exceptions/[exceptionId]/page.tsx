"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCaseDossier } from "@/hooks/useCaseDossier";
import { config } from "@/lib/config";
import { formatMoney } from "@/lib/format";
import { HOLD_TYPE_LABELS } from "@/lib/labels";
import { ApprovalDialog } from "@/components/exceptions/ApprovalDialog";
import { CandidatePanel } from "@/components/exceptions/CandidatePanel";
import { DecisionPanel } from "@/components/exceptions/DecisionPanel";
import { EvidenceTable } from "@/components/exceptions/EvidenceTable";
import { ExceptionHeader } from "@/components/exceptions/ExceptionHeader";
import { HoldPanel } from "@/components/exceptions/HoldPanel";
import { TimelinePanel } from "@/components/exceptions/TimelinePanel";
import { TolerancePanel } from "@/components/exceptions/TolerancePanel";
import { SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { EmptyState, ErrorState, LoadingRows, Skeleton } from "@/components/ui/States";

export default function CaseDetailPage() {
  const caseId = useParams<{ exceptionId: string }>().exceptionId;
  const reviewer = config.reviewerId;
  const state = useCaseDossier(caseId, reviewer);
  const { dossier } = state;

  if (state.loading && !dossier) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (state.error) {
    return (
      <ErrorState
        message={state.error}
        action={
          <Button size="sm" variant="outline" onClick={state.refresh}>
            Try again
          </Button>
        }
      />
    );
  }

  if (state.notFound || !dossier) {
    return (
      <EmptyState
        title="Case not found"
        description={`The API has no case "${caseId}".`}
        action={
          <Link href="/exceptions" className="text-sm text-brand-ink underline">
            Back to the queue
          </Link>
        }
      />
    );
  }

  const topCandidate = dossier.candidates[0] ?? null;

  return (
    <>
      <ExceptionHeader dossier={dossier} />

      {state.outcome ? (
        <div className="px-4 pt-4 sm:px-6">
          <NoticeBanner
            notice={{ level: state.outcome.level, message: state.outcome.message }}
            onDismiss={state.dismissOutcome}
          />
        </div>
      ) : null}

      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Why this is held"
              subtitle="The typed holds in force, with the conflict that fired each one."
            />
            {dossier.why_held.length === 0 ? (
              <CardBody>
                <p className="text-sm text-ink-muted">
                  No hold is in force on this document.
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-line/60">
                {dossier.why_held.map((why) => (
                  <li key={why.hold_id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink">
                        {HOLD_TYPE_LABELS[why.hold_type]}
                      </span>
                      <SeverityBadge severity={why.severity} />
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{why.clause}</p>
                    <ul className="mt-1.5 space-y-0.5">
                      {why.conflicts.map((conflict) => (
                        <li key={conflict.code} className="text-[11px] text-ink-faint">
                          <span className="font-mono">{conflict.code}</span>
                          <span className="mx-1.5 opacity-50">·</span>
                          <span className="font-mono">{conflict.field_path}</span>
                          {conflict.clause ? ` · ${conflict.clause}` : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Invoice against payment"
              subtitle="Each compared field, its delta in its own units, and the tolerance that was applied."
            />
            <EvidenceTable rows={topCandidate?.evidence ?? []} />
          </Card>

          {topCandidate ? (
            <Card>
              <CardHeader
                title="Top candidate"
                subtitle="The scorer's arithmetic, itemised so it can be re-added by hand."
              />
              <CandidatePanel candidate={topCandidate} />
            </Card>
          ) : null}

          {dossier.duplicate_context.same_amount_invoices.length > 0 ? (
            <Card>
              <CardHeader
                title="Duplicate context"
                subtitle="Other documents from this vendor carrying exactly the same gross."
              />
              <ul className="divide-y divide-line/60">
                {dossier.duplicate_context.same_amount_invoices.map((invoice) => (
                  <li
                    key={invoice.invoice_id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <p className="font-mono text-sm text-ink">{invoice.reference}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                        {invoice.invoice_id} · {invoice.invoice_date} · period{" "}
                        {invoice.period} · {invoice.days_from_this_invoice} days apart
                      </p>
                    </div>
                    <span className="font-mono text-sm text-ink tabular-nums">
                      {formatMoney(invoice.gross)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Route next action"
              subtitle="Who should act next. Never approve or reject."
            />
            <DecisionPanel
              dossier={dossier}
              reviewer={reviewer}
              pending={state.pending === "route"}
              error={state.errorFor("route")}
              onSubmit={(input) => state.recordDecision("route", input)}
            />
          </Card>

          <Card>
            <CardHeader
              title="Holds"
              subtitle="Releasing a hold needs a named human and a reason. It pays nothing."
            />
            <HoldPanel
              dossier={dossier}
              reviewer={reviewer}
              pending={state.pending === "release_hold"}
              error={state.errorFor("release_hold")}
              onRelease={(input) => state.recordDecision("release_hold", input)}
            />
          </Card>

          <Card>
            <CardHeader
              title="Tolerance"
              subtitle="A widening is recorded as a decision, with who did it and why. Never silent."
            />
            <TolerancePanel
              dossier={dossier}
              reviewer={reviewer}
              pending={state.pending === "change_tolerance"}
              error={state.errorFor("change_tolerance")}
              onSubmit={state.changeTolerance}
            />
          </Card>

          <Card>
            <CardHeader
              title="Journal"
              subtitle="Append-only. The chain is re-verified over the slice shown."
            />
            <TimelinePanel slice={dossier.audit} />
          </Card>
        </div>
      </div>

      {state.pendingApproval ? (
        <ApprovalDialog
          request={state.pendingApproval}
          pending={state.pending !== null}
          error={state.errorFor(state.pendingApproval.action)}
          onConfirm={state.confirmApproval}
          onCancel={state.cancelApproval}
        />
      ) : null}
    </>
  );
}
