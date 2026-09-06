import type { EvidenceItem } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { Token } from "@/components/ui/Token";

/**
 * The records the exception was assembled from. Diagnostic context, so it sits
 * under the ledger rather than beside the controls.
 */
export function EvidenceReferences({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-5 text-sm text-ink-faint sm:px-5">No evidence captured.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-medium text-ink">{item.label}</span>
            <Token>{titleCase(item.kind)}</Token>
          </div>
          <p className="mt-1.5 text-base text-ink-muted">{item.summary}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs text-ink-faint">
            <span className="break-all">{item.sourceRef}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span>captured {formatDateTime(item.capturedAt)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
