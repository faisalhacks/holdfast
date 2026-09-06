/**
 * The mock adapter — DEMO ONLY.
 *
 * It answers from a recorded snapshot of the frozen backend (see `@/mocks/fixtures`) and
 * decodes it through the SAME mappers the live adapter uses, so demo mode cannot drift
 * into a shape the backend would never send.
 *
 * Two behaviours are deliberately faithful rather than convenient:
 *
 *  - Destructive operations answer 428 first. `release_hold`, and a tolerance change asked
 *    to release the holds it governs, refuse without an approval and hand back a preview
 *    built from the snapshot's own rows — the same contract the backend enforces.
 *  - Writes never leave the browser and are lost on reload, and every mutation says so in
 *    its `notice`.
 *
 * This adapter is never selected by a failure. It is selected only by
 * `NEXT_PUBLIC_HOLDFAST_API_MODE`, and the console labels it on every page.
 */

import { loadSnapshot } from "@/mocks/fixtures";
import type {
  AdapterInfo,
  Approval,
  ApprovalPreview,
  AuditQuery,
  AuditSlice,
  CaseDossier,
  ChangeToleranceInput,
  DecisionOutcome,
  HoldfastApi,
  MutationResult,
  QueueCase,
  QueuePage,
  QueueQuery,
  RecordDecisionInput,
  RunOverview,
  ToleranceChangeOutcome,
} from "@/lib/api/types";
import {
  ApprovalRequiredError,
  ConflictError,
  NotFoundError,
} from "@/lib/api/types";
import {
  mapAuditSlice,
  mapCaseDossier,
  mapQueuePage,
  mapRunOverview,
} from "@/lib/api/adapters/live/map";
import { APPROVAL_HEADER } from "@/lib/api/adapters/live/wire";
import { mockStore } from "./store";

const APPROVAL_VALUE = "the ReviewerId in the request body, repeated in the header";

const notice = {
  level: "demo" as const,
  message:
    "Demo mode: this decision was recorded in browser memory only and is lost on reload. Nothing reached a backend.",
};

export function createMockAdapter({ latencyMs = 0 }: { latencyMs?: number } = {}): HoldfastApi {
  const snapshot = loadSnapshot();
  const store = mockStore(snapshot);
  const pause = () => new Promise((resolve) => setTimeout(resolve, latencyMs));

  const info: AdapterInfo = {
    id: "mock",
    label: "Demo data",
    isMock: true,
    description:
      "A recorded snapshot of the Holdfast API. Decisions are stored in browser memory and reset on reload.",
  };

  function requireCase(caseId: string): CaseDossier {
    const dossier = store.getCase(caseId);
    if (dossier === null) throw new NotFoundError(`case "${caseId}" is not in this snapshot`);
    return dossier;
  }

  function refuse(operation: string, preview: ApprovalPreview): never {
    throw new ApprovalRequiredError(
      `"${operation}" is destructive and requires a named human to approve it`,
      preview,
      APPROVAL_HEADER,
      APPROVAL_VALUE,
    );
  }

  return {
    info,

    async getRun(runId): Promise<RunOverview> {
      await pause();
      const run = store.getRun(runId);
      if (run === null) throw new NotFoundError(`run "${runId}" is not in this snapshot`);
      return run;
    },

    async getQueue(runId, query: QueueQuery = {}): Promise<QueuePage> {
      await pause();
      return store.getQueue(runId, query);
    },

    async getCase(caseId): Promise<CaseDossier | null> {
      await pause();
      return store.getCase(caseId);
    },

    async getAudit(query: AuditQuery = {}): Promise<AuditSlice> {
      await pause();
      return store.getAudit(query);
    },

    async recordDecision(
      caseId,
      input: RecordDecisionInput,
      approval?: Approval,
    ): Promise<MutationResult<DecisionOutcome>> {
      await pause();
      const dossier = requireCase(caseId);

      if (input.action === "release_hold") {
        const ids = input.hold_ids ?? [];
        if (ids.length === 0) {
          throw new ConflictError("release_hold must name the hold_ids being released");
        }
        const targets = dossier.holds.filter((hold) => ids.includes(hold.id));
        if (targets.some((hold) => !hold.is_open)) {
          throw new ConflictError(
            "those holds are already released; a release is never repeated",
          );
        }
        const stillOpen = dossier.openHolds.filter((hold) => !ids.includes(hold.id));

        if (!approval || approval.reviewer !== input.reviewer) {
          refuse("release_hold", {
            operation: "release_hold",
            case_id: dossier.case_id,
            invoice_id: dossier.invoice_id,
            holds_to_release: targets.map((hold) => ({
              id: hold.id,
              type: hold.type,
              severity: hold.severity,
              auto_releasable: hold.auto_releasable,
              blocks_accounting: hold.blocks_accounting,
              reason: hold.reason,
              conflicts: hold.conflicts,
            })),
            holds_still_open_afterwards: stillOpen.map((hold) => ({
              id: hold.id,
              type: hold.type,
            })),
            document_becomes_payable: stillOpen.length === 0,
            invoice_gross: dossier.invoice.gross,
            money_at_risk: dossier.money_at_risk,
            releases_a_hold_that_would_not_lift_on_its_own: targets.some(
              (hold) => !hold.auto_releasable,
            ),
          });
        }
      }

      return { data: store.recordDecision(caseId, input), notice };
    },

    async changeTolerance(
      input: ChangeToleranceInput,
      approval?: Approval,
    ): Promise<MutationResult<ToleranceChangeOutcome>> {
      await pause();
      const dossier = requireCase(input.case_id);
      const inScope = store.holdsInScope(input.scope, input.to);

      if (input.release_affected_holds && (!approval || approval.reviewer !== input.reviewer)) {
        refuse("tolerance_change_release", {
          operation: "tolerance_change_release",
          direction: store.direction(input.from, input.to),
          scope: input.scope,
          scope_description: store.describeScope(input.scope),
          from: input.from,
          to: input.to,
          holds_that_would_release: inScope,
          holds_that_would_release_count: inScope.length,
          money_that_would_stop_being_held: store.sumGross(inScope),
          includes_holds_that_would_not_lift_on_their_own: inScope.some(
            (hold) => !hold.auto_releasable,
          ),
          widening: store.direction(input.from, input.to) === "widened",
        });
      }

      void dossier;
      return { data: store.changeTolerance(input, inScope), notice };
    },
  } satisfies HoldfastApi;
}

export { mapAuditSlice, mapCaseDossier, mapQueuePage, mapRunOverview };

/** A queue row, re-exported so the store's signature reads plainly at call sites. */
export type { QueueCase };
