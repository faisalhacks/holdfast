import Link from "next/link";
import { HoldfastLogo } from "@/components/site/HoldfastLogo";

/*
 * The root not-found sits outside both shells, so it carries its own — built
 * from the same tokens as everything else.
 */
export default function NotFound() {
  return (
    <div className="site-root flex min-h-dvh flex-col bg-canvas text-ink">
      <div className="mx-auto flex w-full max-w-[84rem] flex-1 flex-col justify-center px-5 py-20 sm:px-8">
        <HoldfastLogo className="w-[112px]" />
        <p className="label-eyebrow mt-10">404</p>
        <h1 className="display mt-4 text-[2rem] font-semibold sm:text-[2.5rem]">
          This address is not part of Holdfast.
        </h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/exceptions"
            className="inline-flex h-11 items-center rounded-sm bg-focus px-5 text-md font-semibold text-white transition-colors hover:bg-focus-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Open workstation
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-sm border border-line-strong bg-surface px-5 text-md text-ink transition-colors hover:border-focus hover:text-focus-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Back to the home page
          </Link>
        </div>
      </div>
    </div>
  );
}
