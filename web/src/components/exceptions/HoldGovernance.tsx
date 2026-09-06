"use client";

import { useState } from "react";
import type { Hold } from "@/lib/api";
import type { PendingAction } from "@/hooks/useExceptionDetail";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField } from "@/components/ui/Fields";

/**
 * Hold state and its release.
 *
 * Everything shown is a field the frontend contract exposes: amount, reason,
 * id, status. Hold type, auto-release behaviour, and whether accounting is
 * permitted while the hold stands all exist in the engine domain model but not
 * on this API, so they are absent here rather than guessed at.
 */
export function HoldGovernance({
  hold,
  pending,
  error,
  onRelease,
}: {
  hold: Hold;
  pending: PendingAction;
  error: string | null;
  onRelease: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const busy = pending !== null;
  const held = hold.status === "held";

  return (
    <div className="space-y-5 px-4 py-5">
      {/* The section header already carries the held/released token. */}
      <div className="min-w-0">
        <p
          className={
            held
              ? "num text-2xl font-semibold tracking-tight text-blocking"
              : "num text-2xl font-semibold tracking-tight text-ink-muted"
          }
        >
          {formatMoney(hold.amount_paise, hold.currency)}
        </p>
        <p className="mt-1.5 text-base text-ink-muted">{hold.reason}</p>
        <p className="mt-1.5 font-mono text-xs text-ink-faint">{hold.id}</p>
      </div>

      {held ? (
        <form
          className="space-y-3.5 border-t border-line pt-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!trimmed) return;
            if (await onRelease(trimmed)) setReason("");
          }}
        >
          <p className="text-base text-ink-muted">
            Releasing records your name, the time, and this reason. It does not pay the invoice.
          </p>
          <TextAreaField
            label="Release reason"
            required
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-blocking">
              {error}
            </p>
          ) : null}
          {!trimmed ? <BlockedReason>A release reason is required.</BlockedReason> : null}
          <Button
            type="submit"
            variant="governed"
            className="w-full"
            loading={pending === "release_hold"}
            disabled={!trimmed || busy}
          >
            Release hold
          </Button>
        </form>
      ) : (
        <div className="border-t border-line pt-4">
          <p className="label-field">Release reason</p>
          <p className="mt-1.5 text-base text-ink-muted">{hold.releaseReason}</p>
          <p className="mt-1.5 font-mono text-xs text-ink-faint">
            {hold.releasedAt ? formatDateTime(hold.releasedAt) : ""}
          </p>
        </div>
      )}
    </div>
  );
}
