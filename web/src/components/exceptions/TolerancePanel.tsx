"use client";

import { useMemo, useState } from "react";
import type {
  CaseDossier,
  ChangeToleranceInput,
  EvidenceRow,
  OwnerRole,
  Tolerance,
  ToleranceScope,
} from "@/lib/api";
import { OWNER_ROLES } from "@/lib/api";
import { formatDateTime, formatMoney, formatTolerance } from "@/lib/format";
import {
  HOLD_TYPE_LABELS,
  OWNER_ROLE_LABELS,
  TOLERANCE_DIRECTION_LABELS,
} from "@/lib/labels";
import { Button } from "@/components/ui/Button";

const FIELD =
  "mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-ink focus:border-brand focus:outline-none";

const MIN_REASON = 8;

/** Turns a tolerance into the single number its kind is measured in, for the form. */
function magnitude(tolerance: Tolerance): number {
  switch (tolerance.kind) {
    case "exact":
      return 0;
    case "absolute_paise":
      return tolerance.value.safe ?? 0;
    default:
      return tolerance.value;
  }
}

function rebuild(from: Tolerance, value: number): Tolerance {
  switch (from.kind) {
    case "exact":
      return { kind: "exact" };
    case "absolute_paise":
      return {
        kind: "absolute_paise",
        value: { digits: BigInt(Math.trunc(value)).toString(), safe: Math.trunc(value) },
      };
    default:
      return { kind: from.kind, value };
  }
}

const UNIT: Record<Tolerance["kind"], string> = {
  exact: "no value",
  absolute_paise: "integer paise",
  percentage: "ratio, 0 to 1",
  days: "whole days",
  similarity: "ratio, 0 to 1",
};

/**
 * Records a tolerance change.
 *
 * The starting values are not invented: `from` is the tolerance the backend actually
 * applied to a compared field on the top candidate, and the scope defaults to the hold type
 * the case is held under. A change may be recorded WITHOUT releasing anything, which is
 * always permitted; asking it to release the holds it governs is destructive and takes the
 * same preview-then-approve path a hold release does.
 */
