import { api } from "@/lib/api";

export function TopBar() {
  const { info } = api;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 sm:px-6">
      <div className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="font-mono uppercase tracking-widest">Operations console</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="rounded-full border border-line-strong bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted"
          title={info.description}
        >
          <span className="hidden sm:inline">Data source: </span><span className="text-ink">{info.label}</span>
        </span>
      </div>
    </header>
  );
}
