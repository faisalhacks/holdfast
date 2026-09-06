import type { AdapterNotice } from "@/lib/api";
import { cn } from "@/lib/cn";

const TONES: Record<AdapterNotice["level"], string> = {
  demo: "border-material/35 bg-material/10 text-material",
  info: "border-focus/40 bg-focus-wash text-focus-ink",
  warning: "border-advisory/35 bg-advisory/10 text-advisory",
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
        "flex items-start justify-between gap-3 rounded-sm border px-2.5 py-1.5 text-sm",
        TONES[notice.level],
        className,
      )}
    >
      <p className="min-w-0">
        <span className="font-mono text-2xs font-semibold tracking-wider uppercase">
          {PREFIXES[notice.level]}
        </span>
        <span className="mx-1.5 opacity-40">·</span>
        <span className="text-ink-muted">{notice.message}</span>
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
