import type { EvidenceRow, Money } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDays, formatMoney, formatMoneyDelta, formatPercent, formatTolerance } from "@/lib/format";
import { EVIDENCE_FIELD_LABELS } from "@/lib/labels";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { ToleranceBadge } from "@/components/ui/Badge";

function valueLabel(value: string | Money | null): string {
  if (value === null) return "Not supplied";
  return typeof value === "string" ? value : formatMoney(value);
}

function deltaLabel(row: EvidenceRow): string {
  if (row.deltaKind === "paise") return formatMoneyDelta(row.deltaMoney);
  if (row.deltaKind === "days") return row.deltaDays === null ? "—" : formatDays(row.deltaDays);
  return row.deltaRatio === null ? "—" : formatPercent(row.deltaRatio, 1);
}

export function ComparisonLedger({ rows }: { rows: readonly EvidenceRow[] }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-sm text-ink-faint sm:px-5">No field evidence supplied.</p>;
  const ordered = [...rows].sort((a, b) =>
    a.within_tolerance === b.within_tolerance ? 0 : a.within_tolerance ? 1 : -1,
  );
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[38rem] border-collapse text-base">
      <thead><tr className="border-b border-line bg-surface-2"><th className="label-field px-3 py-2.5 text-left">Field</th><th className="label-field px-4 py-2.5 text-left">Invoice</th><th className="label-field px-4 py-2.5 text-left">Payment</th><th className="label-field px-3 py-2.5 text-right">Delta</th><th className="label-field px-3 py-2.5 text-left">Tolerance</th></tr></thead>
      <tbody>{ordered.map((row) => <tr key={row.path} className="border-b border-line last:border-b-0 align-top"><td className="px-3 py-4"><span className="font-medium text-ink">{EVIDENCE_FIELD_LABELS[row.field]}</span><span className="mt-1 block font-mono text-2xs text-ink-faint">{row.path}</span></td><td className={cn("num px-4 py-4", row.within_tolerance ? "text-ink" : "font-semibold text-blocking")}>{valueLabel(row.invoiceValue)}</td><td className="num px-4 py-4 text-ink-muted">{valueLabel(row.paymentValue)}</td><td className={cn("num px-3 py-4 text-right font-semibold", row.within_tolerance ? "text-ink-muted" : "text-blocking")}>{deltaLabel(row)}{row.deltaKind === "similarity" && row.deltaRatio !== null ? <ScoreBar className="mt-2 justify-end" value={row.deltaRatio} label={`${EVIDENCE_FIELD_LABELS[row.field]} similarity`} showValue={false} /> : null}</td><td className="px-3 py-4"><ToleranceBadge within={row.within_tolerance} /><span className="mt-1.5 block text-xs text-ink-faint">{formatTolerance(row.tolerance)}</span>{row.cause ? <span className="mt-1 block font-mono text-2xs text-ink-faint">{row.cause}</span> : null}</td></tr>)}</tbody>
    </table></div>
  );
}
