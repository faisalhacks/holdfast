import type { EvidenceItem, ExceptionDetail } from "@/lib/api";
import { formatDateTime, titleCase } from "@/lib/format";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Token } from "@/components/ui/Token";

/**
 * The records behind the case: the policy that raised it, and the source
 * documents it was assembled from.
 *
 * One surface with two sections rather than two panels. Both answer "where did
 * this come from", both are read after the comparison rather than during it,
 * and a reviewer scrolling past them should meet one thing, not a stack.
 */
export function CaseContext({ exception }: { exception: ExceptionDetail }) {
  const { policy, evidence } = exception;
  if (!policy && evidence.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title="Supporting record"
        count={evidence.length > 0 ? `${evidence.length} reference${evidence.length === 1 ? "" : "s"}` : undefined}
      />

      {policy ? (
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="label-field">Policy</span>
            <span className="font-mono text-xs text-ink-faint">{policy.id}</span>
          </div>
          <p className="mt-2 font-medium text-ink">{policy.name}</p>
          <p className="mt-1 text-base text-ink-muted">{policy.clause}</p>
        </div>
      ) : null}

      <EvidenceList items={evidence} />
    </Panel>
  );
}

function EvidenceList({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-4 text-sm text-ink-faint sm:px-5">No evidence captured.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="px-4 py-4 sm:px-5">
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
