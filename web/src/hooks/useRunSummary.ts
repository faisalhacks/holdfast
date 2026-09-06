"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type RunOverview } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { onWrite } from "@/lib/revalidate";

/** Loads the frozen backend's run overview for the shell and dashboard. */
export function useRunSummary(runId: string) {
  const [summary, setSummary] = useState<RunOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void api.getRun(runId).then(
      (next) => {
        if (!cancelled) setSummary(next);
      },
      (cause) => {
        if (!cancelled) {
          setSummary(null);
          setError(toErrorMessage(cause));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [runId, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);
  useEffect(() => onWrite(refresh), [refresh]);
  return { summary, error, refresh };
}
