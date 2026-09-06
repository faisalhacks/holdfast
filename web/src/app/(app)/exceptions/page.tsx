"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useExceptionQueue, useQueueQuery } from "@/hooks/useExceptionQueue";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/States";

const SURFACE =
  "flex h-full min-h-0 items-center justify-center overflow-hidden rounded-md border border-line-strong bg-surface shadow-panel";

/*
 * The width at which all three panes are on screen at once. Below it the queue
 * IS this route, so opening a case on arrival would make the backlog
 * unreachable from the case's own back link.
 */
const THREE_PANE = "(min-width: 1024px)";

/**
 * The centre pane with nothing selected.
 *
 * At desktop widths this is a waypoint rather than a destination: the queue is
 * already ordered by money at risk, so the case a reviewer would open first is
 * known, and it opens itself. The redirect replaces rather than pushes, so
 * going back from the case leaves the workstation instead of bouncing between
 * the queue and the row it would immediately re-open, and it carries the query
 * string so a shared filtered link opens the top of THAT queue.
 *
 * It fires once per mount. A reviewer who returns here deliberately — the
 * mobile back link, a resize — is not dragged forward again.
 *
 * What remains visible is the honest case: a queue with nothing in it, or a
 * filter that matches nothing. Neither invents a case to fill the space.
 */
function ExceptionQueueRestState() {
  const router = useRouter();
  const params = useSearchParams();
  const { query, clear, activeFilterCount } = useQueueQuery();
  const { page, loading, error, refresh } = useExceptionQueue(query);

  const redirected = useRef(false);
  const top = page?.items[0] ?? null;

  useEffect(() => {
    if (redirected.current || !top) return;
    if (!window.matchMedia(THREE_PANE).matches) return;

    redirected.current = true;
    const qs = params.toString();
    router.replace(`/exceptions/${top.id}${qs ? `?${qs}` : ""}`);
  }, [top, params, router]);

  if (error) {
    return (
      <div className={SURFACE}>
        <ErrorState
          message={error}
          action={
            <Button size="sm" variant="outline" onClick={refresh}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  // Loading, or the moment between the queue resolving and the case opening.
  if (loading || top) {
    return (
      <div className={SURFACE}>
        <p className="px-6 text-center text-base text-ink-muted">
          {top ? "Opening the highest-exposure case…" : "Loading the queue…"}
        </p>
      </div>
    );
  }

  return (
    <div className={SURFACE}>
      {activeFilterCount > 0 ? (
        <EmptyState
          title="No exceptions match these filters"
          description="Adjust or clear the filters to see the rest of the backlog."
          action={
            <Button size="sm" variant="outline" onClick={clear}>
              Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="Nothing to review"
          description="The API returned no exceptions for this run."
        />
      )}
    </div>
  );
}

/*
 * `useQueueQuery` reads the search params, which a statically prerendered page
 * cannot do without a boundary to bail out at. The queue pane in the layout is
 * wrapped for the same reason.
 */
export default function ExceptionQueueRestPage() {
  return (
    <Suspense
      fallback={
        <div className={SURFACE}>
          <p className="px-6 text-center text-base text-ink-muted">Loading the queue…</p>
        </div>
      }
    >
      <ExceptionQueueRestState />
    </Suspense>
  );
}
