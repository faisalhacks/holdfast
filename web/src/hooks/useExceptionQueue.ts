"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, HOLD_TYPES, type HoldType, type QueuePage, type QueueQuery, type RunOverview } from "@/lib/api";
import { config } from "@/lib/config";
import { toErrorMessage } from "@/lib/errors";
import { onWrite } from "@/lib/revalidate";

export const QUEUE_PAGE_SIZE = 25;

export function useQueueQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = useMemo<QueueQuery>(() => {
    const requestedHold = params.get("hold_type");
    const hold_type: HoldType | "all" = HOLD_TYPES.includes(requestedHold as HoldType)
      ? (requestedHold as HoldType)
      : "all";
    const accounting = params.get("blocks_accounting");
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    return {
      hold_type,
      blocks_accounting: accounting === "true" ? true : accounting === "false" ? false : null,
      undecided_only: params.get("undecided_only") === "true",
      limit: QUEUE_PAGE_SIZE,
      offset: (page - 1) * QUEUE_PAGE_SIZE,
    };
  }, [params]);

  const patch = useCallback(
    (next: Partial<QueueQuery> & { page?: number }) => {
      const search = new URLSearchParams(params.toString());
      if (next.hold_type !== undefined) {
        if (!next.hold_type || next.hold_type === "all") search.delete("hold_type");
        else search.set("hold_type", next.hold_type);
      }
      if (next.blocks_accounting !== undefined) {
        if (next.blocks_accounting === null) search.delete("blocks_accounting");
        else search.set("blocks_accounting", String(next.blocks_accounting));
      }
      if (next.undecided_only !== undefined) {
        if (next.undecided_only) search.set("undecided_only", "true");
        else search.delete("undecided_only");
      }
      if (next.page !== undefined && next.page > 1) search.set("page", String(next.page));
      else search.delete("page");
      const qs = search.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);
  const activeFilterCount =
    (query.hold_type !== "all" ? 1 : 0) +
    (query.blocks_accounting !== null ? 1 : 0) +
    (query.undecided_only ? 1 : 0);
  return { query, patch, clear, activeFilterCount };
}

interface QueueState {
  page: QueuePage | null;
  run: RunOverview | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: QueueState = { page: null, run: null, loading: true, error: null };

export function useExceptionQueue(query: QueueQuery) {
  const [state, setState] = useState<QueueState>(INITIAL);
  const [reloadToken, setReloadToken] = useState(0);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));
    void (async () => {
      try {
        const parsed = JSON.parse(queryKey) as QueueQuery;
        const [page, run] = await Promise.all([
          api.getQueue(config.currentRunId, parsed),
          api.getRun(config.currentRunId),
        ]);
        if (!cancelled) setState({ page, run, loading: false, error: null });
      } catch (cause) {
        if (!cancelled) setState({ page: null, run: null, loading: false, error: toErrorMessage(cause) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);
  useEffect(() => onWrite(refresh), [refresh]);
  return { ...state, refresh };
}
