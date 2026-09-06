"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  hint: string;
  ready: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Overview", hint: "Fleet health", ready: false },
  { href: "/exceptions", label: "Exception queue", hint: "Human review", ready: true },
  { href: "/runs", label: "Run replay", hint: "Step-by-step", ready: false },
  { href: "/audit", label: "Audit log", hint: "Decision trail", ready: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <>
    <nav
      aria-label="Primary"
      className="hidden h-full w-56 shrink-0 flex-col border-r border-line bg-surface md:flex"
    >
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded bg-brand text-[11px] font-bold text-canvas"
        >
          S
        </span>
        <span className="text-sm font-semibold tracking-wide">Syndicate</span>
      </div>

      <ul className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 transition-colors",
                  active
                    ? "bg-surface-3 text-ink"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm">{item.label}</span>
                  {!item.ready ? (
                    <span className="rounded border border-line-strong px-1 text-[10px] text-ink-faint uppercase">
                      soon
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-faint">
                  {item.hint}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-4 py-3 text-[11px] text-ink-faint">
        Foundation build · v0.1.0
      </div>
    </nav>
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-line bg-surface/95 backdrop-blur md:hidden"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-center text-[10px] transition-colors",
              active ? "bg-surface-3 text-brand-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", active ? "bg-brand" : "bg-line-strong")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
}
