import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The header of a region in the centre pane.
 *
 * Regions are separated by hairlines rather than by gaps and rounded cards: a
 * card grid puts air between things a reviewer is trying to read together.
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
        "flex h-8 items-center justify-between gap-3 border-b border-line bg-surface px-3",
        className,
      )}
    >
      <h2 className="label-section truncate">{title}</h2>
      <div className="flex shrink-0 items-center gap-2">
        {count !== undefined && count !== null ? (
          <span className="num text-xs text-ink-faint">{count}</span>
        ) : null}
        {action}
      </div>
    </header>
  );
}
