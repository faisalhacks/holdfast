"use client";

import { useState } from "react";
import type { CaseDossier, OwnerRole, RecordDecisionInput, ResolutionPath } from "@/lib/api";
import { OWNER_ROLES, RESOLUTION_PATHS } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  HOLD_TYPE_LABELS,
  OWNER_ROLE_LABELS,
  RESOLUTION_PATH_LABELS,
} from "@/lib/labels";
import { Badge, SeverityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const FIELD =
  "mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-ink focus:border-brand focus:outline-none";

const MIN_REASON = 8;

/**
 * Releases holds on the case.
 *
 * There is no hold-release route in the backend: a release is a DECISION with
 * `action: "release_hold"` naming the hold ids, recorded on the case. It is destructive, so
 * submitting here does not release anything — the backend answers 428 with a preview and
 * the console renders that as a confirmation the reviewer must approve.
 */
export function HoldPanel({
  dossier,
  reviewer,
  pending,
  error,
  onRelease,
}: {
  dossier: CaseDossier;
  reviewer: string;
  pending: boolean;
  error: string | null;
  onRelease: (input: RecordDecisionInput) => Promise<boolean>;
}) {
  const suggestion = dossier.suggested_next;
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [reason, setReason] = useState("");
  const [resolutionPath, setPath] = useState<ResolutionPath>(
    suggestion?.resolution_path ?? "internal_correction",
  );
  const [role, setRole] = useState<OwnerRole>(suggestion?.owner_role ?? "ap_manager");

  const released = dossier.holds.filter((hold) => !hold.is_open);
  const valid = selected.length > 0 && reason.trim().length >= MIN_REASON;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-3 px-4 py-4">
      {released.length > 0 ? (
        <ul className="space-y-2 border-b border-line pb-3">
          {released.map((hold) => (
            <li key={hold.id} className="border-l-2 border-positive pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span>
                <Badge className="border-positive/35 bg-positive/10 text-positive">
                  Released
                </Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{hold.release_reason}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                {hold.released_by ?? "system"} ·{" "}
                {hold.released_at ? formatDateTime(hold.released_at) : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {dossier.openHolds.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hold is in force on this document. It is payable in the system that pays it.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid) return;
            const ok = await onRelease({
              action: "release_hold",
              reviewer,
              reason: reason.trim(),
              resolution_path: resolutionPath,
              owner_next: { role, party: null },
              hold_ids: selected,
            });
            if (ok) {
              setReason("");
              setSelected([]);
            }
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-xs text-ink-muted">Holds to release</legend>
            {dossier.openHolds.map((hold) => (
              <label
                key={hold.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(hold.id)}
                  onChange={() => toggle(hold.id)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink">{HOLD_TYPE_LABELS[hold.type]}</span>
                    <SeverityBadge severity={hold.severity} />
                    {!hold.auto_releasable ? (
                      <Badge className="border-caution/35 bg-caution/10 text-caution">
                        Will not lift on its own
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs text-ink-muted">{hold.reason}</span>
                  {hold.release_requires ? (
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      {hold.release_requires}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>

          <label className="block text-xs text-ink-muted">
            Resolution path
            <select
              value={resolutionPath}
              onChange={(event) => setPath(event.target.value as ResolutionPath)}
              className={FIELD}
            >
              {RESOLUTION_PATHS.map((path) => (
                <option key={path} value={path}>
                  {RESOLUTION_PATH_LABELS[path]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-ink-muted">
            Owner role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as OwnerRole)}
              className={FIELD}
            >
              {OWNER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {OWNER_ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-ink-muted">
            Release reason
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          {error ? (
            <p role="alert" className="text-xs text-negative">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="outline"
            className="w-full"
            loading={pending}
            disabled={!valid || pending}
          >
            Review release ({selected.length})
          </Button>
          <p className="text-[11px] text-ink-faint">
            This does not release anything yet. The backend answers with a preview of what
            would change, and {reviewer} confirms it.
          </p>
        </form>
      )}
    </div>
  );
}
