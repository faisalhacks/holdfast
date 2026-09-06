import type { ReactNode, TextareaHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-sm border border-line-strong bg-surface px-2.5 text-base text-ink " +
  "placeholder:text-ink-faint focus:border-focus focus:outline-none disabled:opacity-45";

export function TextField({
  label,
  hint,
  className,
  ...rest
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label-field">{label}</span>
      <input {...rest} className={cn(CONTROL, "mt-1.5 h-9", className)} />
      {hint ? <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function TextAreaField({
  label,
  hint,
  className,
  ...rest
}: { label: string; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="label-field">{label}</span>
      <textarea {...rest} className={cn(CONTROL, "mt-1.5 resize-y py-2 leading-snug", className)} />
      {hint ? <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

/** A label/value pair. The value carries `.num` so digit columns line up. */
export function Field({
  label,
  children,
  className,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="label-field">{label}</dt>
      <dd className={cn("num mt-1 truncate text-base text-ink", mono && "font-mono text-sm")}>
        {children}
      </dd>
    </div>
  );
}

/**
 * A larger label/value pair, for the metric strip under a case title. The
 * value leads; the label explains it afterwards.
 */
export function Metric({
  label,
  children,
  className,
  tone,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "blocking" | "material";
}) {
  return (
    <div className={cn("min-w-0 px-4 py-3", className)}>
      <dt className="label-field">{label}</dt>
      <dd
        className={cn(
          "num mt-1 min-w-0 text-xl font-semibold",
          tone === "blocking"
            ? "text-blocking"
            : tone === "material"
              ? "text-material"
              : "text-ink",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * Explains why a submit control is unavailable. A dead button with no stated
 * reason is the most common way a governed form wastes a reviewer's time.
 */
export function BlockedReason({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-ink-faint" role="note">
      {children}
    </p>
  );
}
