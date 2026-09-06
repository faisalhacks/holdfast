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
 *
 * Below `sm` the same rows are stacked as field cards rather than left to
 * scroll sideways: a comparison a reviewer has to drag horizontally is a
 * comparison they will not make.
 */
export function ComparisonLedger({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-faint sm:px-5">No field evidence supplied.</p>;
  }

  const ordered = [...signals].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <>
      {/* Table, from the small breakpoint up. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem] border-collapse text-base">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th scope="col" className="label-field px-4 py-2.5 text-left sm:px-5">
                Field
              </th>
              <th scope="col" className="label-field px-4 py-2.5 text-left">
                Observed
              </th>
              <th scope="col" className="label-field px-4 py-2.5 text-left">
                Reference
              </th>
              <th scope="col" className="label-field px-4 py-2.5 text-right">
                Delta
              </th>
              <th scope="col" className="label-field px-4 py-2.5 text-left sm:px-5">
                State
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((signal) => {
              const delta = describeDelta(signal.observed, signal.expected);
              const failing = signal.status === "fail";
              return (
                <tr
                  key={signal.id}
                  className={cn(
                    "border-b border-line align-top last:border-b-0",
                    failing && "bg-blocking/[0.03]",
                  )}
                >
                  <td className="py-3.5 pr-4 pl-4 sm:pl-5">
                    <span
                      className={cn(
                        "-ml-4 block border-l-[3px] pl-4 sm:-ml-5 sm:pl-5",
                        failing ? "border-blocking" : "border-transparent",
                      )}
                    >
                      <span className="block font-medium text-ink">{signal.label}</span>
                      <span className="mt-1 block font-mono text-2xs break-all text-ink-faint">
                        {signal.source}
                      </span>
                    </span>
                  </td>
                  <td className="num px-4 py-3.5 font-medium text-ink">
                    {formatEvidenceValue(signal.observed)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3.5",
                      signal.expected ? "text-ink-muted" : "text-ink-faint italic",
                    )}
                  >
                    {formatEvidenceValue(signal.expected)}
                  </td>
                  <td className="num px-4 py-3.5 text-right">
                    <span className={cn("font-semibold", DELTA_TEXT[signal.status])}>
                      {delta.label ?? "—"}
                    </span>
                    {delta.detail ? (
                      <span className="mt-1 block text-xs font-normal text-ink-faint">
                        {delta.detail}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <SignalToken status={signal.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stacked field cards, below the small breakpoint. */}
      <ul className="divide-y divide-line sm:hidden">
        {ordered.map((signal) => {
          const delta = describeDelta(signal.observed, signal.expected);
          const failing = signal.status === "fail";
          return (
            <li
              key={signal.id}
              className={cn(
                "border-l-[3px] px-4 py-3.5",
                failing ? "border-blocking bg-blocking/[0.03]" : "border-transparent",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-medium text-ink">{signal.label}</span>
                <SignalToken status={signal.status} />
              </div>
              <dl className="mt-2.5 space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-field">Observed</dt>
                  <dd className="num text-base font-medium text-ink">
                    {formatEvidenceValue(signal.observed)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-field">Reference</dt>
                  <dd
                    className={cn(
                      "num text-base",
                      signal.expected ? "text-ink-muted" : "text-ink-faint italic",
                    )}
                  >
                    {formatEvidenceValue(signal.expected)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="label-field">Delta</dt>
                  <dd className={cn("num text-base font-semibold", DELTA_TEXT[signal.status])}>
                    {delta.label ?? "—"}
                    {delta.detail ? (
                      <span className="ml-2 text-xs font-normal text-ink-faint">
                        {delta.detail}
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 font-mono text-2xs break-all text-ink-faint">{signal.source}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
