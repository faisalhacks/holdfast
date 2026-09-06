"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import type { ExceptionSummary } from "@/lib/api";
import { cn } from "@/lib/cn";
import { describeSla, formatMoney, formatRelative } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";

const TH =
  "px-3 py-2 text-left text-[11px] font-medium tracking-wide text-ink-faint uppercase";
const TD = "px-3 py-3 align-top";

export function ExceptionTable({ items }: { items: ExceptionSummary[] }) {
  const router = useRouter();

  function navigate(item: ExceptionSummary) {
    router.push(`/exceptions/${item.id}`);
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>, item: ExceptionSummary) {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    navigate(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, item: ExceptionSummary) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate(item);
  }

  return (
    <>
    <ul className="divide-y divide-line md:hidden">
      {items.map((item) => {
        const sla = describeSla(item.slaDueAt);
        return (
          <li key={item.id}>
            <Link
              href={`/exceptions/${item.id}`}
              className="block border-l-2 border-transparent px-4 py-4 transition-colors hover:border-brand hover:bg-surface-2/60 focus-visible:border-brand focus-visible:bg-surface-2/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-ink-faint">{item.reference}</p>
                  <p className="mt-1 text-sm font-medium leading-snug text-ink">{item.title}</p>
                </div>
                <SeverityBadge severity={item.severity} />
              </div>
              <p className="mt-1.5 truncate text-xs text-ink-faint">{item.entity.label}</p>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line/70 pt-3">
                <div><p className="text-[10px] uppercase text-ink-faint">Status</p><div className="mt-1"><StatusBadge status={item.status} /></div></div>
<div><p className="text-[10px] uppercase text-ink-faint">Money at risk</p><p className="mt-1 font-mono text-xs tabular-nums text-ink">{formatMoney(item.exposure_paise, item.currency)}</p></div>
                <div><p className="text-[10px] uppercase text-ink-faint">SLA</p><p className={cn("mt-1 text-xs", sla.breached ? "text-critical" : sla.urgent ? "text-high" : "text-ink-muted")}>{sla.label}</p></div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-line bg-surface-2/60">
          <tr>
            <th scope="col" className={TH}>
              Exception
            </th>
            <th scope="col" className={TH}>
              Severity
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
            <th scope="col" className={TH}>
              Agent
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Exposure
            </th>
            <th scope="col" className={TH}>
              SLA
            </th>
            <th scope="col" className={TH}>
              Assignee
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sla = describeSla(item.slaDueAt);
            return (
              <tr
                key={item.id}
                tabIndex={0}
                role="link"
                aria-label={`Open ${item.reference}: ${item.title}`}
                onClick={(event) => handleClick(event, item)}
                onKeyDown={(event) => handleKeyDown(event, item)}
                className="cursor-pointer border-b border-line/70 transition-colors last:border-b-0 hover:bg-surface-2/50 focus-visible:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                <td className={cn(TD, "max-w-md")}>
                  <div className="group block">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-faint">
                        {item.reference}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-medium text-ink group-hover:text-brand-ink group-focus-visible:text-brand-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-faint">
                      {item.entity.label}
                    </span>
                  </div>
                </td>
                <td className={TD}>
                  <SeverityBadge severity={item.severity} />
                </td>
                <td className={TD}>
                  <StatusBadge status={item.status} />
                </td>
                <td className={TD}>
                  <span className="block font-mono text-xs text-ink">{item.agent}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-faint">
                    {item.workflow}
                  </span>
                </td>
                <td className={cn(TD, "text-right font-mono text-xs tabular-nums")}>
                  {formatMoney(item.exposure_paise, item.currency)}
                </td>
                <td className={TD}>
                  <span
                    className={cn(
                      "block text-xs",
                      sla.breached
                        ? "text-critical"
                        : sla.urgent
                          ? "text-high"
                          : "text-ink-muted",
                    )}
                  >
                    {sla.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-faint">
                    raised {formatRelative(item.raisedAt)}
                  </span>
                </td>
                <td className={cn(TD, "text-xs text-ink-muted")}>
                  {item.assignee ?? <span className="text-ink-faint">Unassigned</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
