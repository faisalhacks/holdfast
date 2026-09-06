"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type QueuePage, type QueueQuery, type RunOverview } from "@/lib/api";
import { config } from "@/lib/config";
import { toErrorMessage } from "@/lib/errors";

interface QueueState {
  page: QueuePage | null;
  run: RunOverview | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: QueueState = { page: null, run: null, loading: true, error: null };

/**
 * Loads the exception queue and the run it belongs to.
 *
 * Every filter in `query` is a parameter the backend route supports, so filtering and
 * paging happen server-side and the counters describe the whole result set rather than the
 * page in hand. Nothing is filtered in the browser.
 */
export function useExceptionQueue(query: QueueQuery) {
  const [state, setState] = useState<QueueState>(INITIAL);
  const [reloadToken, setReloadToken] = useState(0);

  // Queries are plain data, so serialising is a cheap way to get a stable dep without
  // pushing memoisation onto every caller.
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    (async () => {
      try {
        const parsed = JSON.parse(queryKey) as QueueQuery;
        const [page, run] = await Promise.all([
          api.getQueue(config.currentRunId, parsed),
          api.getRun(config.currentRunId),
        ]);
        if (!cancelled) setState({ page, run, loading: false, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({ page: null, run: null, loading: false, error: toErrorMessage(error) });
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
