"use client";

import { useMemo, useState } from "react";
import { OWNER_ROLES, type CaseDossier, type ChangeToleranceInput, type EvidenceRow, type HoldType, type OwnerRole, type Tolerance, type ToleranceScope } from "@/lib/api";
import type { CaseAction } from "@/hooks/useCaseDossier";
import { formatDateTime, formatTolerance } from "@/lib/format";
import { HOLD_TYPE_LABELS, OWNER_ROLE_LABELS, TOLERANCE_DIRECTION_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField } from "@/components/ui/Fields";

const MIN_REASON = 8;
const MIN_SAFE_PAISE = -9007199254740991n;
const MAX_SAFE_PAISE = 9007199254740991n;
const SELECT = "mt-1.5 h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-focus focus:outline-none";

function initialValue(tolerance: Tolerance): string {
  if (tolerance.kind === "exact") return "";
  if (tolerance.kind === "absolute_paise") return tolerance.value.digits;
  if (tolerance.kind === "percentage" || tolerance.kind === "similarity") return String(Math.round(tolerance.value * 10_000));
  return String(tolerance.value);
}

function rebuild(from: Tolerance, raw: string): Tolerance | null {
  if (from.kind === "exact") return null;
  if (from.kind === "absolute_paise") {
    if (!/^-?\d+$/.test(raw.trim())) return null;
    const exact = BigInt(raw.trim());
    const safe = exact >= MIN_SAFE_PAISE && exact <= MAX_SAFE_PAISE
      ? Number.parseInt(exact.toString(), 10)
      : null;
    return { kind: "absolute_paise", value: { digits: exact.toString(), safe } };
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0) return null;
  if (from.kind === "days") return { kind: "days", value };
  if (value > 10_000) return null;
  return { kind: from.kind, value: value / 10_000 };
}

export function ToleranceConsole({ dossier, reviewer, pending, error, onSubmit }: { dossier: CaseDossier; reviewer: string; pending: CaseAction | null; error: string | null; onSubmit: (input: ChangeToleranceInput) => Promise<boolean> }) {
  const evidence = dossier.candidates[0]?.evidence ?? [];
  const choices: readonly EvidenceRow[] = useMemo(() => { const outside = evidence.filter((row) => !row.within_tolerance); return outside.length > 0 ? outside : evidence; }, [evidence]);
  const [path, setPath] = useState(choices[0]?.path ?? "");
  const selected = choices.find((row) => row.path === path) ?? choices[0] ?? null;
  const from = selected?.tolerance ?? { kind: "exact" as const };
  const [value, setValue] = useState(initialValue(from));
  const holdTypes = dossier.openHolds.map((hold) => hold.type);
  const [scopeKind, setScopeKind] = useState<"hold_type" | "vendor" | "invoice">(holdTypes.length > 0 ? "hold_type" : "invoice");
  const [scopeHoldType, setScopeHoldType] = useState<HoldType>(holdTypes[0] ?? "matching");
  const [role, setRole] = useState<OwnerRole>("controller");
  const [reason, setReason] = useState("");
  const [release, setRelease] = useState(false);
  const to = rebuild(from, value);
  const valid = selected !== null && to !== null && reason.trim().length >= MIN_REASON;
  const busy = pending !== null;
  const scope: ToleranceScope = scopeKind === "hold_type" ? { kind: "hold_type", hold_type: scopeHoldType } : scopeKind === "vendor" ? { kind: "vendor", vendor_id: dossier.vendor.id } : { kind: "invoice", invoice_id: dossier.invoice_id };
  return <div className="space-y-4 px-4 py-5">
    {dossier.tolerance_changes.length > 0 ? <ul className="space-y-2 border-b border-line pb-3">{dossier.tolerance_changes.map((change) => <li key={change.id} className="border-l-2 border-focus pl-3"><p className="text-sm text-ink">{TOLERANCE_DIRECTION_LABELS[change.direction]} · {change.scope_description}</p><p className="mt-1 font-mono text-xs text-ink-muted">{formatTolerance(change.from)} → {formatTolerance(change.to)}</p><p className="mt-1 text-xs text-ink-muted">{change.reason}</p><p className="mt-1 font-mono text-2xs text-ink-faint">{change.reviewer} · {formatDateTime(change.timestamp)} · {change.affected_hold_ids.length} affected holds</p></li>)}</ul> : null}
    {choices.length === 0 ? <p className="text-base text-ink-muted">The top candidate contains no applied tolerance to change.</p> : <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!valid || !to) return; const ok = await onSubmit({ from, to, scope, reviewer, reason: reason.trim(), case_id: dossier.case_id, owner_next: { role, party: null }, release_affected_holds: release }); if (ok) setReason(""); }}>
      <label className="block"><span className="label-field">Compared field</span><select className={SELECT} value={selected?.path ?? ""} onChange={(event) => { const nextPath = event.target.value; const row = choices.find((item) => item.path === nextPath); setPath(nextPath); if (row) setValue(initialValue(row.tolerance)); }}>{choices.map((row) => <option key={row.path} value={row.path}>{row.field} · {row.path}</option>)}</select></label>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2"><label><span className="label-field">Current</span><input readOnly value={formatTolerance(from)} className="num mt-1.5 h-9 w-full rounded-sm border border-line bg-surface-2 px-2.5 text-sm text-ink-faint" /></label><span aria-hidden className="pb-2.5 text-ink-faint">→</span><label><span className="label-field">New {from.kind === "absolute_paise" ? "(paise)" : from.kind === "days" ? "(days)" : "(basis points)"}</span><input required inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} disabled={from.kind === "exact"} className="num mt-1.5 h-9 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-sm text-ink focus:border-focus focus:outline-none disabled:bg-surface-2" /></label></div>
      <label className="block"><span className="label-field">Scope</span><select className={SELECT} value={scopeKind} onChange={(event) => setScopeKind(event.target.value as typeof scopeKind)}><option value="hold_type">Hold type</option><option value="vendor">Vendor</option><option value="invoice">This invoice</option></select></label>
      {scopeKind === "hold_type" ? <label className="block"><span className="label-field">Hold type</span><select className={SELECT} value={scopeHoldType} onChange={(event) => setScopeHoldType(event.target.value as HoldType)}>{[...new Set(holdTypes)].map((type) => <option key={type} value={type}>{HOLD_TYPE_LABELS[type]}</option>)}</select></label> : null}
      <label className="block"><span className="label-field">Next owner</span><select className={SELECT} value={role} onChange={(event) => setRole(event.target.value as OwnerRole)}>{OWNER_ROLES.map((value) => <option key={value} value={value}>{OWNER_ROLE_LABELS[value]}</option>)}</select></label>
      <TextAreaField label="Change reason" required rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      <label className="flex items-start gap-2.5 rounded-sm border border-material/30 bg-material/5 px-3 py-2 text-xs text-ink-muted"><input type="checkbox" className="mt-0.5 accent-[var(--color-focus)]" checked={release} onChange={(event) => setRelease(event.target.checked)} /><span>Release affected holds after recording the change. This requires a backend 428 preview and named human confirmation.</span></label>
      {error ? <p role="alert" className="text-sm text-blocking">{error}</p> : null}{!valid ? <BlockedReason>{from.kind === "exact" ? "An exact tolerance cannot be edited as a number." : `A valid value and reason of at least ${MIN_REASON} characters are required.`}</BlockedReason> : null}
      <Button type="submit" variant="outline" className="w-full" loading={pending === "change_tolerance"} disabled={!valid || busy}>{release ? "Review change and releases" : "Record tolerance change"}</Button>
    </form>}
  </div>;
}
