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
    <div className="space-y-2.5 px-3 py-2.5">
      {/* The section header already carries the held/released token. */}
      <div className="min-w-0">
        <p
          className={
            held
              ? "num font-mono text-xl font-semibold text-blocking"
              : "num font-mono text-xl font-semibold text-ink-muted"
          }
        >
          {formatMoney(hold.amount_paise, hold.currency)}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">{hold.reason}</p>
        <p className="mt-1 font-mono text-2xs text-ink-faint">{hold.id}</p>
      </div>

      {held ? (
        <form
          className="space-y-2 border-t border-line pt-2.5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!trimmed) return;
            if (await onRelease(trimmed)) setReason("");
          }}
        >
          <p className="text-sm text-ink-muted">
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
            <p role="alert" className="text-xs text-blocking">
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
        <div className="border-t border-line pt-2.5">
          <p className="label-section">Release reason</p>
          <p className="mt-0.5 text-sm text-ink-muted">{hold.releaseReason}</p>
          <p className="mt-1 font-mono text-2xs text-ink-faint">
            {hold.releasedAt ? formatDateTime(hold.releasedAt) : ""}
          </p>
        </div>
      )}
    </div>
  );
}
