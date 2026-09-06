"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useExceptionDetail } from "@/hooks/useExceptionDetail";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import { ActionConsole } from "@/components/exceptions/ActionConsole";
import { CaseContext } from "@/components/exceptions/CaseContext";
import { CaseHeader } from "@/components/exceptions/CaseHeader";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { Button } from "@/components/ui/Button";
import { KeyHint } from "@/components/ui/KeyHint";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";

/*
 * The centre and the console are separate surfaces on the canvas rather than
 * two halves of one sheet, so the diagnostic reading and the act that follows
 * it are visibly different places to be.
 */
const SURFACE =
  "overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel";

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
      <div className="space-y-3">
        <Skeleton className="h-56 w-full rounded-md" />
        <Skeleton className="h-72 w-full rounded-md" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className={SURFACE}>
        <ErrorState
          message={state.error}
          action={
            <Button size="sm" variant="outline" onClick={state.refresh}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (state.notFound || !exception) {
    return (
      <div className={SURFACE}>
        <EmptyState
          title="Exception not found"
          description={`Nothing in this run matches "${exceptionId}".`}
          action={
            <Link
              href="/exceptions"
              className="text-base text-focus-ink underline underline-offset-4"
            >
              Back to the queue
            </Link>
          }
        />
      </div>
    );
  }

  const failingCount = exception.signals.filter((signal) => signal.status === "fail").length;

  return (
    /* overflow-hidden: the console parks off-canvas below xl, and without this
       the page would gain a horizontal scroll the width of the drawer. */
    <div className="relative flex h-full min-h-0 gap-3 overflow-hidden 2xl:gap-4">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-3 pb-20 xl:pb-0 2xl:space-y-4">
          <CaseHeader exception={exception} />

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

          <CaseContext exception={exception} />
        </div>
      </div>

      {/*
        Console: docked at xl and above, drawer below. One instance either way.

        The closed drawer is display-toggled rather than parked off-canvas with
        a transform. `translate-x-full` compiles to the `translate` property
        here and did not survive into the computed style, which left the drawer
        sitting on top of the ledger at every width below xl. A panel that is
        merely moved out of sight is also still in the tab order; `hidden`
        removes it from both.
      */}
      <aside
        aria-label="Context and action console"
        className={
          consoleOpen
            ? "absolute inset-y-0 right-0 z-40 flex w-full max-w-[400px] flex-col overflow-hidden rounded-md border border-line-strong bg-surface shadow-overlay xl:static xl:w-[340px] xl:max-w-none xl:shadow-panel 2xl:w-[380px]"
            : "hidden flex-col overflow-hidden border border-line-strong bg-surface xl:static xl:flex xl:w-[340px] xl:rounded-md xl:shadow-panel 2xl:w-[380px]"
        }
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4 xl:hidden">
          <span className="text-base font-semibold text-ink">Console</span>
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

      {/* The action bar that raises the console when it is not docked. It floats
          on the canvas like every other surface rather than welding itself to
          the bottom of the viewport. */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-16 items-center gap-3 rounded-md border border-line-strong bg-surface px-4 shadow-overlay xl:hidden">
        <Button variant="primary" size="lg" className="flex-1" onClick={() => setConsoleOpen(true)}>
          Route, hold, tolerance
        </Button>
        <KeyHint>]</KeyHint>
      </div>
    </div>
  );
}
