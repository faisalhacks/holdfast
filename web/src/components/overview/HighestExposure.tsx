import Link from "next/link";
import type { QueueCase } from "@/lib/api";
import { formatAge, formatMoney } from "@/lib/format";
import { HOLD_TYPE_LABELS } from "@/lib/labels";
import { SeverityBadge } from "@/components/ui/Badge";

export function HighestExposure({ items }: { items: readonly QueueCase[] }) {
  if (items.length === 0) return <p className="px-4 py-6 text-sm text-ink-faint sm:px-5">The API returned no exception cases for this run.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[38rem] border-collapse text-base"><thead><tr className="border-b border-line bg-surface-2"><th className="label-field px-4 py-2.5 text-right sm:px-5">Money at risk</th><th className="label-field px-4 py-2.5 text-left">Invoice</th><th className="label-field px-4 py-2.5 text-left">Primary hold</th><th className="label-field px-4 py-2.5 text-left">Severity</th><th className="label-field px-4 py-2.5 text-right sm:px-5">Age</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.case_id} className="border-b border-line last:border-b-0 hover:bg-surface-2"><td className="num px-4 py-3 text-right font-semibold whitespace-nowrap text-ink sm:px-5">{formatMoney(item.money_at_risk)}</td><td className="px-4 py-3"><Link href={`/exceptions/${item.case_id}`} className="font-mono text-sm text-ink hover:text-focus-ink hover:underline">{item.invoice_id}</Link><span className="mt-0.5 block font-mono text-xs text-ink-faint">{item.case_id}</span></td><td className="px-4 py-3 text-ink-muted">{item.openHolds[0] ? HOLD_TYPE_LABELS[item.openHolds[0].type] : "No open hold"}</td><td className="px-4 py-3">{item.severity ? <SeverityBadge severity={item.severity} /> : "—"}</td><td className="px-4 py-3 text-right text-sm whitespace-nowrap text-ink-muted sm:px-5">{formatAge(item.age_days)}</td></tr>)}</tbody>
    </table></div>
  );
}
