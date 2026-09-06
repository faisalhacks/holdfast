"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  ApprovalRequiredError,
  type Approval,
  type ApprovalPreview,
  type CaseDossier,
  type ChangeToleranceInput,
  type MutationResult,
  type RecordDecisionInput,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import { announceWrite } from "@/lib/revalidate";

export type CaseAction = "route" | "release_hold" | "change_tolerance";

export interface ActionError {
  readonly action: CaseAction;
  readonly message: string;
}

/**
 * A destructive request the backend answered 428 to.
 *
 * `preview` is the backend's own description of what the operation would do. `retry`
 * repeats the identical request with the approval header naming the reviewer. Nothing is
 * sent until the human confirms — this object existing IS the pending confirmation.
 */
export interface PendingApproval {
  readonly action: CaseAction;
  readonly reviewer: string;
  readonly preview: ApprovalPreview;
  readonly message: string;
}

interface Outcome {
  readonly level: "info" | "demo" | "warning";
  readonly message: string;
}

/**
 * Loads one case and records decisions against it.
 *
 * Every write goes through `attempt`, which is the single place the 428 contract is
 * handled: an `ApprovalRequiredError` becomes a `pendingApproval` for the UI to render and
 * nothing else happens. `confirmApproval` replays the stored request with the header.
 */
export function useCaseDossier(caseId: string, reviewer: string) {
  const [dossier, setDossier] = useState<CaseDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [pending, setPending] = useState<CaseAction | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  // The exact request that was refused, held so the confirmation replays it byte for byte.
  const [replay, setReplay] = useState<
    ((approval: Approval) => Promise<MutationResult<unknown>>) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await api.getCase(caseId);
        if (cancelled) return;
        setDossier(result);
        setNotFound(result === null);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setDossier(null);
        setError(toErrorMessage(cause));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const attempt = useCallback(
    async (
      action: CaseAction,
      send: (approval?: Approval) => Promise<MutationResult<unknown>>,
      describe: (result: MutationResult<unknown>) => string,
      approval?: Approval,
    ): Promise<boolean> => {
      setPending(action);
      setActionError(null);
      try {
        const result = await send(approval);
        setPendingApproval(null);
        setReplay(null);
        setOutcome({ level: result.notice?.level ?? "info", message: describe(result) });
        // The mutation changed hold state and the journal; re-read rather than guess.
        announceWrite();
        setReloadToken((token) => token + 1);
        return true;
      } catch (cause) {
        if (cause instanceof ApprovalRequiredError) {
          setPendingApproval({
            action,
            reviewer,
            preview: cause.preview,
            message: cause.message,
          });
          setReplay(() => (given: Approval) => send(given));
          return false;
        }
        setActionError({ action, message: toErrorMessage(cause) });
        return false;
      } finally {
        setPending(null);
      }
    },
    [reviewer],
  );

  const recordDecision = useCallback(
    (action: CaseAction, input: RecordDecisionInput) =>
      attempt(
        action,
        (approval) => api.recordDecision(caseId, input, approval),
        (result) => {
          const outcomeData = result.data as { released_hold_ids: readonly string[] };
          const released = outcomeData.released_hold_ids ?? [];
          const base =
            input.action === "release_hold"
              ? `Released ${released.length} hold${released.length === 1 ? "" : "s"}, recorded against ${input.reviewer}.`
              : `Decision recorded against ${input.reviewer}.`;
          return result.notice ? `${base} ${result.notice.message}` : base;
        },
      ),
    [attempt, caseId],
  );

  const changeTolerance = useCallback(
    (input: ChangeToleranceInput) =>
      attempt(
        "change_tolerance",
        (approval) => api.changeTolerance(input, approval),
        (result) => {
          const data = result.data as {
            released_hold_ids: readonly string[];
            holds_left_untouched: readonly string[];
            direction: string;
          };
          const released = data.released_hold_ids ?? [];
          const untouched = data.holds_left_untouched ?? [];
          const base = `Tolerance ${data.direction}. ${
            released.length > 0
              ? `Released ${released.length} hold${released.length === 1 ? "" : "s"}: ${released.join(", ")}.`
              : `No hold was released; ${untouched.length} hold${untouched.length === 1 ? "" : "s"} in scope were left in force.`
          }`;
          return result.notice ? `${base} ${result.notice.message}` : base;
        },
      ),
    [attempt],
  );

  /** Sends the refused request again, this time carrying the approval header. */
  const confirmApproval = useCallback(async (): Promise<boolean> => {
    const send = replay;
    const request = pendingApproval;
    if (!send || !request) return false;
    setPending(request.action);
    setActionError(null);
    try {
      const result = await send({ reviewer: request.reviewer });
      setPendingApproval(null);
      setReplay(null);
      setOutcome({
        level: result.notice?.level ?? "info",
        message: result.notice
          ? `Approved by ${request.reviewer}. ${result.notice.message}`
          : `Approved by ${request.reviewer} and recorded in the journal.`,
      });
      announceWrite();
      setReloadToken((token) => token + 1);
      return true;
    } catch (cause) {
      setActionError({ action: request.action, message: toErrorMessage(cause) });
      return false;
    } finally {
      setPending(null);
    }
  }, [pendingApproval, replay]);

  const cancelApproval = useCallback(() => {
    setPendingApproval(null);
    setReplay(null);
  }, []);

  const errorFor = useCallback(
    (action: CaseAction) => (actionError?.action === action ? actionError.message : null),
    [actionError],
  );

  return useMemo(
    () => ({
      dossier,
      loading,
      notFound,
      error,
      pending,
      outcome,
      pendingApproval,
      recordDecision,
      changeTolerance,
      confirmApproval,
      cancelApproval,
      errorFor,
      dismissOutcome: () => setOutcome(null),
      refresh,
    }),
    [
      dossier,
      loading,
      notFound,
      error,
      pending,
      outcome,
      pendingApproval,
      recordDecision,
      changeTolerance,
      confirmApproval,
      cancelApproval,
      errorFor,
      refresh,
    ],
  );
}
