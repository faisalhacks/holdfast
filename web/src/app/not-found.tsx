import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-widest text-ink-faint uppercase">404</p>
      <h1 className="text-lg font-semibold text-ink">This page does not exist</h1>
      <Link
        href="/exceptions"
        className="text-sm text-brand-ink underline underline-offset-2"
      >
        Go to the exception queue
      </Link>
    </div>
  );
}
