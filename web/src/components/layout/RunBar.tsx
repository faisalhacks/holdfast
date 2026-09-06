import { api } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * Run scope and the active data source. The run figures are not repeated here:
 * the queue pane carries them beside the backlog they describe, and stating the
 * same total twice on one screen teaches a reviewer to stop reading it.
 */
export function RunBar() {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-line-strong bg-surface px-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="label-section">Run</span>
        <span className="truncate font-mono text-sm text-ink">{config.currentRunId}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className="rounded-sm border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-2xs tracking-wider text-ink-muted uppercase"
          title={api.info.description}
        >
          {api.info.label}
        </span>
      </div>
    </header>
  );
}
