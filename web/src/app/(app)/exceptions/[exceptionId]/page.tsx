"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useExceptionDetail } from "@/hooks/useExceptionDetail";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import { ActionConsole } from "@/components/exceptions/ActionConsole";
import { CaseHeader } from "@/components/exceptions/CaseHeader";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { ConflictBar } from "@/components/exceptions/ConflictBar";
import { EvidenceReferences } from "@/components/exceptions/EvidenceReferences";
import { Button } from "@/components/ui/Button";
import { KeyHint } from "@/components/ui/KeyHint";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, ErrorState, LoadingRows, Skeleton } from "@/components/ui/States";

export default function ExceptionDetailPage() {
  const exceptionId = useParams<{ exceptionId: string }>().exceptionId;
  const state = useExceptionDetail(exceptionId);
  const { exception } = state;

  // Below xl the console is a drawer. It opens over the ledger rather than
  // squeezing it, because the ledger is what the decision is made from.
  const [consoleOpen, setConsoleOpen] = useState(false);
  useEffect(() => setConsoleOpen(false), [exceptionId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isBareKey(event) || isTypingTarget(event.target)) return;
      if (event.key === "]") {
        event.preventDefault();
        setConsoleOpen((open) => !open);
      } else if (event.key === "Escape") {
        setConsoleOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (state.loading && !exception) {
    return (
      <div className="space-y-4 p-4 sm:p-5">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-16 w-full" />
        <LoadingRows rows={3} className="p-0" />
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

  if (state.notFound || !exception) {
    return (
      <EmptyState
        title="Exception not found"
        description={`Nothing in this run matches "${exceptionId}".`}
        action={
          <Link href="/exceptions" className="text-base text-focus-ink underline underline-offset-4">
            Back to the queue
          </Link>
        }
      />
    );
  }

  const failingCount = exception.signals.filter((signal) => signal.status === "fail").length;

  return (
    /* overflow-hidden: the console parks off-canvas below xl, and without this
       the page would gain a horizontal scroll the width of the drawer. */
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 pb-20 sm:p-5 xl:pb-5">
          <CaseHeader exception={exception} />

          <ConflictBar exception={exception} />

          <Panel>
            <PanelHeader
              title="Field comparison"
              count={
                exception.signals.length > 0
                  ? `${exception.signals.length} fields · ${failingCount} failing`
                  : undefined
              }
            />
            <ComparisonLedger signals={exception.signals} />
          </Panel>

          {exception.policy ? (
            <Panel>
              <PanelHeader title="Policy" count={exception.policy.id} />
              <div className="px-4 py-4 sm:px-5">
                <p className="font-medium text-ink">{exception.policy.name}</p>
                <p className="mt-1.5 text-base text-ink-muted">{exception.policy.clause}</p>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Evidence references" count={exception.evidence.length} />
            <EvidenceReferences items={exception.evidence} />
          </Panel>
        </div>
      </div>

      {/* Console: docked at xl and above, drawer below. One instance either way. */}
      <aside
        aria-label="Context and action console"
        className={
          consoleOpen
            ? "absolute inset-y-0 right-0 z-40 flex w-full max-w-[400px] translate-x-0 flex-col border-l border-line-strong bg-canvas shadow-overlay transition-transform xl:static xl:z-auto xl:w-[360px] xl:max-w-none xl:shadow-none 2xl:w-[400px]"
            : "absolute inset-y-0 right-0 z-40 flex w-full max-w-[400px] translate-x-full flex-col border-l border-line-strong bg-canvas transition-transform xl:static xl:z-auto xl:w-[360px] xl:max-w-none xl:translate-x-0 2xl:w-[400px]"
        }
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line-strong bg-surface px-4 xl:hidden">
          <span className="text-md font-semibold text-ink">Console</span>
          <button
            type="button"
            onClick={() => setConsoleOpen(false)}
            className="rounded-xs text-ink-faint hover:text-ink"
            aria-label="Close console"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ActionConsole exception={exception} state={state} />
        </div>
      </aside>

      {/* The action bar that raises the console when it is not docked. */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-16 items-center gap-3 border-t border-line-strong bg-surface px-4 xl:hidden">
        <Button variant="primary" className="flex-1" onClick={() => setConsoleOpen(true)}>
          Route, hold, tolerance
        </Button>
        <KeyHint>]</KeyHint>
      </div>
    </div>
  );
}
