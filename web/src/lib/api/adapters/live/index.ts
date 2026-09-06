/**
 * The live adapter — HTTP against the frozen backend at v1.0-submission.
 *
 * Only these routes exist, and only these are called:
 *
 *   GET  /api/runs/{runId}                  run overview
 *   GET  /api/runs/{runId}/queue            exception queue
 *   GET  /api/cases/{caseId}                the case dossier
 *   POST /api/cases/{caseId}/decisions      route, escalate, release_hold
 *   POST /api/tolerance-changes             record a tolerance change
 *   GET  /api/audit                         the append-only journal
 *
 * There is no hold-release route: releasing a hold is a decision with
 * `action: "release_hold"` naming the hold ids, and it is destructive, so the backend
 * answers 428 with a preview until the request repeats carrying the approval header. This
 * adapter surfaces that as `ApprovalRequiredError`, never as a generic failure.
 */

import { config } from "@/lib/config";
import type {
  AdapterInfo,
  Approval,
  AuditQuery,
  AuditSlice,
  CaseDossier,
  ChangeToleranceInput,
  DecisionOutcome,
  HoldfastApi,
  MutationResult,
  QueuePage,
  QueueQuery,
  RecordDecisionInput,
  RunOverview,
  ToleranceChangeOutcome,
} from "@/lib/api/types";
import { ApiError, NotFoundError } from "@/lib/api/types";
import {
  mapApprovalPreview,
  mapAuditSlice,
  mapCaseDossier,
  mapDecisionOutcome,
  mapQueuePage,
  mapRunOverview,
  mapToleranceOutcome,
} from "./map";
import { APPROVAL_HEADER, toTypedError, unwrap, writeTolerance } from "./wire";

interface RequestOptions {
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  readonly approval?: Approval;
  /** Turns a 404 into `null` instead of an error, for the one read that permits it. */
  readonly allowNotFound?: boolean;
}

async function call(path: string, options: RequestOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  // The header value must equal the `reviewer` in the body; the backend checks it.
  if (options.approval) headers[APPROVAL_HEADER] = options.approval.reviewer;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiError(
      `The backend at ${config.apiBaseUrl} did not answer. ${
        cause instanceof Error ? cause.message : "The request failed."
      }`,
      "repository_unavailable",
      0,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError(
        `The backend answered ${response.status} with a body that is not JSON.`,
        "repository_unavailable",
        response.status,
      );
    }
  }

  if (!response.ok) {
    const error = toTypedError(response.status, body, mapApprovalPreview);
    if (options.allowNotFound && error instanceof NotFoundError) return null;
    throw error;
  }

  return unwrap(body);
}

function queueSearch(query: QueueQuery): string {
  const params = new URLSearchParams();
  if (query.hold_type && query.hold_type !== "all") params.set("hold_type", query.hold_type);
  if (query.blocks_accounting === true) params.set("blocks_accounting", "true");
  if (query.blocks_accounting === false) params.set("blocks_accounting", "false");
  if (query.undecided_only) params.set("undecided_only", "true");
  params.set("limit", String(query.limit ?? 25));
  params.set("offset", String(query.offset ?? 0));
  return params.toString();
}

function auditSearch(query: AuditQuery): string {
  const params = new URLSearchParams();
  if (query.run_id) params.set("run_id", query.run_id);
  if (query.case_id) params.set("case_id", query.case_id);
  if (query.event && query.event !== "all") params.set("event", query.event);
  if (query.entity_id) params.set("entity_id", query.entity_id);
  params.set("limit", String(query.limit ?? 100));
  return params.toString();
}

export function createLiveAdapter(): HoldfastApi {
  const info: AdapterInfo = {
    id: "live",
    label: "Live backend",
    isMock: false,
    description: `Reads and reviewer decisions are served by the Holdfast API at ${config.apiBaseUrl}.`,
  };

  return {
    info,

    async getRun(runId): Promise<RunOverview> {
      return mapRunOverview(await call(`/api/runs/${encodeURIComponent(runId)}`));
    },

    async getQueue(runId, query = {}): Promise<QueuePage> {
      const data = await call(
        `/api/runs/${encodeURIComponent(runId)}/queue?${queueSearch(query)}`,
      );
      return mapQueuePage(data);
    },

    async getCase(caseId): Promise<CaseDossier | null> {
      const data = await call(`/api/cases/${encodeURIComponent(caseId)}`, {
        allowNotFound: true,
      });
      return data === null ? null : mapCaseDossier(data);
    },

    async getAudit(query = {}): Promise<AuditSlice> {
      return mapAuditSlice(await call(`/api/audit?${auditSearch(query)}`));
    },

    /**
     * Records a reviewer decision. `release_hold` is the destructive one: without an
     * approval the backend answers 428 and this throws `ApprovalRequiredError` carrying the
     * preview. Calling again with `approval` repeats the identical body plus the header.
     */
    async recordDecision(
      caseId,
      input: RecordDecisionInput,
      approval,
    ): Promise<MutationResult<DecisionOutcome>> {
      const data = await call(`/api/cases/${encodeURIComponent(caseId)}/decisions`, {
        method: "POST",
        approval,
        body: {
          action: input.action,
          reviewer: input.reviewer,
          reason: input.reason,
          resolution_path: input.resolution_path,
          owner_next: input.owner_next,
          hold_ids: input.hold_ids ?? [],
          ...(input.application_status === undefined
            ? {}
            : { application_status: input.application_status }),
          ...(input.payment_id === undefined ? {} : { payment_id: input.payment_id }),
        },
      });
      return { data: mapDecisionOutcome(data) };
    },

    /**
     * Records a tolerance change. Recording without releasing is always permitted; asking
     * it to release the holds it governs is destructive and takes the same 428 path.
     */
    async changeTolerance(
      input: ChangeToleranceInput,
      approval,
    ): Promise<MutationResult<ToleranceChangeOutcome>> {
      const data = await call("/api/tolerance-changes", {
        method: "POST",
        approval,
        body: {
          from: writeTolerance(input.from),
          to: writeTolerance(input.to),
          scope: input.scope,
          reviewer: input.reviewer,
          reason: input.reason,
          case_id: input.case_id,
          owner_next: input.owner_next,
          release_affected_holds: input.release_affected_holds,
        },
      });
      return { data: mapToleranceOutcome(data) };
    },
  };
}
