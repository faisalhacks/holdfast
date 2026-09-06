import Link from "next/link";
import { HoldfastLogo } from "./HoldfastLogo";

const LINK =
  "rounded-xs text-base text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/**
 * The page ends on the workstation's own canvas — the same cool grey ground
 * the product's panels sit on, and the surface the reader is one click from
 * entering.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line-strong bg-canvas text-ink">
      <div className="mx-auto flex max-w-[84rem] flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <HoldfastLogo className="w-[100px]" />
          <p className="mt-3 text-base text-ink-muted">
            Accounts-payable reconciliation and exception review.
          </p>
        </div>

        <div className="text-base text-ink-faint">
          <p className="text-ink-muted">Syndicate by Maximor</p>
          <p className="mt-0.5">Track 2 · Autonomous Office of the CFO</p>
          <p className="mt-2.5 max-w-xs text-sm">
            Built during the Syndicate hackathon. Holdfast is an independent entry, not a
            Maximor product.
          </p>
        </div>

        <nav aria-label="Product" className="flex gap-5 md:flex-col md:gap-2 md:text-right">
          <Link href="/exceptions" className={LINK}>
            Workstation
          </Link>
          <Link href="/overview" className={LINK}>
            Run overview
          </Link>
        </nav>
      </div>
    </footer>
  );
}
