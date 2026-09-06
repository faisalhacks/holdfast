import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "focus" | "blocking" | "material" | "advisory" | "cleared";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong text-ink-muted",
  focus: "border-focus/40 bg-focus-wash text-focus-ink",
  blocking: "border-blocking/35 bg-blocking/10 text-blocking",
  material: "border-material/35 bg-material/10 text-material",
  advisory: "border-advisory/35 bg-advisory/10 text-advisory",
  cleared: "border-cleared/35 bg-cleared/10 text-cleared",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  focus: "bg-focus",
  blocking: "bg-blocking",
  material: "bg-material",
  advisory: "bg-advisory",
  cleared: "bg-cleared",
};

/**
 * An uppercase monospace chip. Deliberately not a filled pill: four competing
 * pill families is what made the previous build read as a generic dashboard.
 */
export function Token({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-px",
        "font-mono text-2xs font-medium tracking-wider uppercase whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StateDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "neutral" ? "bg-transparent ring-1 ring-ink-faint" : DOTS[tone],
        className,
      )}
    />
  );
}
