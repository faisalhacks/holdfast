import type { Signal } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeDelta, formatEvidenceValue } from "@/lib/format";
import { SignalToken } from "@/components/ui/Badge";

const ORDER = { fail: 0, warn: 1, unknown: 2, pass: 3 } as const;

const DELTA_TEXT: Record<Signal["status"], string> = {
  fail: "text-blocking",
  warn: "text-material",
  unknown: "text-ink-faint",
  pass: "text-ink-muted",
};

/**
 * The diagnostic focal plane: what the source record says, what it was compared
 * against, and the arithmetic between them.
 *
 * The columns are OBSERVED and REFERENCE because that is what the contract
 * supplies. Naming them "invoice" and "payment" would assert a provenance the
 * API does not carry, and the pairing that produced each row is printed
 * verbatim underneath instead of being inferred.
 */
export function ComparisonLedger({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <p className="px-3 py-6 text-sm text-ink-faint">No field evidence supplied.</p>;
  }

  const ordered = [...signals].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-base">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            <th scope="col" className="label-section px-3 py-1.5 text-left">
              Field
            </th>
            <th scope="col" className="label-section px-3 py-1.5 text-left">
              Observed
            </th>
            <th scope="col" className="label-section px-3 py-1.5 text-left">
              Reference
            </th>
            <th scope="col" className="label-section px-3 py-1.5 text-right">
              Delta
            </th>
            <th scope="col" className="label-section px-3 py-1.5 text-left">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((signal) => {
            const delta = describeDelta(signal.observed, signal.expected);
            const failing = signal.status === "fail";
            return (
              <tr key={signal.id} className="border-b border-line/70 align-top last:border-b-0">
                <td className="py-2 pr-3 pl-3">
                  <span
                    className={cn(
                      "-ml-3 block border-l-2 pl-2.5",
                      failing ? "border-blocking" : "border-transparent",
                    )}
                  >
                    <span className="block text-ink">{signal.label}</span>
                    <span className="mt-0.5 block font-mono text-2xs break-all text-ink-faint">
                      {signal.source}
                    </span>
                  </span>
                </td>
                <td className="num px-3 py-2 font-mono text-ink">
                  {formatEvidenceValue(signal.observed)}
                </td>
                <td
                  className={cn(
                    "num px-3 py-2 font-mono",
                    signal.expected ? "text-ink-muted" : "text-ink-faint italic",
                  )}
                >
                  {formatEvidenceValue(signal.expected)}
                </td>
                <td className="num px-3 py-2 text-right">
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      failing ? "text-md" : "",
                      DELTA_TEXT[signal.status],
                    )}
                  >
                    {delta.label ?? "—"}
                  </span>
                  {delta.detail ? (
                    <span className="mt-0.5 block font-mono text-2xs text-ink-faint">
                      {delta.detail}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <SignalToken status={signal.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
