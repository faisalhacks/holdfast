import type { EvidenceItem, EvidenceKind } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";

const KIND_STYLES: Record<EvidenceKind, string> = {
  document: "border-line-strong bg-surface-2 text-ink-muted",
  extract: "border-brand/30 bg-brand-wash text-brand-ink",
  system_record: "border-line-strong bg-surface-2 text-ink-muted",
  external_check: "border-low/30 bg-low/10 text-low",
};

export function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-6 text-sm text-ink-faint">No evidence captured.</p>;
  }

  return (
    <ul className="divide-y divide-line/60">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{item.label}</span>
            <Badge className={KIND_STYLES[item.kind]}>{titleCase(item.kind)}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{item.summary}</p>
          <dl className="mt-2 grid gap-2 rounded-md border border-line/70 bg-surface-2/50 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <dt className="text-[10px] tracking-wide text-ink-faint uppercase">Source reference</dt>
              <dd className="mt-0.5 truncate font-mono text-[11px] text-ink-muted" title={item.sourceRef}>{item.sourceRef}</dd>
            </div>
            <div>
              <dt className="text-[10px] tracking-wide text-ink-faint uppercase">Captured</dt>
              <dd className="mt-0.5 font-mono text-[11px] text-ink-muted">{formatDateTime(item.capturedAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
