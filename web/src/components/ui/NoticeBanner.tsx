import type { AdapterNotice } from "@/lib/api";
import { cn } from "@/lib/cn";

const TONES: Record<AdapterNotice["level"], string> = {
  demo: "border-demo/40 bg-demo/10 text-demo",
  info: "border-brand/40 bg-brand-wash text-brand-ink",
  warning: "border-caution/40 bg-caution/10 text-caution",
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
        "flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs",
        TONES[notice.level],
        className,
      )}
    >
      <p>
        <span className="font-semibold uppercase tracking-wide">
          {PREFIXES[notice.level]}
        </span>
        <span className="mx-1.5 opacity-50">·</span>
        <span className="text-ink-muted">{notice.message}</span>
      </p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-ink-faint transition-colors hover:text-ink"
          aria-label="Dismiss notice"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
