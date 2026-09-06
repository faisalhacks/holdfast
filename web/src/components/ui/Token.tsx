import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "focus" | "blocking" | "material" | "advisory" | "cleared";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-surface text-ink-muted",
  focus: "border-focus/30 bg-focus-wash text-focus-ink",
  blocking: "border-blocking/30 bg-blocking/8 text-blocking",
  material: "border-material/30 bg-material/8 text-material",
  advisory: "border-advisory/30 bg-advisory/8 text-advisory",
  cleared: "border-cleared/30 bg-cleared/8 text-cleared",
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
 * An outlined chip. Deliberately not a filled pill, and deliberately sentence
 * case: four competing pill families in shouting caps is what made the earlier
 * build read as a generic dashboard. A row carries one of these at most.
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
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5",
        "text-xs font-medium whitespace-nowrap",
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
