import type { EvidenceRow, Money } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatDays,
  formatMoney,
  formatMoneyDelta,
  formatPercent,
  formatTolerance,
} from "@/lib/format";
import { EVIDENCE_FIELD_LABELS } from "@/lib/labels";
import { ToleranceBadge } from "@/components/ui/Badge";
import { ScoreBar } from "@/components/ui/ScoreBar";

function isMoney(value: string | Money | null): value is Money {
  return typeof value === "object" && value !== null && "digits" in value;
}

function side(value: string | Money | null): string {
  if (value === null) return "not present";
  if (isMoney(value)) return formatMoney(value);
  return value;
}

/**
 * The delta, in the field's own units.
 *
 * The backend types these separately — a ratio for vendor and reference, signed paise for
 * amount, signed whole days for date — and the mapper preserved that, so nothing here
 * guesses from a label what a number means.
 */
function delta(row: EvidenceRow): string {
  if (row.deltaKind === "paise") return formatMoneyDelta(row.deltaMoney);
  if (row.deltaKind === "days") return formatDays(row.deltaDays ?? 0);
  return formatPercent(row.deltaRatio ?? 0, 1);
}

/** Only similarity ratios are a normalised [0,1] quantity a bar can honestly draw. */
function similarity(row: EvidenceRow): number | null {
  return row.deltaKind === "similarity" ? row.deltaRatio : null;
}

export function EvidenceTable({ rows }: { rows: readonly EvidenceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-faint">
        The top candidate carries no field evidence.
      </p>
    );
  }

  const breach = rows.find((row) => !row.within_tolerance);

  return (
    <div>
      {breach ? (
        <div className="grid gap-3 border-b border-negative/25 bg-negative/6 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="text-[10px] font-medium tracking-wider text-negative uppercase">
              Outside tolerance
            </p>
            <p className="mt-1 text-sm text-ink">{EVIDENCE_FIELD_LABELS[breach.field]}</p>
            <p className="mt-0.5 font-mono text-[10px] text-ink-faint">{breach.path}</p>
          </div>
          <div>
            <p className="text-[10px] text-ink-faint uppercase">Delta</p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-negative">
              {delta(breach)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-ink-faint uppercase">Tolerance applied</p>
            <p className="mt-0.5 font-mono text-sm text-ink">
              {formatTolerance(breach.tolerance)}
            </p>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-line/60 sm:hidden">
        {rows.map((row) => {
          const ratio = similarity(row);
          return (
            <li
              key={row.field}
              className={cn("px-4 py-3", !row.within_tolerance && "bg-negative/4")}
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm text-ink">{EVIDENCE_FIELD_LABELS[row.field]}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-faint">{row.path}</p>
                </div>
                <ToleranceBadge within={row.within_tolerance} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] text-ink-faint uppercase">Invoice</dt>
                  <dd className="mt-1 text-sm text-ink">{side(row.invoiceValue)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-ink-faint uppercase">Payment</dt>
                  <dd
                    className={cn(
                      "mt-1 text-sm",
                      row.paymentValue === null ? "text-caution" : "text-ink-muted",
                    )}
                  >
                    {side(row.paymentValue)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 font-mono text-xs text-ink-muted">
                Δ {delta(row)} · tolerance {formatTolerance(row.tolerance)}
              </p>
              {ratio !== null ? (
                <div className="mt-2">
                  <ScoreBar
                    value={ratio}
                    label={`${EVIDENCE_FIELD_LABELS[row.field]} token-set similarity`}
                  />
                  <p className="mt-1 text-[10px] text-ink-faint">
                    Token-set similarity, computed by the matcher
                  </p>
                </div>
              ) : null}
              {row.normalisation ? (
                <p className="mt-2 rounded border border-line px-2 py-1 text-[11px] text-ink-muted">
                  Normalised on the {row.normalisation.side} side by{" "}
                  <span className="font-mono">{row.normalisation.rule}</span>:{" "}
                  <span className="font-mono">{row.normalisation.raw_value}</span> →{" "}
                  <span className="font-mono">{row.normalisation.normalised_value}</span>
                </p>
              ) : null}
              {row.displaced ? (
                <p className="mt-2 text-[11px] text-caution">
                  Reference token found in the wrong field
                  {row.displaced_from ? ` (${row.displaced_from})` : ""}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-faint uppercase">
                Field / path
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-faint uppercase">
                Invoice
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-faint uppercase">
                Payment
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-faint uppercase">
                Delta / tolerance
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-medium text-ink-faint uppercase">
                State
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ratio = similarity(row);
              return (
                <tr
                  key={row.field}
                  className={cn(
                    "border-b border-line/60 last:border-b-0",
                    !row.within_tolerance && "bg-negative/4",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="block text-ink">{EVIDENCE_FIELD_LABELS[row.field]}</span>
                    <span className="font-mono text-[11px] text-ink-faint">{row.path}</span>
                    {row.normalisation ? (
                      <span className="mt-1 block text-[11px] text-ink-muted">
                        normalised by{" "}
                        <span className="font-mono">{row.normalisation.rule}</span>
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{side(row.invoiceValue)}</td>
                  <td
                    className={cn(
                      "px-4 py-2.5",
                      row.paymentValue === null ? "text-caution" : "text-ink-muted",
                    )}
                  >
                    {side(row.paymentValue)}
                    {ratio !== null ? (
                      <div className="mt-1.5 max-w-36">
                        <ScoreBar
                          value={ratio}
                          label={`${EVIDENCE_FIELD_LABELS[row.field]} token-set similarity`}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    <span className="block text-ink">{delta(row)}</span>
                    <span className="block text-ink-faint">
                      {formatTolerance(row.tolerance)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <ToleranceBadge within={row.within_tolerance} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
