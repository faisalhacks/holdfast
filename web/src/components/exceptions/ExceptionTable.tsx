"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import type { QueueCase } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatAge, formatMoney, formatRelative } from "@/lib/format";
import { HOLD_TYPE_LABELS, OWNER_ROLE_LABELS } from "@/lib/labels";
import {
  AccountingBadge,
  ApplicationStatusBadge,
  Badge,
  SeverityBadge,
} from "@/components/ui/Badge";

const TH =
  "px-3 py-2 text-left text-[11px] font-medium tracking-wide text-ink-faint uppercase";
const TD = "px-3 py-3 align-top";

function holdSummary(row: QueueCase): string {
  const open = row.openHolds;
  if (open.length === 0) return "no open hold";
  return open.map((hold) => HOLD_TYPE_LABELS[hold.type]).join(", ");
}

export function ExceptionTable({ items }: { items: readonly QueueCase[] }) {
  const router = useRouter();

  function navigate(item: QueueCase) {
    router.push(`/exceptions/${item.case_id}`);
  }

  function handleClick(event: MouseEvent<HTMLTableRowElement>, item: QueueCase) {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    navigate(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, item: QueueCase) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate(item);
  }

  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {items.map((item) => (
          <li key={item.case_id}>
            <Link
              href={`/exceptions/${item.case_id}`}
              className="block border-l-2 border-transparent px-4 py-4 transition-colors hover:border-brand hover:bg-surface-2/60 focus-visible:border-brand focus-visible:bg-surface-2/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-ink-faint">{item.case_id}</p>
                  <p className="mt-1 text-sm leading-snug font-medium text-ink">
                    {holdSummary(item)}
                  </p>
                </div>
                {item.severity ? <SeverityBadge severity={item.severity} /> : null}
              </div>
              <p className="mt-1.5 truncate font-mono text-xs text-ink-faint">
                {item.invoice_id}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line/70 pt-3">
                <div>
                  <p className="text-[10px] text-ink-faint uppercase">Application</p>
                  <div className="mt-1">
                    <ApplicationStatusBadge status={item.application_status} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-ink-faint uppercase">Money at risk</p>
                  <p className="mt-1 font-mono text-xs text-ink tabular-nums">
                    {formatMoney(item.money_at_risk)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-faint uppercase">Age</p>
                  <p className="mt-1 text-xs text-ink-muted">{formatAge(item.age_days)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="border-b border-line bg-surface-2/60">
            <tr>
              <th scope="col" className={TH}>
                Case / invoice
              </th>
              <th scope="col" className={TH}>
                Holds
              </th>
              <th scope="col" className={TH}>
                Severity
              </th>
              <th scope="col" className={TH}>
                Application
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                Money at risk
              </th>
              <th scope="col" className={TH}>
                Held for
              </th>
              <th scope="col" className={TH}>
                Suggested owner
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.case_id}
                tabIndex={0}
                role="link"
                aria-label={`Open case ${item.case_id} on invoice ${item.invoice_id}`}
                onClick={(event) => handleClick(event, item)}
                onKeyDown={(event) => handleKeyDown(event, item)}
                className="cursor-pointer border-b border-line/70 transition-colors last:border-b-0 hover:bg-surface-2/50 focus-visible:bg-brand-wash focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <td className={cn(TD, "max-w-md")}>
                  <div className="group block">
                    <span className="block font-mono text-xs text-ink-faint">
                      {item.case_id}
                    </span>
                    <span className="mt-0.5 block font-mono font-medium text-ink group-hover:text-brand-ink group-focus-visible:text-brand-ink">
                      {item.invoice_id}
                    </span>
                    {item.decision ? (
                      <span className="mt-1 inline-block text-[11px] text-positive">
                        decided by {item.decision.reviewer}
                      </span>
                    ) : (
                      <span className="mt-1 inline-block text-[11px] text-ink-faint">
                        undecided
                      </span>
                    )}
                  </div>
                </td>
                <td className={TD}>
                  <div className="flex flex-wrap gap-1">
                    {item.openHolds.map((hold) => (
                      <Badge
                        key={hold.id}
                        className="border-line-strong bg-surface-2 text-ink-muted"
                      >
                        {HOLD_TYPE_LABELS[hold.type]}
                      </Badge>
                    ))}
                    <AccountingBadge blocks={item.blocks_accounting} />
                  </div>
                </td>
                <td className={TD}>
                  {item.severity ? <SeverityBadge severity={item.severity} /> : null}
                </td>
                <td className={TD}>
                  <ApplicationStatusBadge status={item.application_status} />
                </td>
                <td className={cn(TD, "text-right font-mono text-xs tabular-nums")}>
                  {formatMoney(item.money_at_risk)}
                </td>
                <td className={TD}>
                  <span className="block text-xs text-ink-muted">
                    {formatAge(item.age_days)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-faint">
                    since {formatRelative(item.held_since)}
                  </span>
                </td>
                <td className={cn(TD, "text-xs text-ink-muted")}>
                  {item.suggested_next ? (
                    <>
                      <span className="block text-ink">
                        {OWNER_ROLE_LABELS[item.suggested_next.owner_role]}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">
                        policy suggestion
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
