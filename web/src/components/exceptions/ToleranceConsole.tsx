"use client";

import { useState } from "react";
import type { ChangeToleranceInput, ToleranceContext } from "@/lib/api";
import type { PendingAction } from "@/hooks/useExceptionDetail";
import { Button } from "@/components/ui/Button";
import { BlockedReason, TextAreaField } from "@/components/ui/Fields";

/**
 * A tolerance change, recorded as a decision.
 *
 * There is no pre-flight simulation here. The API cannot say what a proposed
 * threshold would release until the change is made, and a projected figure the
 * backend never computed would be the one number in this console that is not
 * true. What it can say is `affected_hold_ids`, rendered afterwards and
 * verbatim, including when that list comes back empty.
 */
export function ToleranceConsole({
  tolerance,
  affectedHoldIds,
  pending,
  error,
  onChange,
}: {
  tolerance: ToleranceContext;
  affectedHoldIds: string[] | null;
  pending: PendingAction;
  error: string | null;
  onChange: (input: ChangeToleranceInput) => Promise<boolean>;
}) {
  const [next, setNext] = useState(String(tolerance.to));
  const [reason, setReason] = useState("");

  const parsed = Number.parseInt(next, 10);
  const trimmed = reason.trim();
  const validValue = Number.isInteger(parsed);
  const valid = validValue && trimmed.length > 0;
  const busy = pending !== null;

  return (
    <div className="space-y-2.5 px-3 py-2.5">
      <div>
        <p className="label-section">Scope</p>
        <p className="mt-0.5 font-mono text-2xs break-all text-ink-muted">{tolerance.scope}</p>
      </div>

      <form
        className="space-y-2.5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          const ok = await onChange({
            from: tolerance.from,
            to: parsed,
            scope: tolerance.scope,
            reason: trimmed,
          });
          if (ok) setReason("");
        }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
          <label className="block">
            <span className="label-section">Current</span>
            <input
              readOnly
              value={tolerance.from}
              className="num mt-1 h-7 w-full rounded-sm border border-line bg-surface-2 px-2 font-mono text-base text-ink-faint"
            />
          </label>
          <span aria-hidden className="pb-1.5 text-ink-faint">
            &rarr;
          </span>
          <label className="block">
            <span className="label-section">New</span>
            <input
              required
              type="number"
              step="1"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className="num mt-1 h-7 w-full rounded-sm border border-line-strong bg-surface-2 px-2 font-mono text-base text-ink focus:border-focus focus:outline-none"
            />
          </label>
        </div>

        <TextAreaField
          label="Change reason"
          required
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />

        <p className="text-sm text-ink-muted">
          A tolerance change is recorded as a decision: who changed it, from what to what, over
          which scope, why, and which holds it affected.
        </p>

        {error ? (
          <p role="alert" className="text-xs text-blocking">
            {error}
          </p>
        ) : null}

        {!valid ? (
          <BlockedReason>
            {validValue ? "A change reason is required." : "The new value must be a whole number."}
          </BlockedReason>
        ) : null}

        <Button
          type="submit"
          variant="outline"
          className="w-full"
          loading={pending === "change_tolerance"}
          disabled={!valid || busy}
        >
          Change tolerance
        </Button>
      </form>

      {affectedHoldIds ? (
        <div className="border-t border-line pt-2.5">
          <p className="label-section">Affected holds &middot; {affectedHoldIds.length}</p>
          {affectedHoldIds.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {affectedHoldIds.map((id) => (
                <li key={id} className="font-mono text-2xs text-ink-muted">
                  {id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-sm text-ink-faint">
              No holds affected. The backend returned an empty list.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
