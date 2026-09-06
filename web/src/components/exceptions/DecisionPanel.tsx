"use client";

import { useState } from "react";
import type {
  CaseDossier,
  OwnerRole,
  RecordDecisionInput,
  ResolutionPath,
} from "@/lib/api";
import { RESOLUTION_PATHS, OWNER_ROLES } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  DECISION_ACTION_LABELS,
  HOLD_TYPE_LABELS,
  OWNER_ROLE_LABELS,
  RESOLUTION_PATH_LABELS,
} from "@/lib/labels";
import { Button } from "@/components/ui/Button";

const FIELD =
  "mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-ink focus:border-brand focus:outline-none";

/** The backend requires a reason of at least eight characters on every decision. */
const MIN_REASON = 8;

/**
 * Records a routing decision, or an escalation.
 *
 * The question is never approve/reject — it is who should act next. `resolution_path` and
 * `owner_next.role` are both backend enumerations, so they are select controls over the
 * real members rather than free text.
 */
export function DecisionPanel({
  dossier,
  reviewer,
  pending,
  error,
  onSubmit,
}: {
  dossier: CaseDossier;
  reviewer: string;
  pending: boolean;
  error: string | null;
  onSubmit: (input: RecordDecisionInput) => Promise<boolean>;
}) {
  const suggestion = dossier.suggested_next;
  const [action, setAction] = useState<"route" | "escalate">("route");
  const [resolutionPath, setPath] = useState<ResolutionPath>(
    suggestion?.resolution_path ?? "internal_correction",
  );
  const [role, setRole] = useState<OwnerRole>(suggestion?.owner_role ?? "ap_clerk");
  const [party, setParty] = useState("");
  const [reason, setReason] = useState("");

  const routed = dossier.decisions.filter(
    (decision) => decision.action === "route" || decision.action === "escalate",
  );
  const valid = reason.trim().length >= MIN_REASON;

  return (
    <div className="space-y-3 px-4 py-4">
      {suggestion ? (
        <div className="rounded-md border border-line bg-surface-2/60 px-3 py-2">
          <p className="text-[10px] tracking-wide text-ink-faint uppercase">
            Policy suggestion
          </p>
          <p className="mt-1 text-sm text-ink">
            {OWNER_ROLE_LABELS[suggestion.owner_role]} ·{" "}
            {RESOLUTION_PATH_LABELS[suggestion.resolution_path]}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {suggestion.because} (from the {HOLD_TYPE_LABELS[suggestion.decided_by_hold_type]}{" "}
            hold).
          </p>
          <p className="mt-1 text-[11px] text-ink-faint">{suggestion.note}</p>
        </div>
      ) : null}

      {routed.length > 0 ? (
        <ul className="space-y-2 border-b border-line pb-3">
          {routed.map((decision) => (
            <li key={decision.id} className="border-l-2 border-positive pl-3">
              <p className="text-sm font-medium text-positive">
                {DECISION_ACTION_LABELS[decision.action]}
                {decision.resolution_path
                  ? ` · ${RESOLUTION_PATH_LABELS[decision.resolution_path]}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{decision.reason}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                {OWNER_ROLE_LABELS[decision.owner_next.role]}
                {decision.owner_next.party ? ` · ${decision.owner_next.party}` : ""} ·{" "}
                {decision.reviewer} · {formatDateTime(decision.timestamp)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          const ok = await onSubmit({
            action,
            reviewer,
            reason: reason.trim(),
            resolution_path: resolutionPath,
            owner_next: { role, party: party.trim() || null },
          });
          if (ok) {
            setReason("");
            setParty("");
          }
        }}
      >
        <p className="rounded-md border border-caution/30 bg-caution/8 px-3 py-2 text-xs text-ink-muted">
          Choose who should act next. This does not decide whether the match is correct, and
          it does not release a hold.
        </p>

        <label className="block text-xs text-ink-muted">
          Action
          <select
            value={action}
            onChange={(event) => setAction(event.target.value as "route" | "escalate")}
            className={FIELD}
          >
            <option value="route">Route</option>
            <option value="escalate">Escalate</option>
          </select>
        </label>

        <label className="block text-xs text-ink-muted">
          Resolution path
          <select
            required
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
            required
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
          Named party (optional)
          <input
            value={party}
            onChange={(event) => setParty(event.target.value)}
            placeholder="An individual or team, where one is known"
            className={FIELD}
          />
        </label>

        <label className="block text-xs text-ink-muted">
          Reason
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this owner, from the evidence"
            className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-ink-faint">
            The backend requires a reason of at least {MIN_REASON} characters, recorded
            against {reviewer}.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-xs text-negative">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={pending} disabled={!valid || pending}>
          Record decision
        </Button>
      </form>
    </div>
  );
}
