"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type ExceptionCategory,
  type ExceptionQuery,
  type ExceptionStatus,
  type ExceptionSummary,
  type Page,
  type Severity,
} from "@/lib/api";
import { config } from "@/lib/config";
import { toErrorMessage } from "@/lib/errors";
import { onWrite } from "@/lib/revalidate";

export const QUEUE_PAGE_SIZE = 25;

/**
 * The queue filter set lives in the URL. A reviewer who has narrowed to the
 * held critical items can send that view to a colleague, and a reload does not
 * silently widen what they are looking at.
 */
export function useQueueQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = useMemo<ExceptionQuery>(
    () => ({
      status: (params.get("status") as ExceptionStatus | "all") ?? "all",
      severity: (params.get("severity") as Severity | "all") ?? "all",
      category: (params.get("category") as ExceptionCategory | "all") ?? "all",
      search: params.get("q") ?? "",
      sort: "amount_desc",
      page: Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1),
      pageSize: QUEUE_PAGE_SIZE,
    }),
    [params],
  );

  const patch = useCallback(
    (next: Partial<ExceptionQuery>) => {
      const search = new URLSearchParams(params.toString());
      const write = (key: string, value: string | undefined, fallback: string) => {
        if (value === undefined) return;
        if (!value || value === fallback) search.delete(key);
        else search.set(key, value);
      };

      write("status", next.status, "all");
      write("severity", next.severity, "all");
      write("category", next.category, "all");
      write("q", next.search?.trim(), "");
      // Any change to a filter invalidates the page number it was paired with.
      if (next.page !== undefined) write("page", String(next.page), "1");
      else search.delete("page");

      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const activeFilterCount =
    (query.status !== "all" ? 1 : 0) +
    (query.severity !== "all" ? 1 : 0) +
    (query.category !== "all" ? 1 : 0) +
    (query.search?.trim() ? 1 : 0);

  return { query, patch, clear, activeFilterCount };
}

interface QueueState {
  page: Page<ExceptionSummary> | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: QueueState = { page: null, loading: true, error: null };

/** Loads one page of the money-ordered queue for the current filter set. */
export function useExceptionQueue(query: ExceptionQuery) {
  const [state, setState] = useState<QueueState>(INITIAL);
  const [reloadToken, setReloadToken] = useState(0);

  // Queries are plain data, so serialising is a cheap way to get a stable dep
  // without pushing memoisation onto every caller.
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    (async () => {
      try {
        const parsed = JSON.parse(queryKey) as ExceptionQuery;
        const page = await api.listRunExceptions(config.currentRunId, parsed);
        if (!cancelled) setState({ page, loading: false, error: null });
      } catch (error) {
        if (!cancelled) setState({ page: null, loading: false, error: toErrorMessage(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // A decision recorded on the open case changes a row in this list.
  useEffect(() => onWrite(refresh), [refresh]);

  return { ...state, refresh };
}
