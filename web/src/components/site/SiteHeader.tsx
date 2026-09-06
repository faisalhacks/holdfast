"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/Button";
import { HoldfastLogo } from "./HoldfastLogo";

const SECTIONS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#why", label: "Why Holdfast" },
] as const;

const NAV_LINK =
  "rounded-xs text-base text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/**
 * The public top bar.
 *
 * The same object as the workstation's `RunBar`: 56px tall, white surface, one
 * hairline on `--color-line-strong`, the real wordmark on the left, and the
 * primary control on the right at the same height and radius. What changes on
 * the way into the product is the contents of this bar, not the kind of bar it
 * is — so it carries section links here and run scope there.
 */
export function SiteHeader() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-line-strong bg-surface text-ink",
        "transition-[height] duration-200",
        compact ? "h-13" : "h-14",
      )}
    >
      <div className="mx-auto flex h-full max-w-[84rem] items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-xs" aria-label="Holdfast — home">
          <HoldfastLogo
            priority
            className={cn("transition-[width] duration-200", compact ? "w-[96px]" : "w-[108px]")}
          />
        </Link>

        <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line-strong sm:block" />

        <span className="label-field hidden shrink-0 sm:block">Exception review</span>

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-6 md:flex">
          {SECTIONS.map((item) => (
            <a key={item.href} href={item.href} className={NAV_LINK}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-6">
          <Link href="/overview" className={cn(NAV_LINK, "hidden sm:inline")}>
            Run overview
          </Link>
          <Link href="/exceptions" className={buttonClass("primary", "md")}>
            Open workstation
          </Link>
        </div>
      </div>
    </header>
  );
}
