"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ExceptionDetail } from "@/lib/api";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import type { useExceptionDetail } from "@/hooks/useExceptionDetail";
import { AuditStream } from "./AuditStream";
import { HoldGovernance } from "./HoldGovernance";
import { RoutingConsole } from "./RoutingConsole";
import { ToleranceConsole } from "./ToleranceConsole";
import { KeyHint } from "@/components/ui/KeyHint";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { Token } from "@/components/ui/Token";

type State = ReturnType<typeof useExceptionDetail>;
type SectionKey = "hold" | "tolerance" | "audit";

function Section({
  id,
  title,
  status,
  open,
  onToggle,
  hint,
  children,
}: {
  id: SectionKey;
  title: string;
  status?: ReactNode;
  open: boolean;
  onToggle: () => void;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line">
      <h3>
        <button
          type="button"
          id={`console-section-${id}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`console-panel-${id}`}
          className="flex h-8 w-full items-center justify-between gap-2 bg-surface px-3 text-left transition-colors hover:bg-surface-2"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="text-ink-faint">
              {open ? "▾" : "▸"}
            </span>
            <span className="label-section">{title}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {status}
            <KeyHint>{hint}</KeyHint>
          </span>
        </button>
      </h3>
      <div id={`console-panel-${id}`} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * The right pane: route, govern, adjust, audit.
 *
 * Routing is pinned at the top because it is the act the product exists for.
 * Everything else collapses, and a section only exists when the exception
 * actually carries that state.
 */
export function ActionConsole({
  exception,
  state,
}: {
  exception: ExceptionDetail;
  state: State;
}) {
  const held = exception.hold?.status === "held";
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    hold: held,
    tolerance: false,
    audit: false,
  });

  /*
   * Disclosure resets when a different case is opened, and only then. A hold
   * that changes state under the reviewer must not fold the section away — the
   * consequence of what they just did is the thing they most need to read.
   */
  useEffect(() => {
    setOpen({ hold: exception.hold?.status === "held", tolerance: false, audit: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exception.id]);

  const toggle = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  // Focus a section by key. Movement and disclosure only: no shortcut in this
  // application commits a route, a release, or a tolerance change.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const map: Record<string, SectionKey | "route"> = {
        r: "route",
        h: "hold",
        t: "tolerance",
        a: "audit",
      };
      const target = map[event.key];
      if (!target || !isBareKey(event)) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      if (target === "route") {
        document.getElementById("console-route")?.scrollIntoView({ block: "start" });
        return;
      }
      setOpen((prev) => ({ ...prev, [target]: true }));
      window.requestAnimationFrame(() => {
        document.getElementById(`console-section-${target}`)?.focus();
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const actionError = (action: "route" | "release_hold" | "change_tolerance") =>
    state.actionError?.action === action ? state.actionError.message : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
      {state.notice ? (
        <div className="border-b border-line p-2">
          <NoticeBanner notice={state.notice} onDismiss={state.dismissNotice} />
        </div>
      ) : null}

      <section id="console-route">
        <div className="flex h-8 items-center justify-between gap-2 border-b border-line bg-surface px-3">
          <h3 className="label-section">Route next action</h3>
          <KeyHint>r</KeyHint>
        </div>
        <RoutingConsole
          exception={exception}
          pending={state.pending}
          error={actionError("route")}
          onRoute={state.route}
        />
      </section>

      {exception.hold ? (
        <Section
          id="hold"
          title="Hold"
          hint="h"
          open={open.hold}
          onToggle={() => toggle("hold")}
          status={
            <Token tone={held ? "blocking" : "cleared"}>{held ? "Held" : "Released"}</Token>
          }
        >
          <HoldGovernance
            hold={exception.hold}
            pending={state.pending}
            error={actionError("release_hold")}
            onRelease={state.releaseHold}
          />
        </Section>
      ) : null}

      {exception.tolerance ? (
        <Section
          id="tolerance"
          title="Tolerance"
          hint="t"
          open={open.tolerance}
          onToggle={() => toggle("tolerance")}
          status={
            <span className="num font-mono text-2xs text-ink-faint">
              {exception.tolerance.from}
            </span>
          }
        >
          <ToleranceConsole
            tolerance={exception.tolerance}
            affectedHoldIds={state.affectedHoldIds}
            pending={state.pending}
            error={actionError("change_tolerance")}
            onChange={state.changeTolerance}
          />
        </Section>
      ) : null}

      <Section
        id="audit"
        title="Audit"
        hint="a"
        open={open.audit}
        onToggle={() => toggle("audit")}
        status={
          <span className="num font-mono text-2xs text-ink-faint">
            {exception.timeline.length}
          </span>
        }
      >
        <AuditStream events={exception.timeline} />
      </Section>

      <div className="flex-1 border-t border-line" />
    </div>
  );
}
