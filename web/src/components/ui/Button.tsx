import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "outline" | "governed";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  /* A disabled primary must stop looking like the thing to press. */
  primary:
    "bg-focus font-semibold text-canvas hover:bg-focus-ink " +
    "disabled:bg-surface-3 disabled:text-ink-faint disabled:hover:bg-surface-3",
  outline: "border border-line-strong text-ink hover:border-focus hover:text-focus-ink",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  /*
   * Releasing a hold is a governed act, not a destructive one. A filled red
   * button would read as "danger, don't" — the point is that it is allowed,
   * attributable, and recorded.
   */
  governed: "border border-blocking/35 text-blocking hover:border-blocking hover:bg-blocking/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-6 px-2 text-xs",
  md: "h-7 px-3 text-base",
  /* A step of the same object, for the public page where targets are larger. */
  lg: "h-9 px-4 text-lg",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-sm transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-45";

/*
 * Exported so the marketing surface can dress an anchor as the very same
 * control rather than growing a parallel set of buttons. The classes are the
 * classes, not a copy of them.
 */
export const buttonClass = (variant: Variant = "outline", size: Size = "md", className?: string) =>
  cn(BASE, SIZES[size], VARIANTS[variant], className);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-2.5 animate-spin rounded-full border border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
