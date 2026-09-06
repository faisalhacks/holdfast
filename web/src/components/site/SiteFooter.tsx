import Link from "next/link";
import { HoldfastLogo } from "./HoldfastLogo";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[84rem] flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <HoldfastLogo className="w-[112px]" />
          <p className="mt-4 text-sm text-graphite-2">
            Accounts-payable reconciliation and exception review.
          </p>
        </div>

        <div className="text-sm text-graphite-3">
          <p className="text-graphite-2">Syndicate by Maximor</p>
          <p className="mt-1">Track 2 · Autonomous Office of the CFO</p>
          <p className="mt-3 max-w-xs">
            Built during the Syndicate hackathon. Holdfast is an independent entry, not a
            Maximor product.
          </p>
        </div>

        <nav aria-label="Product" className="flex gap-6 text-sm md:flex-col md:gap-2 md:text-right">
          <Link
            href="/exceptions"
            className="rounded-sm text-graphite-2 underline-offset-4 hover:text-graphite hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-steel"
          >
            Workstation
          </Link>
          <Link
            href="/overview"
            className="rounded-sm text-graphite-2 underline-offset-4 hover:text-graphite hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-steel"
          >
            Run overview
          </Link>
        </nav>
      </div>
    </footer>
  );
}
