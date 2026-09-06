"use client";

import { useState } from "react";
import { OWNER_ROLES, RESOLUTION_PATHS, type CaseDossier, type OwnerRole, type RecordDecisionInput, type ResolutionPath } from "@/lib/api";
import type { CaseAction } from "@/hooks/useCaseDossier";
import { formatDateTime } from "@/lib/format";
import { HOLD_TYPE_LABELS, OWNER_ROLE_LABELS, RESOLUTION_PATH_LABELS } from "@/lib/labels";
import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField } from "@/components/ui/Fields";

const MIN_REASON = 8;
const SELECT = "mt-1.5 h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-focus focus:outline-none";

export function HoldGovernance({ dossier, reviewer, pending, error, onRelease }: { dossier: CaseDossier; reviewer: string; pending: CaseAction | null; error: string | null; onRelease: (input: RecordDecisionInput) => Promise<boolean> }) {
  const suggestion = dossier.suggested_next;
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [reason, setReason] = useState("");
  const [path, setPath] = useState<ResolutionPath>(suggestion?.resolution_path ?? "internal_correction");
  const [role, setRole] = useState<OwnerRole>(suggestion?.owner_role ?? "ap_manager");
  const valid = selected.length > 0 && reason.trim().length >= MIN_REASON;
  const busy = pending !== null;
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <div className="space-y-4 px-4 py-5">
    {dossier.holds.some((hold) => !hold.is_open) ? <ul className="space-y-2 border-b border-line pb-3">{dossier.holds.filter((hold) => !hold.is_open).map((hold) => <li key={hold.id} className="border-l-2 border-cleared pl-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span><Badge className="border-cleared/35 bg-cleared/10 text-cleared">Released</Badge></div><p className="mt-1 text-xs text-ink-muted">{hold.release_reason}</p><p className="mt-1 font-mono text-2xs text-ink-faint">{hold.released_by ?? "system"} · {hold.released_at ? formatDateTime(hold.released_at) : ""}</p></li>)}</ul> : null}
    {dossier.openHolds.length === 0 ? <p className="text-base text-ink-muted">No hold is in force on this document.</p> : <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!valid) return; const ok = await onRelease({ action: "release_hold", reviewer, reason: reason.trim(), resolution_path: path, owner_next: { role, party: null }, hold_ids: selected }); if (ok) { setReason(""); setSelected([]); } }}>
      <fieldset className="space-y-2"><legend className="label-field mb-2">Holds to release</legend>{dossier.openHolds.map((hold) => <label key={hold.id} className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-line px-3 py-2"><input type="checkbox" checked={selected.includes(hold.id)} onChange={() => toggle(hold.id)} className="mt-1 accent-[var(--color-focus)]" /><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span><SeverityBadge severity={hold.severity} />{!hold.auto_releasable ? <Badge className="border-material/35 bg-material/10 text-material">Named human required</Badge> : null}</span><span className="mt-1 block text-xs text-ink-muted">{hold.reason}</span>{hold.release_requires ? <span className="mt-1 block text-2xs text-ink-faint">{hold.release_requires}</span> : null}</span></label>)}</fieldset>
      <label className="block"><span className="label-field">Resolution path</span><select className={SELECT} value={path} onChange={(event) => setPath(event.target.value as ResolutionPath)}>{RESOLUTION_PATHS.map((value) => <option key={value} value={value}>{RESOLUTION_PATH_LABELS[value]}</option>)}</select></label>
      <label className="block"><span className="label-field">Owner role</span><select className={SELECT} value={role} onChange={(event) => setRole(event.target.value as OwnerRole)}>{OWNER_ROLES.map((value) => <option key={value} value={value}>{OWNER_ROLE_LABELS[value]}</option>)}</select></label>
      <TextAreaField label="Release reason" required rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      {error ? <p role="alert" className="text-sm text-blocking">{error}</p> : null}{!valid ? <BlockedReason>Select a hold and provide a reason of at least {MIN_REASON} characters.</BlockedReason> : null}
      <Button type="submit" variant="governed" className="w-full" loading={pending === "release_hold"} disabled={!valid || busy}>Review release ({selected.length})</Button><p className="text-2xs text-ink-faint">The backend must return a 428 preview before {reviewer} can confirm. This action pays nothing.</p>
    </form>}
  </div>;
}
