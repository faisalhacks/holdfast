import type {
  AdapterInfo,
  ChangeToleranceInput,
  ChangeToleranceOutcome,
  ExceptionDetail,
  ExceptionQuery,
  ExceptionSummary,
  MutationResult,
  Page,
  ReleaseHoldInput,
  ReleaseHoldOutcome,
  RoutingDecisionInput,
  RoutingDecisionOutcome,
  RunSummary,
  SyndicateApi,
  TimelineEvent,
} from "@/lib/api/types";

async function request<T>(path: string, init?: RequestInit, allowNotFound = false): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (allowNotFound && response.status === 404) return null as T;
  if (!response.ok) {
    throw new Error(`Syndicate API request failed (${response.status}).`);
  }

  const body = await response.text();
  return (body ? JSON.parse(body) : undefined) as T;
}

export function createLiveAdapter(): SyndicateApi {
  const info: AdapterInfo = {
    id: "live",
    label: "Live backend",
    isMock: false,
    description: "Reads and operational actions are served by the Syndicate API.",
  };

  async function getExceptionWithTimeline(id: string): Promise<ExceptionDetail | null> {
    const exception = await request<ExceptionDetail | null>(`/api/exceptions/${encodeURIComponent(id)}`, undefined, true);
    const timeline = exception ? await request<TimelineEvent[]>(`/api/exceptions/${encodeURIComponent(id)}/timeline`) : [];
    return exception ? { ...exception, timeline } : null;
  }

  return {
    info,
    getRunSummary: (runId: string) =>
      request<RunSummary>(`/api/runs/${encodeURIComponent(runId)}/summary`),
    async listRunExceptions(runId: string, query: ExceptionQuery = {}) {
      const payload = await request<Page<ExceptionSummary> | ExceptionSummary[]>(
        `/api/runs/${encodeURIComponent(runId)}/exceptions?sort=amount_desc`,
      );
      const source = Array.isArray(payload) ? payload : payload.items;
      const search = query.search?.trim().toLowerCase();
      let items = source.filter((item) =>
        (!query.status || query.status === "all" || item.status === query.status) &&
        (!query.severity || query.severity === "all" || item.severity === query.severity) &&
        (!query.category || query.category === "all" || item.category === query.category) &&
        (!search || `${item.reference} ${item.title} ${item.entity.label}`.toLowerCase().includes(search)),
      );
      items = [...items].sort((a, b) => (b.exposure_paise ?? -1) - (a.exposure_paise ?? -1));
      const page = Math.max(1, query.page ?? 1);
      const pageSize = Math.max(1, query.pageSize ?? 20);
      const start = (page - 1) * pageSize;
      return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
    },
    getException: (id: string) =>
      request<ExceptionDetail | null>(`/api/exceptions/${encodeURIComponent(id)}`, undefined, true),
    getExceptionTimeline: (id: string) =>
      request<TimelineEvent[]>(`/api/exceptions/${encodeURIComponent(id)}/timeline`),

    async routeException(id, input): Promise<MutationResult<RoutingDecisionOutcome>> {
      await request<unknown>(`/api/exceptions/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        body: JSON.stringify(input satisfies RoutingDecisionInput),
      });
      const exception = await getExceptionWithTimeline(id);
      if (!exception?.routingDecision) {
        throw new Error("The routed exception response did not include its routing decision.");
      }
      return { data: { exception, decision: exception.routingDecision } };
    },

    async releaseHold(exceptionId, holdId, input): Promise<MutationResult<ReleaseHoldOutcome>> {
      await request<unknown>(`/api/holds/${encodeURIComponent(holdId)}/release`, {
        method: "POST",
        body: JSON.stringify(input satisfies ReleaseHoldInput),
      });
      const exception = await getExceptionWithTimeline(exceptionId);
      if (!exception?.hold) {
        throw new Error("The refreshed exception did not include its hold state.");
      }
      return { data: { exception, hold: exception.hold } };
    },

    async changeTolerance(
      exceptionId,
      input,
    ): Promise<MutationResult<ChangeToleranceOutcome>> {
      const result = await request<{ affected_hold_ids: string[] }>(
        "/api/tolerances/changes",
        { method: "POST", body: JSON.stringify(input satisfies ChangeToleranceInput) },
      );
      const exception = await getExceptionWithTimeline(exceptionId);
      if (!exception) throw new Error("The exception could not be refreshed.");
      return { data: { exception, affected_hold_ids: result.affected_hold_ids } };
    },
  };
}
