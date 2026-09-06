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
 * Below the large breakpoint there is only room for one pane, so the queue
 * yields to the case that is open and a back link returns to it.
 */
export default function ExceptionsLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const selectedId = segment && segment !== "__PAGE__" ? segment : null;

  return (
    <div className="flex h-full min-h-0">
      <div
        className={
          selectedId
            ? "hidden w-72 shrink-0 lg:flex lg:flex-col xl:w-80"
            : "flex w-full shrink-0 flex-col lg:w-72 xl:w-80"
        }
      >
        <Suspense fallback={<LoadingRows rows={8} className="p-2" />}>
          <QueuePane selectedId={selectedId} />
        </Suspense>
      </div>

      <div className={selectedId ? "min-w-0 flex-1" : "hidden min-w-0 flex-1 lg:block"}>
        {children}
      </div>
    </div>
  );
}
