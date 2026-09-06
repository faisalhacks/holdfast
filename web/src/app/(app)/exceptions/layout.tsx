"use client";

import { Suspense, type ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { QueuePane } from "@/components/exceptions/QueuePane";
import { LoadingRows } from "@/components/ui/States";

/**
 * The workstation frame.
 *
 * The queue lives in the layout rather than in a page, so selecting a case does
 * not remount it: filters, scroll position, and the reviewer's place in the
 * backlog all survive navigation, and every case is still a real URL.
 *
 * The panes sit on the canvas with a gutter between them rather than butted
 * edge to edge. Three surfaces a reviewer moves between read as three places
 * to work; three columns sharing a hairline read as one table.
 *
 * Below the large breakpoint there is only room for one pane, so the queue
 * yields to the case that is open and a back link returns to it.
 */
export default function ExceptionsLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const selectedId = segment && segment !== "__PAGE__" ? segment : null;

  return (
    <div className="flex h-full min-h-0 gap-3 p-3 2xl:gap-4 2xl:p-4">
      <div
        className={
          selectedId
            ? "hidden w-[320px] shrink-0 overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel lg:flex lg:flex-col xl:w-[340px] 2xl:w-[380px]"
            : "flex w-full shrink-0 flex-col overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel lg:w-[320px] xl:w-[340px] 2xl:w-[380px]"
        }
      >
        <Suspense fallback={<LoadingRows rows={8} />}>
          <QueuePane selectedId={selectedId} />
        </Suspense>
      </div>

      <div className={selectedId ? "min-w-0 flex-1" : "hidden min-w-0 flex-1 lg:block"}>
        {children}
      </div>
    </div>
  );
}
