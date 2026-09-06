"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A single reveal on first scroll into view. Eight pixels and an opacity fade,
 * once, and never again.
 *
 * Anyone who has asked their system not to animate gets the finished state
 * immediately: the check runs before the observer is attached, so no motion is
 * ever scheduled rather than being started and cancelled.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // A callback ref, so one component can be a div, a section, or an li
      // without the element types having to agree.
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out",
        shown ? "translate-y-0 opacity-100" : "motion-safe:translate-y-2 motion-safe:opacity-0",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
