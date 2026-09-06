import { api } from "@/lib/api";

/**
 * Always-on reminder that the console is wired to a mock adapter. It reads
 * `api.info` rather than checking the environment directly, so it disappears on
 * its own once a non-mock adapter is selected.
 */
export function DemoModeBanner() {
  if (!api.info.isMock) return null;

  return (
    <div className="flex h-6 shrink-0 items-center gap-2 border-b border-material/25 bg-material/10 px-3 text-xs text-material">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-material" />
      <p className="truncate">
        <span className="font-mono text-2xs font-semibold tracking-wider uppercase">Demo data</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span className="text-ink-muted">
          {api.info.description} Routing, hold release, and tolerance changes are simulated.
        </span>
      </p>
    </div>
  );
}
