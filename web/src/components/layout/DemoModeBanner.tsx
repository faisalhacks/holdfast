import { api } from "@/lib/api";

/**
 * Always-on reminder that the console is wired to a mock adapter.
 *
 * It reads `api.info` rather than checking the environment directly, so it
 * disappears on its own once a non-mock adapter is selected. It lives in the
 * top bar as a chip rather than as its own full-width strip: the warning has
 * to be permanent, not large.
 */
export function DemoModeChip() {
  if (!api.info.isMock) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-line-strong bg-surface px-2.5 py-1 text-xs text-ink-muted">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-cleared" />
        {api.info.label}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-sm border border-material/30 bg-material/8 px-2.5 py-1 text-xs text-material"
      title={`${api.info.description} Routing, hold release, and tolerance changes are simulated.`}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-material" />
      Demo data
      <span className="sr-only">
        {api.info.description} Routing, hold release, and tolerance changes are simulated.
      </span>
    </span>
  );
}
