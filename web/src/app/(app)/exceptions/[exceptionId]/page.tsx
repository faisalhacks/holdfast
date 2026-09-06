"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCaseDossier } from "@/hooks/useCaseDossier";
import { config } from "@/lib/config";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import { ActionConsole } from "@/components/exceptions/ActionConsole";
import { ApprovalDialog } from "@/components/exceptions/ApprovalDialog";
import { CaseContext } from "@/components/exceptions/CaseContext";
import { CaseHeader } from "@/components/exceptions/CaseHeader";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { Button } from "@/components/ui/Button";
import { KeyHint } from "@/components/ui/KeyHint";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";

const SURFACE = "overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel";

export default function CaseDetailPage() {
  const caseId = useParams<{ exceptionId: string }>().exceptionId;
  const state = useCaseDossier(caseId, config.reviewerId);
  const { dossier } = state;
  const [consoleOpen, setConsoleOpen] = useState(false);
  useEffect(() => setConsoleOpen(false), [caseId]);
  useEffect(() => { function onKey(event: KeyboardEvent) { if (!isBareKey(event) || isTypingTarget(event.target)) return; if (event.key === "]") { event.preventDefault(); setConsoleOpen((open) => !open); } else if (event.key === "Escape") setConsoleOpen(false); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);

  if (state.loading && !dossier) return <div className="space-y-3"><Skeleton className="h-56 w-full rounded-md" /><Skeleton className="h-72 w-full rounded-md" /></div>;
  if (state.error) return <div className={SURFACE}><ErrorState message={state.error} action={<Button size="sm" variant="outline" onClick={state.refresh}>Try again</Button>} /></div>;
  if (state.notFound || !dossier) return <div className={SURFACE}><EmptyState title="Case not found" description={`The API has no case "${caseId}".`} action={<Link href="/exceptions" className="text-base text-focus-ink underline underline-offset-4">Back to the queue</Link>} /></div>;

  const evidence = dossier.candidates[0]?.evidence ?? [];
  const outside = evidence.filter((row) => !row.within_tolerance).length;
  return <>
    <div className="relative flex h-full min-h-0 gap-3 overflow-hidden 2xl:gap-4">
      <div className="min-w-0 flex-1 overflow-y-auto"><div className="space-y-3 pb-20 xl:pb-0 2xl:space-y-4"><CaseHeader dossier={dossier} /><Panel><PanelHeader title="Invoice against payment" count={evidence.length > 0 ? `${evidence.length} fields · ${outside} outside tolerance` : undefined} /><ComparisonLedger rows={evidence} /></Panel><CaseContext dossier={dossier} /></div></div>
      <aside aria-label="Context and action console" className={consoleOpen ? "absolute inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col overflow-hidden rounded-md border border-line-strong bg-surface shadow-overlay xl:static xl:w-[340px] xl:max-w-none xl:shadow-panel 2xl:w-[380px]" : "hidden flex-col overflow-hidden border border-line-strong bg-surface xl:static xl:flex xl:w-[340px] xl:rounded-md xl:shadow-panel 2xl:w-[380px]"}><div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4 xl:hidden"><span className="text-base font-semibold text-ink">Console</span><button type="button" onClick={() => setConsoleOpen(false)} className="rounded-xs text-ink-faint hover:text-ink" aria-label="Close console">✕</button></div><div className="min-h-0 flex-1 overflow-y-auto"><ActionConsole dossier={dossier} reviewer={config.reviewerId} state={state} /></div></aside>
      <div className="absolute right-3 bottom-3 left-3 z-30 flex items-center justify-between rounded-md border border-line-strong bg-surface px-3 py-2 shadow-overlay xl:hidden"><span className="text-sm text-ink-muted">Review evidence before acting</span><Button size="sm" variant="primary" onClick={() => setConsoleOpen(true)}>Open console <KeyHint className="ml-1.5">]</KeyHint></Button></div>
    </div>
    {state.pendingApproval ? <ApprovalDialog request={state.pendingApproval} pending={state.pending !== null} error={state.errorFor(state.pendingApproval.action)} onConfirm={state.confirmApproval} onCancel={state.cancelApproval} /> : null}
  </>;
}
