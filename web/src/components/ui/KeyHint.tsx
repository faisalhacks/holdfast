import { cn } from "@/lib/cn";

/**
 * A key cap. Shown where a shortcut exists, so it can be learned in passing —
 * and only from the large breakpoint up, since a hint for a key the reader has
 * no way to press is just noise.
 */
export function KeyHint({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "hidden h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong lg:inline-flex",
        "bg-surface-2 px-1.5 font-mono text-2xs text-ink-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
