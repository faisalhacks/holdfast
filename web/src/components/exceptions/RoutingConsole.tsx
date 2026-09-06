"use client";

import { useState } from "react";
import type { ExceptionDetail, ResolutionPath, RoutingDecisionInput } from "@/lib/api";
import type { PendingAction } from "@/hooks/useExceptionDetail";
import { formatDateTime } from "@/lib/format";
import { RESOLUTION_PATH_HINTS, RESOLUTION_PATH_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField, TextField } from "@/components/ui/Fields";

const PATHS = Object.keys(RESOLUTION_PATH_LABELS) as ResolutionPath[];

export function RoutingConsole({
  exception,
  pending,
  error,
  onRoute,
}: {
  exception: ExceptionDetail;
  pending: PendingAction;
  error: string | null;
  onRoute: (input: RoutingDecisionInput) => Promise<boolean>;
}) {
  const [path, setPath] = useState<ResolutionPath>("internal_correction");
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");

  // A routed case is terminal: the API rejects a second decision, so the form
  // is replaced by the record rather than left there to fail.
  if (exception.routingDecision) {
    const decision = exception.routingDecision;
    return (
      <div className="border-l-2 border-cleared px-3 py-2.5">
        <p className="label-section">Action routed</p>
        <p className="mt-1 text-base font-medium text-cleared">
          {RESOLUTION_PATH_LABELS[decision.resolution_path]}
        </p>
        <dl className="mt-2 space-y-1.5">
          <div>
            <dt className="label-section">Next owner</dt>
            <dd className="font-mono text-base text-ink">{decision.owner_next}</dd>
          </div>
          <div>
            <dt className="label-section">Reason</dt>
            <dd className="text-sm text-ink-muted">{decision.reason}</dd>
          </div>
        </dl>
        <p className="mt-2 font-mono text-2xs text-ink-faint">{formatDateTime(decision.routedAt)}</p>
      </div>
    );
  }

  const trimmedOwner = owner.trim();
  const trimmedReason = reason.trim();
  const valid = Boolean(trimmedOwner && trimmedReason);
  const busy = pending !== null;

  return (
    <form
      className="space-y-2.5 px-3 py-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid) return;
        const ok = await onRoute({
          resolution_path: path,
          owner_next: trimmedOwner,
          reason: trimmedReason,
        });
        if (ok) {
          setOwner("");
          setReason("");
        }
      }}
    >
      <p className="text-sm text-ink-muted">
        Choosing who acts next. This does not determine whether the match is correct.
      </p>

      <fieldset className="space-y-1">
        <legend className="label-section">Resolution path</legend>
        {PATHS.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer gap-2 rounded-sm px-1.5 py-1 hover:bg-surface-2"
          >
            <input
              type="radio"
              name="resolution_path"
              value={value}
              checked={path === value}
              onChange={() => setPath(value)}
              className="mt-1 accent-[var(--color-focus)]"
            />
            <span className="min-w-0">
              <span className="block text-base text-ink">{RESOLUTION_PATH_LABELS[value]}</span>
              <span className="block text-xs text-ink-faint">{RESOLUTION_PATH_HINTS[value]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* The contract types `owner_next` as a string. A role menu here would post
          values the backend never described, so this stays free text. */}
      <TextField
        label="Next owner"
        required
        value={owner}
        onChange={(event) => setOwner(event.target.value)}
        placeholder="Team or operator"
      />

      <TextAreaField
        label="Reason"
        required
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="What the next owner needs to know"
        hint="Recorded with your name and the time."
      />

      {error ? (
        <p role="alert" className="text-xs text-blocking">
          {error}
        </p>
      ) : null}

      {!valid ? <BlockedReason>Next owner and reason are required.</BlockedReason> : null}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={pending === "route"}
        disabled={!valid || busy}
      >
        Route action
      </Button>
    </form>
  );
}
