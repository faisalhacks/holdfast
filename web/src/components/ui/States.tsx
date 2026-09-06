import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-3", className)} />;
}

export function LoadingRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 p-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full opacity-60" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-14 text-center", className)}>
      <p className="text-md font-medium text-ink">{title}</p>
      {description ? <p className="max-w-sm text-base text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Could not load this view",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-md font-medium text-blocking">{title}</p>
      <p className="max-w-md text-base text-ink-muted">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * A read that failed, stated in the space the value would have occupied.
 *
 * `ErrorState` owns a whole panel; this is for the small slots — a KPI cell, a
 * ledger strip — where the alternative is a skeleton that never resolves. A
 * skeleton is a promise that data is coming. When the read has already failed,
 * that promise is a lie, and a reviewer left staring at it will assume the run
 * is simply quiet.
 */
export function InlineError({
  label = "Could not load",
  message,
  className,
}: {
  label?: string;
  message: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("space-y-1", className)}>
      <p className="text-sm font-medium text-blocking">{label}</p>
      <p className="text-xs text-ink-muted">{message}</p>
    </div>
  );
}
