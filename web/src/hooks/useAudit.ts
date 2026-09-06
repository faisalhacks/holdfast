"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type AuditQuery, type AuditSlice } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

/**
 * Reads a slice of the append-only journal.
 *
 * The backend re-verifies the hash chain over exactly the slice it returns and ships that
 * report with it, so the UI states the integrity of what it is showing rather than making
 * a claim about the whole journal.
 */
export function useAudit(query: AuditQuery) {
  const [slice, setSlice] = useState<AuditSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const parsed = JSON.parse(queryKey) as AuditQuery;
        const result = await api.getAudit(parsed);
        if (cancelled) return;
        setSlice(result);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setSlice(null);
        setError(toErrorMessage(cause));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return { slice, loading, error, refresh };
}
