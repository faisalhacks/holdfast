"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type RunSummary } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { onWrite } from "@/lib/revalidate";

/**
 * The run's headline figures, read on their own so the shell can show them
 * without waiting for a queue page.
 */
export function useRunSummary(runId: string) {
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api.getRunSummary(runId);
        if (!cancelled) setSummary(next);
      } catch (cause) {
        if (!cancelled) setError(toErrorMessage(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // Routing a case moves it between the counters shown here.
  useEffect(() => onWrite(refresh), [refresh]);

  return { summary, error, refresh };
}
