"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { config } from "@/lib/config";
import { useRunSummary } from "@/hooks/useRunSummary";
import { HoldfastLogo } from "@/components/site/HoldfastLogo";

function OverviewGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function QueueGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0" fill="currentColor">
      <rect x="1" y="2" width="14" height="3" rx="1.5" />
      <rect x="1" y="6.5" width="14" height="3" rx="1.5" opacity="0.55" />
      <rect x="1" y="11" width="9" height="3" rx="1.5" opacity="0.55" />
    </svg>
  );
}

const NAV = [
  { href: "/overview", label: "Overview", Glyph: OverviewGlyph },
  { href: "/exceptions", label: "Exceptions", Glyph: QueueGlyph },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The product sidebar.
 *
 * Two destinations, both backed by a frozen API route. There are no roadmap
 * entries and no settings, help, or account block, because a workstation that
 * advertises screens it cannot open is not a workstation.
 *
 * Labels appear from `lg` up. Below that the rail keeps the glyphs and hands
 * the wordmark to the top bar, so the brand is never absent and never doubled.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { summary } = useRunSummary(config.currentRunId);

  return (
    <nav
      aria-label="Primary"
      className="flex w-12 shrink-0 flex-col border-r border-line-strong bg-surface md:w-14 lg:w-52"
    >
      <div className="flex h-14 shrink-0 items-center px-2 lg:px-4">
        <Link
          href="/"
          className="rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <HoldfastLogo className="hidden w-[104px] lg:block" priority />
          <span className="grid size-8 place-items-center rounded-sm border border-line-strong text-md font-bold text-focus lg:hidden">
            <span aria-hidden>H</span>
          </span>
          <span className="sr-only">Holdfast home</span>
        </Link>
      </div>

      <ul className="flex flex-col gap-1 px-2 py-2 lg:px-3">
        {NAV.map(({ href, label, Glyph }) => {
          const active = isActive(pathname, href);
          const count = href === "/exceptions" ? summary?.open : undefined;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-sm px-2 transition-colors lg:px-3",
                  "justify-center lg:justify-start",
                  active
                    ? "bg-focus-wash text-focus-ink"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Glyph />
                <span className="hidden min-w-0 flex-1 truncate text-base lg:block">{label}</span>
                {count !== undefined && count > 0 ? (
                  <span className="num hidden shrink-0 rounded-xs bg-surface-3 px-1.5 py-px text-xs text-ink-muted lg:block">
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