export function TolerancePanel({
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
  onSubmit: (input: ChangeToleranceInput) => Promise<boolean>;
}) {
  const evidence = dossier.candidates[0]?.evidence ?? [];
  const breached = useMemo(
    () => evidence.filter((row) => !row.within_tolerance),
    [evidence],
  );
  const choices: readonly EvidenceRow[] = breached.length > 0 ? breached : evidence;

  const [fieldName, setFieldName] = useState(choices[0]?.field ?? "");
  const selected = choices.find((row) => row.field === fieldName) ?? choices[0] ?? null;
  const from: Tolerance = selected?.tolerance ?? { kind: "exact" };

  const holdTypes = dossier.openHolds.map((hold) => hold.type);
  const [scopeKind, setScopeKind] = useState<"hold_type" | "vendor" | "invoice">(
    holdTypes.length > 0 ? "hold_type" : "invoice",
  );
  const [scopeHoldType, setScopeHoldType] = useState(holdTypes[0] ?? "matching");

  const [value, setValue] = useState(String(magnitude(from)));
  const [reason, setReason] = useState("");
  const [role, setRole] = useState<OwnerRole>("controller");
  const [release, setRelease] = useState(false);

  const parsed = Number(value);
  const validNumber =
    from.kind === "exact" ||
    (Number.isFinite(parsed) &&
      (from.kind === "absolute_paise" || from.kind === "days"
        ? Number.isInteger(parsed)
        : parsed >= 0 && parsed <= 1));
  const valid = selected !== null && validNumber && reason.trim().length >= MIN_REASON;

  const scope: ToleranceScope =
    scopeKind === "hold_type"
      ? { kind: "hold_type", hold_type: scopeHoldType }
      : scopeKind === "vendor"
        ? { kind: "vendor", vendor_id: dossier.vendor.id }
        : { kind: "invoice", invoice_id: dossier.invoice_id };

  return (
    <div className="space-y-3 px-4 py-4">
      {dossier.tolerance_changes.length > 0 ? (
        <ul className="space-y-2 border-b border-line pb-3">
          {dossier.tolerance_changes.map((change) => (
            <li key={change.id} className="border-l-2 border-brand pl-3">
              <p className="text-sm text-ink">
                {TOLERANCE_DIRECTION_LABELS[change.direction]} ·{" "}
                {change.scope_description}
              </p>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {formatTolerance(change.from)} → {formatTolerance(change.to)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{change.reason}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-faint">
                {change.reviewer} · {formatDateTime(change.timestamp)} ·{" "}
                {change.affected_hold_ids.length} hold
                {change.affected_hold_ids.length === 1 ? "" : "s"} released
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {selected === null ? (
        <p className="text-sm text-ink-muted">
          The top candidate carries no compared field, so there is no tolerance to change
          from here.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid) return;
            const ok = await onSubmit({
              from,
              to: rebuild(from, parsed),
              scope,
              reviewer,
              reason: reason.trim(),
              case_id: dossier.case_id,
              owner_next: { role, party: null },
              release_affected_holds: release,
            });
            if (ok) setReason("");
          }}
        >
          <label className="block text-xs text-ink-muted">
            Tolerance to change
            <select
              value={fieldName}
              onChange={(event) => {
                const next = event.target.value;
                setFieldName(next);
                const row = choices.find((candidate) => candidate.field === next);
                if (row) setValue(String(magnitude(row.tolerance)));
              }}
              className={FIELD}
            >
              {choices.map((row) => (
                <option key={row.field} value={row.field}>
                  {row.path} · {formatTolerance(row.tolerance)}
                  {row.within_tolerance ? "" : " (breached)"}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-ink-muted">
              Current
              <input
                readOnly
                value={formatTolerance(from)}
                className="mt-1.5 h-9 w-full rounded-md border border-line bg-surface-2 px-2.5 font-mono text-sm text-ink-faint"
              />
            </label>
            <label className="text-xs text-ink-muted">
              New value
              <input
                required
                type="number"
                step={from.kind === "percentage" || from.kind === "similarity" ? "0.01" : "1"}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={from.kind === "exact"}
                className="mt-1.5 h-9 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 font-mono text-sm text-ink focus:border-brand focus:outline-none disabled:opacity-50"
              />
              <span className="mt-1 block text-[11px] text-ink-faint">{UNIT[from.kind]}</span>
            </label>
          </div>

          {from.kind === "absolute_paise" && Number.isInteger(parsed) ? (
            <p className="font-mono text-[11px] text-ink-faint">
              {formatTolerance(from)} →{" "}
              {formatMoney({ digits: BigInt(parsed).toString(), safe: parsed })}
            </p>
          ) : null}

          <label className="block text-xs text-ink-muted">
            Scope
            <select
              value={scopeKind}
              onChange={(event) =>
                setScopeKind(event.target.value as "hold_type" | "vendor" | "invoice")
              }
              className={FIELD}
            >
              {holdTypes.length > 0 ? <option value="hold_type">A hold type</option> : null}
              <option value="vendor">This vendor</option>
              <option value="invoice">This invoice only</option>
            </select>
          </label>

          {scopeKind === "hold_type" ? (
            <label className="block text-xs text-ink-muted">
              Hold type
              <select
                value={scopeHoldType}
                onChange={(event) =>
                  setScopeHoldType(event.target.value as typeof scopeHoldType)
                }
                className={FIELD}
              >
                {holdTypes.map((type) => (
                  <option key={type} value={type}>
                    {HOLD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="block text-xs text-ink-muted">
            Owner role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as OwnerRole)}
              className={FIELD}
            >
              {OWNER_ROLES.map((value_) => (
                <option key={value_} value={value_}>
                  {OWNER_ROLE_LABELS[value_]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-ink-muted">
            Change reason
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex items-start gap-2.5 rounded-md border border-caution/30 bg-caution/8 px-3 py-2">
            <input
              type="checkbox"
              checked={release}
              onChange={(event) => setRelease(event.target.checked)}
              className="mt-0.5"
            />
            <span className="text-xs text-ink-muted">
              Also release the holds this change governs.
              <span className="mt-1 block text-[11px] text-ink-faint">
                Destructive. The backend will describe exactly which holds and how much money
                before anything is released, and {reviewer} must approve it.
              </span>
            </span>
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
            {release ? "Review tolerance change and release" : "Record tolerance change"}
          </Button>
        </form>
      )}
    </div>
  );
}
