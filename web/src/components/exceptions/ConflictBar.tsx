import type { ExceptionDetail } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { StateDot, Token } from "@/components/ui/Token";

/**
 * A one-line restatement of what is already on this screen: which fields are
 * failing, whether a hold is in force, and how much it is holding.
 *
 * It is strictly a summary of rendered data. It does not emit structured
 * conflict codes — the frontend contract carries no `Conflict[]`, and inventing
 * ERP-shaped tokens here would put words in the engine's mouth.
 */
export function ConflictBar({ exception }: { exception: ExceptionDetail }) {
  const failing = exception.signals.filter((signal) => signal.status === "fail");
  const missing = exception.signals.filter((signal) => signal.status === "unknown");
  const hold = exception.hold;

  if (failing.length === 0 && missing.length === 0 && !hold) return null;

  const held = hold?.status === "held";

  return (
    <div
      className={
        held
          ? "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-blocking/25 bg-blocking/8 px-3 py-2"
          : "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-surface-2/50 px-3 py-2"
      }
    >
      <span className="flex items-center gap-1.5">
        <StateDot tone={held ? "blocking" : "cleared"} />
        <span className="label-section">Conflict summary</span>
      </span>

      {failing.length > 0 ? (
        <span className="text-base text-ink">
          {failing.length} field{failing.length === 1 ? "" : "s"} outside reference:{" "}
          <span className="text-ink-muted">
            {failing.map((signal) => signal.label).join(", ")}
          </span>
        </span>
      ) : null}

      {missing.length > 0 ? (
        <span className="text-base text-ink-muted">
          {missing.length} without a reference value
        </span>
      ) : null}

      {hold ? (
        <span className="flex items-center gap-2">
          <Token tone={held ? "blocking" : "cleared"}>{held ? "Payment held" : "Hold released"}</Token>
          {held && hold.amount_paise !== null ? (
            <span className="num font-mono text-base font-semibold text-blocking">
              {formatMoney(hold.amount_paise, hold.currency)}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
