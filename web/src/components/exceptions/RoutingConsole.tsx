"use client";

import { useState } from "react";
import { OWNER_ROLES, RESOLUTION_PATHS, type CaseDossier, type OwnerRole, type RecordDecisionInput, type ResolutionPath } from "@/lib/api";
import type { CaseAction } from "@/hooks/useCaseDossier";
import { formatDateTime } from "@/lib/format";
import { DECISION_ACTION_LABELS, HOLD_TYPE_LABELS, OWNER_ROLE_LABELS, RESOLUTION_PATH_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField, TextField } from "@/components/ui/Fields";

const MIN_REASON = 8;
const SELECT = "mt-1.5 h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-focus focus:outline-none";

export function RoutingConsole({ dossier, reviewer, pending, error, onSubmit }: { dossier: CaseDossier; reviewer: string; pending: CaseAction | null; error: string | null; onSubmit: (input: RecordDecisionInput) => Promise<boolean> }) {
  const suggestion = dossier.suggested_next;
  const [action, setAction] = useState<"route" | "escalate">("route");
  const [path, setPath] = useState<ResolutionPath>(suggestion?.resolution_path ?? "internal_correction");
  const [role, setRole] = useState<OwnerRole>(suggestion?.owner_role ?? "ap_clerk");
  const [party, setParty] = useState("");
  const [reason, setReason] = useState("");
  const recorded = dossier.decisions.filter((decision) => decision.action === "route" || decision.action === "escalate");
  const valid = reason.trim().length >= MIN_REASON;
  const busy = pending !== null;
  return <div className="space-y-4 px-4 py-5">
    {suggestion ? <div className="rounded-sm border border-focus/25 bg-focus-wash px-3 py-2"><p className="label-field">Policy suggestion</p><p className="mt-1 text-base text-ink">{OWNER_ROLE_LABELS[suggestion.owner_role]} · {RESOLUTION_PATH_LABELS[suggestion.resolution_path]}</p><p className="mt-1 text-xs text-ink-muted">{suggestion.because} ({HOLD_TYPE_LABELS[suggestion.decided_by_hold_type]} hold)</p><p className="mt-1 text-2xs text-ink-faint">{suggestion.note}</p></div> : null}
    {recorded.length > 0 ? <ul className="space-y-2 border-b border-line pb-3">{recorded.map((decision) => <li key={decision.id} className="border-l-2 border-cleared pl-3"><p className="text-sm font-medium text-cleared">{DECISION_ACTION_LABELS[decision.action]}{decision.resolution_path ? ` · ${RESOLUTION_PATH_LABELS[decision.resolution_path]}` : ""}</p><p className="mt-1 text-xs text-ink-muted">{decision.reason}</p><p className="mt-1 font-mono text-2xs text-ink-faint">{OWNER_ROLE_LABELS[decision.owner_next.role]}{decision.owner_next.party ? ` · ${decision.owner_next.party}` : ""} · {decision.reviewer} · {formatDateTime(decision.timestamp)}</p></li>)}</ul> : null}
    <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!valid) return; const ok = await onSubmit({ action, reviewer, reason: reason.trim(), resolution_path: path, owner_next: { role, party: party.trim() || null } }); if (ok) { setReason(""); setParty(""); } }}>
      <p className="text-base text-ink-muted">Choose who should act next. This records a routing decision; it does not release a hold.</p>
      <label className="block"><span className="label-field">Action</span><select className={SELECT} value={action} onChange={(event) => setAction(event.target.value as "route" | "escalate")}><option value="route">Route</option><option value="escalate">Escalate</option></select></label>
      <label className="block"><span className="label-field">Resolution path</span><select className={SELECT} value={path} onChange={(event) => setPath(event.target.value as ResolutionPath)}>{RESOLUTION_PATHS.map((value) => <option key={value} value={value}>{RESOLUTION_PATH_LABELS[value]}</option>)}</select></label>
      <label className="block"><span className="label-field">Owner role</span><select className={SELECT} value={role} onChange={(event) => setRole(event.target.value as OwnerRole)}>{OWNER_ROLES.map((value) => <option key={value} value={value}>{OWNER_ROLE_LABELS[value]}</option>)}</select></label>
      <TextField label="Named party (optional)" value={party} onChange={(event) => setParty(event.target.value)} placeholder="Individual or team" />
      <TextAreaField label="Reason" required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} hint={`At least ${MIN_REASON} characters; recorded against ${reviewer}.`} />
      {error ? <p role="alert" className="text-sm text-blocking">{error}</p> : null}{!valid ? <BlockedReason>A reason of at least {MIN_REASON} characters is required.</BlockedReason> : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending === "route"} disabled={!valid || busy}>Record decision</Button>
    </form>
  </div>;
}
