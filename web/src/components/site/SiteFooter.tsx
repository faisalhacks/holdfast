import Link from "next/link";
import { HoldfastLogo } from "./HoldfastLogo";

const LINK =
  "rounded-xs text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline";

/**
 * The page ends on the workstation's canvas, the same surface it opened on and
 * the same surface the reader is one click away from entering.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line-strong bg-canvas text-ink">
      <div className="mx-auto flex max-w-[84rem] flex-col gap-6 px-4 py-9 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <HoldfastLogo tone="dark" className="w-[100px]" />
          <p className="mt-3 text-sm text-ink-muted">
            Accounts-payable reconciliation and exception review.
          </p>
        </div>

        <div className="text-sm text-ink-faint">
          <p className="text-ink-muted">Syndicate by Maximor</p>
          <p className="mt-0.5">Track 2 · Autonomous Office of the CFO</p>
          <p className="mt-2 max-w-xs">
            Built during the Syndicate hackathon. Holdfast is an independent entry, not a
            Maximor product.
          </p>
        </div>

        <nav aria-label="Product" className="flex gap-5 md:flex-col md:gap-1.5 md:text-right">
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
