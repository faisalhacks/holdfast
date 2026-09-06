import { buildDemoDataset } from "@/mocks/fixtures";
import type {
  AdapterInfo, ChangeToleranceInput, ExceptionQuery, ExceptionSummary,
  Page, ReleaseHoldInput, RoutingDecisionInput, RunSummary, SyndicateApi,
} from "@/lib/api/types";
import { ConflictError, NotFoundError } from "@/lib/api/types";

const clone = <T,>(value: T): T => structuredClone(value);

export function createMockAdapter({ latencyMs = 0 }: { latencyMs?: number } = {}): SyndicateApi {
  const dataset = buildDemoDataset();
  const pause = () => new Promise((resolve) => setTimeout(resolve, latencyMs));
  const info: AdapterInfo = { id: "mock", label: "Demo data", isMock: true, description: "Operational actions are stored in browser memory and reset on reload." };
  const requireException = (id: string) => {
    const item = dataset.exceptions.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundError(`Exception ${id} was not found.`);
    return item;
  };
  const notice = { level: "demo" as const, message: "Demo mode: this action is stored in browser memory and resets on reload." };

  return {
    info,
    async getRunSummary(runId): Promise<RunSummary> {
      await pause();
      const items = dataset.exceptions.filter((item) => item.runId === runId);
      return {
        runId, open: items.filter((i) => i.status === "open").length,
        inReview: items.filter((i) => i.status === "in_review").length,
        routed: items.filter((i) => i.status === "routed").length,
        held: items.filter((i) => i.hold?.status === "held").length,
        money_at_risk_paise: items.filter((i) => i.status !== "routed").reduce((sum, i) => sum + (i.exposure_paise ?? 0), 0),
        currency: items[0]?.currency ?? "INR",
      };
    },
    async listRunExceptions(runId, query: ExceptionQuery = {}): Promise<Page<ExceptionSummary>> {
      await pause();
      const search = query.search?.trim().toLowerCase();
      let items = dataset.exceptions.filter((i) => i.runId === runId);
      if (query.status && query.status !== "all") items = items.filter((i) => i.status === query.status);
      if (query.severity && query.severity !== "all") items = items.filter((i) => i.severity === query.severity);
      if (query.category && query.category !== "all") items = items.filter((i) => i.category === query.category);
      if (search) items = items.filter((i) => `${i.reference} ${i.title} ${i.entity.label}`.toLowerCase().includes(search));
      items.sort((a, b) => (b.exposure_paise ?? -1) - (a.exposure_paise ?? -1));
      const page = Math.max(1, query.page ?? 1); const pageSize = Math.max(1, query.pageSize ?? 20);
      const start = (page - 1) * pageSize;
      return { items: clone(items.slice(start, start + pageSize)), total: items.length, page, pageSize };
    },
    async getException(id) { await pause(); return clone(dataset.exceptions.find((i) => i.id === id) ?? null); },
    async getExceptionTimeline(id) { await pause(); return clone(requireException(id).timeline); },
    async routeException(id: string, input: RoutingDecisionInput) {
      await pause(); const exception = requireException(id);
      if (exception.routingDecision) throw new ConflictError("This exception has already been routed.");
      if (!input.owner_next.trim() || !input.reason.trim()) throw new Error("Next owner and reason are required.");
      const now = new Date().toISOString();
      const decision = { id: `route_${Date.now()}`, exceptionId: id, ...input, owner_next: input.owner_next.trim(), reason: input.reason.trim(), routedAt: now };
      exception.routingDecision = decision; exception.status = "routed"; exception.assignee = decision.owner_next;
      exception.timeline.push({ id: `tl_${Date.now()}`, kind: "routing", actor: "reviewer", at: now, title: `Routed for ${input.resolution_path.replaceAll("_", " ")}`, detail: `Owner: ${decision.owner_next}` });
      return { data: { exception: clone(exception), decision: clone(decision) }, notice };
    },
    async releaseHold(exceptionId: string, holdId: string, input: ReleaseHoldInput) {
      await pause(); const exception = requireException(exceptionId); const hold = exception.hold;
      if (!hold || hold.id !== holdId) throw new NotFoundError(`Hold ${holdId} was not found.`);
      if (hold.status === "released") throw new ConflictError("This hold has already been released.");
      if (!input.reason.trim()) throw new Error("A release reason is required.");
      const now = new Date().toISOString(); hold.status = "released"; hold.releasedAt = now; hold.releaseReason = input.reason.trim();
      exception.timeline.push({ id: `tl_${Date.now()}`, kind: "hold", actor: "reviewer", at: now, title: "Hold released", detail: hold.releaseReason });
      return { data: { exception: clone(exception), hold: clone(hold) }, notice };
    },
    async changeTolerance(exceptionId: string, input: ChangeToleranceInput) {
      await pause(); requireException(exceptionId);
      if (!Number.isInteger(input.from) || !Number.isInteger(input.to)) throw new Error("Tolerance values must be integers.");
      if (!input.scope.trim() || !input.reason.trim()) throw new Error("Scope and reason are required.");
      const affected = dataset.exceptions.filter((i) => i.hold?.status === "held" && i.tolerance?.scope === input.scope && i.tolerance.from === input.from);
      for (const item of affected) {
        if (item.tolerance) item.tolerance = { from: input.to, to: input.to, scope: input.scope };
        item.timeline.push({ id: `tl_${item.id}_${Date.now()}`, kind: "tolerance", actor: "reviewer", at: new Date().toISOString(), title: `Tolerance changed from ${input.from} to ${input.to}`, detail: input.reason.trim() });
      }
      return { data: { exception: clone(requireException(exceptionId)), affected_hold_ids: affected.flatMap((i) => i.hold ? [i.hold.id] : []) }, notice };
    },
  } satisfies SyndicateApi;
}
