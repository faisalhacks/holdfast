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
  "rounded-xs text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/**
 * The public top bar.
 *
 * Built on the workstation's own surface, with the anatomy of `RunBar`: a
 * hairline base on `--color-line-strong`, a small uppercase label beside a
 * mono value on the left, and a mono uppercase chip on the right. It is not
 * the app rail and carries none of its controls — but it is unmistakably the
 * same bar, so crossing into the product changes the contents of the top of
 * the screen rather than the kind of screen it is.
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
        compact ? "h-12" : "h-14",
      )}
    >
      <div className="mx-auto flex h-full max-w-[84rem] items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-xs" aria-label="Holdfast — home">
          <HoldfastLogo
            priority
            tone="dark"
            className={cn("transition-[width] duration-200", compact ? "w-[92px]" : "w-[108px]")}
          />
        </Link>

        <span aria-hidden className="hidden h-4 w-px shrink-0 bg-line-strong sm:block" />

        <span className="label-section hidden shrink-0 text-ink-faint sm:block">
          Exception review
        </span>

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
