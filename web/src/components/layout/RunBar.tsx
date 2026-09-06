import Link from "next/link";
import { config } from "@/lib/config";
import { DemoModeChip } from "./DemoModeBanner";
import { HoldfastLogo } from "@/components/site/HoldfastLogo";

/**
 * Run scope and the active data source.
 *
 * The run figures are not repeated here: the queue pane and the Overview carry
 * them beside the backlog they describe, and stating the same total twice on
 * one screen teaches a reviewer to stop reading it.
 */
export function RunBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-strong bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        {/* Below lg the sidebar has no room for the wordmark, so it lives here. */}
        <Link href="/" className="shrink-0 rounded-xs lg:hidden">
          <HoldfastLogo className="w-[96px]" priority />
          <span className="sr-only">Holdfast home</span>
        </Link>
        {/* Below sm the id truncates to nothing, and a label with no value is
            worse than no label. The case header carries the run anyway. */}
        <p className="hidden min-w-0 items-baseline gap-2 sm:flex">
          <span className="label-field">Run</span>
          <span className="truncate font-mono text-sm text-ink">{config.currentRunId}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DemoModeChip />
      </div>
    </header>
  );
}
