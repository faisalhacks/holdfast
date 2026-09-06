"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isBareKey, isTypingTarget } from "@/lib/keyboard";
import { useExceptionQueue, useQueueQuery } from "@/hooks/useExceptionQueue";
import { QueueLedgerStrip } from "./QueueLedgerStrip";
import { QueueRow } from "./QueueRow";
import { QueueToolbar } from "./QueueToolbar";
import { Button } from "@/components/ui/Button";
import { KeyHint } from "@/components/ui/KeyHint";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/States";

const optionId = (id: string) => `queue-option-${id}`;

/**
 * The intake pane. It lives in the route layout rather than a page, so opening
 * a case never remounts the queue: the scroll position, the filter set and the
 * reviewer's place in the backlog all survive navigation.
 *
 * Keyboard movement never commits anything. j/k and Enter move and open; every
 * write in this application is behind an explicit form submit.
 */
export function QueuePane({ selectedId }: { selectedId: string | null }) {
  const router = useRouter();
  const { query, patch, clear, activeFilterCount } = useQueueQuery();
  const { page, run, loading, error, refresh } = useExceptionQueue(query);

  const items = useMemo(() => page?.cases ?? [], [page]);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Follow the URL: the open case is the highlighted case.
  useEffect(() => {
    if (!selectedId) return;
    const index = items.findIndex((item) => item.case_id === selectedId);
    if (index >= 0) setActiveIndex(index);
  }, [selectedId, items]);

  useEffect(() => {
    if (activeIndex >= items.length) setActiveIndex(Math.max(0, items.length - 1));
  }, [items.length, activeIndex]);

  const move = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const next = Math.min(items.length - 1, Math.max(0, current + delta));
        const element = document.getElementById(optionId(items[next]?.case_id ?? ""));
        element?.scrollIntoView({ block: "nearest" });
        return next;
      });
    },
    [items],
  );

  /*
   * Queue movement is global. An analyst working a backlog should not have to
   * click into the list before j/k does anything, and the shortcuts stay inert
   * inside any text field.
   *
   * Nothing here commits: j/k move, Enter opens, "/" searches. Every write in
   * this application is behind an explicit form submit.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isBareKey(event)) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        listRef.current?.focus();
        move(1);
        return;
      }

      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        listRef.current?.focus();
        move(-1);
        return;
      }

      // Enter is left alone unless the list itself has focus, so it keeps
      // submitting the console forms.
      const listFocused =
        document.activeElement === listRef.current ||
        document.activeElement === document.body ||
        listRef.current?.contains(document.activeElement);
      if ((event.key === "Enter" || event.key === "ArrowRight") && listFocused) {
        const item = items[activeIndex];
        if (!item) return;
        event.preventDefault();
        router.push(`/exceptions/${item.case_id}`);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, items, move, router]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <h2 className="text-md font-semibold text-ink">Exception queue</h2>
        <span className="num shrink-0 text-xs text-ink-faint">
          {page ? `${page.total_matching} item${page.total_matching === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      <QueueLedgerStrip summary={run} error={error} />

      <QueueToolbar
        query={query}
        onChange={patch}
        onClear={clear}
        activeFilterCount={activeFilterCount}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            }
          />
        ) : loading && !page ? (
          <LoadingRows rows={5} />
        ) : items.length > 0 ? (
          <div
            ref={listRef}
            role="listbox"
            tabIndex={0}
            aria-label="Exceptions, ordered by money at risk"
            aria-activedescendant={items[activeIndex] ? optionId(items[activeIndex].case_id) : undefined}
            className="divide-y divide-line outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            {items.map((item, index) => (
              <Link
                key={item.case_id}
                id={optionId(item.case_id)}
                role="option"
                aria-selected={item.case_id === selectedId}
                tabIndex={-1}
                href={`/exceptions/${item.case_id}`}
                onClick={() => setActiveIndex(index)}
                className="block"
              >
                <QueueRow
                  item={item}
                  selected={item.case_id === selectedId}
                  active={index === activeIndex && item.case_id !== selectedId}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title={activeFilterCount > 0 ? "No matching exceptions" : "No exceptions in this run"}
            description={
              activeFilterCount > 0
                ? "Adjust or clear the filters to see the rest of the backlog."
                : "The API returned no exceptions for the selected run."
            }
            action={
              activeFilterCount > 0 ? (
                <Button size="sm" variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {page ? (
        <Pagination
          page={Math.floor(page.offset / page.limit) + 1}
          pageSize={page.limit}
          total={page.total_matching}
          onPageChange={(next) => patch({ page: next })}
        />
      ) : null}

      <div className="hidden h-9 shrink-0 items-center gap-2 border-t border-line px-4 text-xs text-ink-faint lg:flex">
        <KeyHint>j</KeyHint>
        <KeyHint>k</KeyHint>
        <span>move</span>
        <KeyHint>↵</KeyHint>
        <span>open</span>
      </div>
    </div>
  );
}
