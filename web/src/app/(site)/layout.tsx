import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * The public surface. Light, editorial, and deliberately less dense than the
 * workstation it introduces.
 *
 * `site-root` is what the document watches for: the scrollbar and the
 * overscroll colour belong to the document, which a page cannot style, so the
 * shell announces which surface is mounted and `globals.css` follows.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-root min-h-dvh bg-paper text-graphite antialiased">
      {/*
        Parked above the viewport rather than hidden with `sr-only`: it is always
        in the tab order and slides into view when it takes focus. See the
        `.skip-link` rules in globals.css.
      */}
      <a href="#main" className="skip-link rounded-sm bg-graphite px-3 py-2 text-sm text-paper">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
