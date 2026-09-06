"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Overview", glyph: "▤" },
  { href: "/exceptions", label: "Exception queue", glyph: "▦" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A 48px rail. Every destination here is backed by a frozen API route — there
 * are no roadmap entries, because a workstation that advertises three screens
 * it cannot open is not a workstation.
 */
export function NavRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line-strong bg-surface py-2"
    >
      <span
        aria-hidden
        className="mb-1 grid size-7 place-items-center rounded-sm border border-line-strong font-mono text-sm font-bold text-ink"
        title="Holdfast"
      >
        H
      </span>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={cn(
              "grid size-8 place-items-center rounded-sm text-md transition-colors",
              active
                ? "bg-surface-3 text-focus-ink"
                : "text-ink-faint hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span aria-hidden>{item.glyph}</span>
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
