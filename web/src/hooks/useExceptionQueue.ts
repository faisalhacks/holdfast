"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ExceptionQuery,
  type ExceptionSummary,
  type Page,
  type RunSummary,
} from "@/lib/api";
import { config } from "@/lib/config";
import { toErrorMessage } from "@/lib/errors";

interface QueueState {
  page: Page<ExceptionSummary> | null;
  stats: RunSummary | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: QueueState = { page: null, stats: null, loading: true, error: null };

/** Loads the exception queue and its headline counters for a given filter set. */
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
        const [page, stats] = await Promise.all([
          api.listRunExceptions(config.currentRunId, parsed),
          api.getRunSummary(config.currentRunId),
        ]);
        if (!cancelled) setState({ page, stats, loading: false, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({ page: null, stats: null, loading: false, error: toErrorMessage(error) });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, refresh };
}
