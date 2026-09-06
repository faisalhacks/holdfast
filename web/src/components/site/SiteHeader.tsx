"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { HoldfastLogo } from "./HoldfastLogo";

const SECTIONS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#why", label: "Why Holdfast" },
] as const;

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
        "sticky top-0 z-50 border-b bg-paper/85 backdrop-blur-[2px] transition-[height,border-color] duration-200",
        compact ? "h-14 border-rule" : "h-20 border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-[84rem] items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-steel"
          aria-label="Holdfast — home"
        >
          <HoldfastLogo
            priority
            className={cn("transition-[width] duration-200", compact ? "w-[104px]" : "w-[124px]")}
          />
        </Link>

        <nav aria-label="Sections" className="ml-auto hidden items-center gap-7 md:flex">
          {SECTIONS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-sm text-sm text-graphite-2 underline-offset-4 transition-colors hover:text-graphite hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-steel"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 md:ml-0">
          <Link
            href="/overview"
            className="hidden rounded-sm text-sm text-graphite-2 underline-offset-4 transition-colors hover:text-graphite hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-steel sm:inline"
          >
            Run overview
          </Link>
          <Link
            href="/exceptions"
            className="inline-flex h-9 items-center rounded-sm bg-graphite px-4 text-sm font-medium text-paper transition-colors hover:bg-steel-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Open workstation
          </Link>
        </div>
      </div>
    </header>
  );
}
