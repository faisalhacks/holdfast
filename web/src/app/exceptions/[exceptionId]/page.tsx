"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useExceptionDetail } from "@/hooks/useExceptionDetail";
import { DecisionPanel } from "@/components/exceptions/DecisionPanel";
import { EvidenceList } from "@/components/exceptions/EvidenceList";
import { ExceptionHeader } from "@/components/exceptions/ExceptionHeader";
import { HoldPanel } from "@/components/exceptions/HoldPanel";
import { SignalTable } from "@/components/exceptions/SignalTable";
import { TimelinePanel } from "@/components/exceptions/TimelinePanel";
import { TolerancePanel } from "@/components/exceptions/TolerancePanel";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { EmptyState, ErrorState, LoadingRows, Skeleton } from "@/components/ui/States";
export default function ExceptionDetailPage() {
  const exceptionId = useParams<{ exceptionId: string }>().exceptionId;
  const state = useExceptionDetail(exceptionId); const { exception } = state;
  if (state.loading && !exception) return <div className="space-y-4 p-6"><Skeleton className="h-8 w-1/3"/><Skeleton className="h-24 w-full"/><LoadingRows rows={5}/></div>;
  if (state.error) return <ErrorState message={state.error} action={<Button size="sm" variant="outline" onClick={state.refresh}>Try again</Button>}/>;
  if (state.notFound || !exception) return <EmptyState title="Exception not found" description={`Nothing in the queue matches "${exceptionId}".`} action={<Link href="/exceptions" className="text-sm text-brand-ink underline">Back to the queue</Link>}/>;
  const actionError = (action: "route"|"release_hold"|"change_tolerance") => state.actionError?.action === action ? state.actionError.message : null;
  return <><ExceptionHeader exception={exception}/>{state.notice?<div className="px-4 pt-4 sm:px-6"><NoticeBanner notice={state.notice} onDismiss={state.dismissNotice}/></div>:null}<div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"><div className="space-y-4"><Card><CardHeader title="Source vs reference" subtitle="Field evidence from source records and policy references. Missing values remain uncertain."/><SignalTable signals={exception.signals}/></Card>{exception.policy?<Card><CardHeader title="Policy context" subtitle={exception.policy.name}/><CardBody><p className="text-sm text-ink-muted">{exception.policy.clause}</p><p className="mt-2 font-mono text-[11px] text-ink-faint">{exception.policy.id}</p></CardBody></Card>:null}<Card><CardHeader title="Evidence references" subtitle="Structured records used for this exception."/><EvidenceList items={exception.evidence}/></Card></div><div className="space-y-4"><Card><CardHeader title="Route next action" subtitle={exception.routingDecision ? "The next owner has been assigned." : "Choose the operational path and accountable owner."}/><DecisionPanel exception={exception} pending={state.pending} error={actionError("route")} onRoute={state.route}/></Card>{exception.hold?<Card><CardHeader title="Hold state" subtitle="Release only when the operational reason is recorded."/><HoldPanel hold={exception.hold} pending={state.pending} error={actionError("release_hold")} onRelease={state.releaseHold}/></Card>:null}{exception.tolerance?<Card><CardHeader title="Tolerance" subtitle="Changes apply to the backend-defined scope and return affected hold IDs."/><TolerancePanel tolerance={exception.tolerance} pending={state.pending} error={actionError("change_tolerance")} onChange={state.changeTolerance}/></Card>:null}<Card><CardHeader title="Timeline"/><TimelinePanel events={exception.timeline}/></Card></div></div></>;
}
