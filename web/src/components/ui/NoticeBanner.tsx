import type { AdapterNotice } from "@/lib/api";
import { cn } from "@/lib/cn";

const TONES: Record<AdapterNotice["level"], string> = {
  demo: "border-material/30 bg-material/8",
  info: "border-focus/30 bg-focus-wash",
  warning: "border-advisory/30 bg-advisory/8",
};

const LABELS: Record<AdapterNotice["level"], string> = {
  demo: "border-material/40 text-material",
  info: "border-focus/40 text-focus-ink",
  warning: "border-advisory/40 text-advisory",
};

const PREFIXES: Record<AdapterNotice["level"], string> = {
  demo: "Demo behaviour",
  info: "Note",
  warning: "Warning",
};

/**
 * Renders an adapter-originated notice verbatim. The mock adapter uses this to
 * state plainly that a write never left the browser.
 */
export function NoticeBanner({
  notice,
  onDismiss,
  className,
}: {
  notice: AdapterNotice;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 rounded-sm border px-3 py-2.5",
        TONES[notice.level],
        className,
      )}
    >
      <p className="min-w-0 text-sm text-ink-muted">
        <span
          className={cn(
            "mr-2 inline-block rounded-xs border px-1.5 py-px align-[1px] text-2xs font-semibold",
            LABELS[notice.level],
          )}
        >
          {PREFIXES[notice.level]}
        </span>
        {notice.message}
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-xs text-ink-faint transition-colors hover:text-ink"
          aria-label="Dismiss notice"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
