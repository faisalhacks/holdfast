import type { ReactNode } from "react";
import type { ApplicationStatus, ConflictSeverity, HoldType } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  APPLICATION_STATUS_LABELS,
  HOLD_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/labels";

export function Badge({
  children,
  className,
  dot,
}: {
  children: ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap",
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 rounded-full", dot)} /> : null}
      {children}
    </span>
  );
}

/** The backend's three conflict severities. There is no fourth. */
const SEVERITY_STYLES: Record<ConflictSeverity, string> = {
  blocking: "border-critical/40 bg-critical/10 text-critical",
  material: "border-high/40 bg-high/10 text-high",
  advisory: "border-low/35 bg-low/10 text-low",
};

export function SeverityBadge({ severity }: { severity: ConflictSeverity }) {
  return <Badge className={SEVERITY_STYLES[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}

/**
 * A typed hold. The four AR application states below are a different axis and are never
 * collapsed into this one.
 */
export function HoldTypeBadge({ type }: { type: HoldType }) {
  return (
    <Badge className="border-line-strong bg-surface-2 text-ink-muted">
      {HOLD_TYPE_LABELS[type]}
    </Badge>
  );
}

const APPLICATION_STYLES: Record<ApplicationStatus, { className: string; dot: string }> = {
  applied: {
    className: "border-positive/35 bg-positive/10 text-positive",
    dot: "bg-positive",
  },
  unapplied: { className: "border-line-strong bg-surface-2 text-ink", dot: "bg-brand" },
  on_account: {
    className: "border-brand/40 bg-brand-wash text-brand-ink",
    dot: "bg-brand",
  },
  unidentified: {
    className: "border-caution/35 bg-caution/10 text-caution",
    dot: "bg-caution",
  },
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const style = APPLICATION_STYLES[status];
  return (
    <Badge className={style.className} dot={style.dot}>
      {APPLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Whether the document may be paid. Derived from the backend's own `payable` field. */
export function PayableBadge({ payable }: { payable: boolean }) {
  return payable ? (
    <Badge className="border-positive/35 bg-positive/10 text-positive" dot="bg-positive">
      Payable
    </Badge>
  ) : (
    <Badge className="border-caution/35 bg-caution/10 text-caution" dot="bg-caution">
      Held
    </Badge>
  );
}

/** Whether a hold currently blocks the accounting entry, not just the payment. */
export function AccountingBadge({ blocks }: { blocks: boolean }) {
  if (!blocks) return null;
  return (
    <Badge className="border-critical/40 bg-critical/10 text-critical">
      Blocks accounting
    </Badge>
  );
}

/** Whether a compared field fell inside the tolerance that was applied to it. */
export function ToleranceBadge({ within }: { within: boolean }) {
  return within ? (
    <Badge className="border-positive/35 bg-positive/10 text-positive">
      Within tolerance
    </Badge>
  ) : (
    <Badge className="border-negative/35 bg-negative/10 text-negative">
      Outside tolerance
    </Badge>
  );
}
