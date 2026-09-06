import type { EvidenceItem, EvidenceKind } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { Token, type Tone } from "@/components/ui/Token";

const KIND_TONE: Record<EvidenceKind, Tone> = {
  document: "neutral",
  extract: "neutral",
  system_record: "neutral",
  external_check: "neutral",
};

/**
 * The records the exception was assembled from. Diagnostic context, so it sits
 * under the ledger rather than beside the controls.
 */
export function EvidenceReferences({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="px-3 py-4 text-sm text-ink-faint">No evidence captured.</p>;
  }

  return (
    <ul className="divide-y divide-line/70">
      {items.map((item) => (
        <li key={item.id} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base text-ink">{item.label}</span>
            <Token tone={KIND_TONE[item.kind]}>{titleCase(item.kind)}</Token>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{item.summary}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-ink-faint">
            <span className="break-all">{item.sourceRef}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span>captured {formatDateTime(item.capturedAt)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
