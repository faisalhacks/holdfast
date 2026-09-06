"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CaseDossier } from "@/lib/api";
import { formatTolerance } from "@/lib/format";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import type { useCaseDossier } from "@/hooks/useCaseDossier";
import { AuditStream } from "./AuditStream";
import { HoldGovernance } from "./HoldGovernance";
import { RoutingConsole } from "./RoutingConsole";
import { ToleranceConsole } from "./ToleranceConsole";
import { KeyHint } from "@/components/ui/KeyHint";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { Token } from "@/components/ui/Token";

type State = ReturnType<typeof useCaseDossier>;
type SectionKey = "hold" | "tolerance" | "audit";

function Section({ id, title, status, open, onToggle, hint, children }: { id: SectionKey; title: string; status?: ReactNode; open: boolean; onToggle: () => void; hint: string; children: ReactNode }) {
  return <section className="border-t border-line"><h3><button type="button" id={`console-section-${id}`} onClick={onToggle} aria-expanded={open} aria-controls={`console-panel-${id}`} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"><span className="flex items-center gap-2"><span aria-hidden className="text-ink-faint">{open ? "▾" : "▸"}</span><span className="text-base font-semibold text-ink">{title}</span></span><span className="flex shrink-0 items-center gap-2">{status}<KeyHint>{hint}</KeyHint></span></button></h3><div id={`console-panel-${id}`} hidden={!open} className="bg-surface-2/50">{children}</div></section>;
}

export function ActionConsole({ dossier, reviewer, state }: { dossier: CaseDossier; reviewer: string; state: State }) {
  const held = dossier.open_hold_count > 0;
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ hold: held, tolerance: false, audit: false });
  useEffect(() => setOpen({ hold: dossier.open_hold_count > 0, tolerance: false, audit: false }), [dossier.case_id, dossier.open_hold_count]);
  const toggle = (key: SectionKey) => setOpen((previous) => ({ ...previous, [key]: !previous[key] }));
  useEffect(() => { function onKey(event: KeyboardEvent) { const map: Record<string, SectionKey | "route"> = { r: "route", h: "hold", t: "tolerance", a: "audit" }; const target = map[event.key]; if (!target || !isBareKey(event) || isTypingTarget(event.target)) return; event.preventDefault(); if (target === "route") document.getElementById("console-route")?.scrollIntoView({ block: "start" }); else { setOpen((previous) => ({ ...previous, [target]: true })); window.requestAnimationFrame(() => document.getElementById(`console-section-${target}`)?.focus()); } } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const firstTolerance = dossier.candidates[0]?.evidence[0]?.tolerance;
  return <div className="flex min-h-full flex-col">
    {state.outcome ? <div className="border-b border-line p-3"><NoticeBanner notice={{ level: state.outcome.level, message: state.outcome.message }} onDismiss={state.dismissOutcome} /></div> : null}
    <section id="console-route"><div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5"><h3 className="text-base font-semibold text-ink">Route next action</h3><KeyHint>r</KeyHint></div><RoutingConsole dossier={dossier} reviewer={reviewer} pending={state.pending} error={state.errorFor("route")} onSubmit={(input) => state.recordDecision("route", input)} /></section>
    <Section id="hold" title="Holds" hint="h" open={open.hold} onToggle={() => toggle("hold")} status={<Token tone={held ? "blocking" : "cleared"}>{held ? `${dossier.open_hold_count} open` : "Released"}</Token>}><HoldGovernance dossier={dossier} reviewer={reviewer} pending={state.pending} error={state.errorFor("release_hold")} onRelease={(input) => state.recordDecision("release_hold", input)} /></Section>
    <Section id="tolerance" title="Tolerance" hint="t" open={open.tolerance} onToggle={() => toggle("tolerance")} status={<span className="num text-xs text-ink-faint">{firstTolerance ? formatTolerance(firstTolerance) : "—"}</span>}><ToleranceConsole key={dossier.case_id} dossier={dossier} reviewer={reviewer} pending={state.pending} error={state.errorFor("change_tolerance")} onSubmit={state.changeTolerance} /></Section>
    <Section id="audit" title="Audit" hint="a" open={open.audit} onToggle={() => toggle("audit")} status={<span className="num text-xs text-ink-faint">{dossier.audit.entries.length}</span>}><AuditStream slice={dossier.audit} /></Section>
    <div className="min-h-6 flex-1 border-t border-line" />
  </div>;
}
