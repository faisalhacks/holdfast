import { api } from "@/lib/api";

/**
 * Always-on reminder that the console is wired to a mock adapter. It reads
 * `api.info` rather than checking the environment directly, so it disappears on
 * its own once a non-mock adapter is selected.
 */
export function DemoModeBanner() {
  if (!api.info.isMock) return null;

  return (
    <div className="flex items-center gap-2 border-b border-demo/30 bg-demo/10 px-4 py-2 text-[11px] text-demo sm:px-6 sm:py-1.5">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-demo"
      />
      <p>
        <span className="font-semibold uppercase tracking-wide">Demo data</span>
        <span className="mx-1.5 opacity-50">·</span>
        <span className="hidden text-ink-muted sm:inline">
          {api.info.description} Routing, hold release, and tolerance changes are simulated.
        </span>
      </p>
    </div>
  );
}
