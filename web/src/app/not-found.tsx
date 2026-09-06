import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="label-section">Not found</p>
      <p className="max-w-sm text-base text-ink-muted">
        This address is not part of the workstation.
      </p>
      <Link
        href="/exceptions"
        className="mt-1 text-base text-focus-ink underline underline-offset-2"
      >
        Go to the exception queue
      </Link>
    </div>
  );
}
