import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";

/**
 * Deliberate placeholder for surfaces that are scoped but not yet built. It
 * states what the page will do rather than pretending to be a real screen.
 */
export function PagePlaceholder({
  title,
  intent,
  planned,
}: {
  title: string;
  intent: string;
  planned: string[];
}) {
  return (
    <Card className="mx-6 mb-6">
      <CardBody className="space-y-4 py-8">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-widest text-ink-faint uppercase">
            Not built yet
          </p>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="max-w-2xl text-sm text-ink-muted">{intent}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
            Planned for this surface
          </p>
          <ul className="space-y-1.5">
            {planned.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-ink-muted">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-line-strong" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-line pt-4 text-sm text-ink-faint">
          The reviewed work is in the{" "}
          <Link href="/exceptions" className="text-brand-ink underline underline-offset-2">
            exception queue
          </Link>
          .
        </p>
      </CardBody>
    </Card>
  );
}
