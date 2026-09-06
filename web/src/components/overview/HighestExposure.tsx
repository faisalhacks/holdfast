import Link from "next/link";
import type { ExceptionSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatMoney } from "@/lib/format";
import { SeverityToken } from "@/components/ui/Badge";

/**
 * The cases carrying the most money, in the order the API returned them.
 *
 * The adapter sorts by exposure descending; this table does not re-sort, so
 * what a reviewer sees here is the same ordering the queue works in.
 */
export function HighestExposure({ items }: { items: ExceptionSummary[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-ink-faint sm:px-5">
        The API returned no exceptions for this run.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-base">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th scope="col" className="label-field px-4 py-2.5 text-right sm:px-5">
              Amount
            </th>
            <th scope="col" className="label-field px-4 py-2.5 text-left">
              Reference
            </th>
            <th scope="col" className="label-field px-4 py-2.5 text-left">
              Exception
            </th>
            <th scope="col" className="label-field px-4 py-2.5 text-left">
              Severity
            </th>
            <th scope="col" className="label-field px-4 py-2.5 text-right sm:px-5">
              Time left
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sla = describeSla(item.slaDueAt);
            const hasExposure = item.exposure_paise !== null;
            return (
              <tr
                key={item.id}
                className="border-b border-line last:border-b-0 hover:bg-surface-2"
              >
                <td
                  className={cn(
                    "num px-4 py-3 text-right font-semibold whitespace-nowrap sm:px-5",
                    hasExposure ? "text-ink" : "text-ink-faint",
                  )}
                >
                  {formatMoney(item.exposure_paise, item.currency)}
                </td>
                <td className="px-4 py-3 font-mono text-sm whitespace-nowrap text-ink-muted">
                  {item.reference}
                </td>
                <td className="max-w-0 px-4 py-3">
                  <Link
                    href={`/exceptions/${item.id}`}
                    className="block truncate text-ink hover:text-focus-ink hover:underline"
                  >
                    {item.title}
                  </Link>
                  {item.entity.label !== item.reference ? (
                    <span className="mt-0.5 block truncate text-xs text-ink-faint">
                      {item.entity.label}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <SeverityToken severity={item.severity} />
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right text-sm whitespace-nowrap sm:px-5",
                    sla.breached
                      ? "font-medium text-blocking"
                      : sla.urgent
                        ? "text-material"
                        : "text-ink-muted",
                  )}
                >
                  {sla.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
