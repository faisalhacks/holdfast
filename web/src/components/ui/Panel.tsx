import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A grouped surface: white, hairline-bordered, softly raised.
 *
 * The earlier build separated regions with butted hairlines and no gap, which
 * reads as a terminal. Panels give the reviewer somewhere for the eye to rest
 * between one question and the next.
 */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * The header of a panel or of a region inside one. Sentence-case title left,
 * an optional basis or count and an optional action right.
 */
export function PanelHeader({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2",
        className,
      )}
    >
      <h2 className="truncate text-xs font-semibold text-ink-muted">{title}</h2>
      <div className="flex shrink-0 items-center gap-3">
        {count !== undefined && count !== null ? (
          <span className="num text-xs text-ink-faint">{count}</span>
        ) : null}
        {action}
      </div>
    </header>
  );
}

/** Standard body padding for panel content that is not a table or a list. */
export function PanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

/**
 * The basis line under a derived panel.
 *
 * Anything counted over a fetched page rather than read from the run summary
 * says so, in the panel, every time. A derived figure that does not state its
 * denominator is a figure a reviewer cannot check.
 */
export function PanelBasis({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-line px-4 py-2 text-xs text-ink-faint sm:px-5">{children}</p>
  );
}
