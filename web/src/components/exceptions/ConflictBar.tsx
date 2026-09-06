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
          ? "rounded-md border border-blocking/25 bg-blocking/6 px-4 py-3.5 sm:px-5"
          : "rounded-md border border-line-strong bg-surface-2 px-4 py-3.5 sm:px-5"
      }
    >
      <p className="flex items-center gap-2">
        <StateDot tone={held ? "blocking" : "cleared"} />
        <span className="label-field">Conflict summary</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {failing.length > 0 ? (
          <p className="text-base text-ink">
            {failing.length} field{failing.length === 1 ? "" : "s"} outside reference:{" "}
            <span className="text-ink-muted">
              {failing.map((signal) => signal.label).join(", ")}
            </span>
          </p>
        ) : null}

        {missing.length > 0 ? (
          <p className="text-base text-ink-muted">
            {missing.length} without a reference value
          </p>
        ) : null}

        {hold ? (
          <span className="flex items-center gap-2.5">
            <Token tone={held ? "blocking" : "cleared"}>
              {held ? "Payment held" : "Hold released"}
            </Token>
            {held && hold.amount_paise !== null ? (
              <span className="num text-md font-semibold text-blocking">
                {formatMoney(hold.amount_paise, hold.currency)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
