import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

/**
 * The public surface. Light, editorial, and deliberately less dense than the
 * workstation it introduces.
 *
 * The page opens and closes on the workstation's canvas, so the shell carries
 * that surface and the light sections paint over it. Any area no section
 * covers is the product's own ground rather than a stray band of paper.
 *
 * `site-root` is what the document watches for in `globals.css`: the overscroll
 * colour belongs to the document, which a page cannot style.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-root min-h-dvh bg-canvas text-graphite antialiased">
      {/*
        Parked above the viewport rather than hidden with `sr-only`: it is always
        in the tab order and slides into view when it takes focus. See the
        `.skip-link` rules in globals.css.
      */}
      <a href="#main" className="skip-link rounded-sm bg-focus px-3 py-2 text-sm font-medium text-canvas">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
