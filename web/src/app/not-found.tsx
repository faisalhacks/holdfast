import Link from "next/link";
import { HoldfastLogo } from "@/components/site/HoldfastLogo";

/*
 * The root not-found sits outside both shells, so it carries its own. It uses
 * the light surface: an unknown address is more likely a mistyped link than a
 * reviewer who has fallen out of the workstation.
 */
export default function NotFound() {
  return (
    <div className="site-root flex min-h-dvh flex-col bg-paper text-graphite">
      <div className="mx-auto flex w-full max-w-[84rem] flex-1 flex-col justify-center px-5 py-20 sm:px-8">
        <HoldfastLogo className="w-[112px]" />
        <p className="label-eyebrow mt-10">404</p>
        <h1 className="display mt-4 text-[2rem] font-semibold sm:text-[2.5rem]">
          This address is not part of Holdfast.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/exceptions"
            className="inline-flex h-11 items-center rounded-sm bg-graphite px-5 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-steel-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Open workstation
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-sm border border-rule-strong px-5 text-[0.9375rem] text-graphite transition-colors hover:border-graphite-3 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Back to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}
