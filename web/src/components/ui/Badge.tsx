import type { ReactNode } from "react";
import type { ExceptionStatus, Severity, SignalStatus } from "@/lib/api";
import { cn } from "@/lib/cn";
import { SEVERITY_LABELS, SIGNAL_STATUS_LABELS, STATUS_LABELS } from "@/lib/labels";

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
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      ) : null}
      {children}
    </span>
  );
}

const STATUS_STYLES: Record<ExceptionStatus, { className: string; dot: string }> = {
  open: { className: "border-line-strong bg-surface-2 text-ink", dot: "bg-brand" },
  in_review: {
    className: "border-brand/40 bg-brand-wash text-brand-ink",
    dot: "bg-brand",
  },
  routed: {
    className: "border-positive/35 bg-positive/10 text-positive",
    dot: "bg-positive",
  },
};

export function StatusBadge({ status }: { status: ExceptionStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <Badge className={style.className} dot={style.dot}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "border-critical/40 bg-critical/10 text-critical",
  high: "border-high/40 bg-high/10 text-high",
  medium: "border-medium/35 bg-medium/10 text-medium",
  low: "border-low/35 bg-low/10 text-low",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge className={SEVERITY_STYLES[severity]}>{SEVERITY_LABELS[severity]}</Badge>
  );
}

const SIGNAL_STYLES: Record<SignalStatus, string> = {
  pass: "border-positive/35 bg-positive/10 text-positive",
  warn: "border-caution/35 bg-caution/10 text-caution",
  fail: "border-negative/35 bg-negative/10 text-negative",
  unknown: "border-line-strong bg-surface-2 text-ink-muted",
};

export function SignalBadge({ status }: { status: SignalStatus }) {
  return <Badge className={SIGNAL_STYLES[status]}>{SIGNAL_STATUS_LABELS[status]}</Badge>;
}
