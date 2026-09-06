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
  blocking: "border-blocking/40 bg-blocking/10 text-blocking",
  material: "border-material/40 bg-material/10 text-material",
  advisory: "border-advisory/35 bg-advisory/10 text-advisory",
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
    className: "border-cleared/35 bg-cleared/10 text-cleared",
    dot: "bg-cleared",
  },
  unapplied: { className: "border-line-strong bg-surface-2 text-ink", dot: "bg-focus" },
  on_account: {
    className: "border-focus/40 bg-focus-wash text-focus-ink",
    dot: "bg-focus",
  },
  unidentified: {
    className: "border-material/35 bg-material/10 text-material",
    dot: "bg-material",
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
    <Badge className="border-cleared/35 bg-cleared/10 text-cleared" dot="bg-cleared">
      Payable
    </Badge>
  ) : (
    <Badge className="border-material/35 bg-material/10 text-material" dot="bg-material">
      Held
    </Badge>
  );
}

/** Whether a hold currently blocks the accounting entry, not just the payment. */
export function AccountingBadge({ blocks }: { blocks: boolean }) {
  if (!blocks) return null;
  return (
    <Badge className="border-blocking/40 bg-blocking/10 text-blocking">
      Blocks accounting
    </Badge>
  );
}

/** Whether a compared field fell inside the tolerance that was applied to it. */
export function ToleranceBadge({ within }: { within: boolean }) {
  return within ? (
    <Badge className="border-cleared/35 bg-cleared/10 text-cleared">
      Within tolerance
    </Badge>
  ) : (
    <Badge className="border-blocking/35 bg-blocking/10 text-blocking">
      Outside tolerance
    </Badge>
  );
}
