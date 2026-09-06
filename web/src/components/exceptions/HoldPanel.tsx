"use client";
import { useState } from "react";
import type { Hold } from "@/lib/api";
import type { PendingAction } from "@/hooks/useExceptionDetail";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/Button";
export function HoldPanel({ hold, pending, error, onRelease }: { hold: Hold; pending: PendingAction; error: string | null; onRelease: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("");
  return <div className="space-y-3 px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-lg font-semibold text-high">{formatMoney(hold.amount_paise, hold.currency)}</p><p className="mt-1 text-xs text-ink-muted">{hold.reason}</p></div><span className="rounded-full border border-caution/35 bg-caution/10 px-2 py-0.5 text-[11px] font-medium text-caution">{hold.status === "held" ? "Held" : "Released"}</span></div>{hold.status === "released" ? <div className="border-t border-line pt-3 text-xs text-ink-muted"><p>{hold.releaseReason}</p><p className="mt-1 font-mono text-ink-faint">{hold.releasedAt ? formatDateTime(hold.releasedAt) : ""}</p></div> : <form className="space-y-2 border-t border-line pt-3" onSubmit={async (e) => { e.preventDefault(); if (reason.trim() && await onRelease(reason.trim())) setReason(""); }}><label className="block text-xs text-ink-muted">Release reason<textarea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none" /></label>{error ? <p role="alert" className="text-xs text-negative">{error}</p> : null}<Button type="submit" variant="outline" className="w-full" loading={pending === "release_hold"} disabled={!reason.trim() || pending !== null}>Release hold</Button></form>}</div>;
}
