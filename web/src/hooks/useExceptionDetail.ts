"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type AdapterNotice, type ChangeToleranceInput, type ExceptionDetail, type RoutingDecisionInput } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
export type PendingAction = "route" | "release_hold" | "change_tolerance" | null;
export interface ActionError { action: Exclude<PendingAction, null>; message: string }
export function useExceptionDetail(exceptionId: string) {
  const [exception, setException] = useState<ExceptionDetail | null>(null); const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false); const [error, setError] = useState<string | null>(null); const [reloadToken, setReloadToken] = useState(0);
  const [pending, setPending] = useState<PendingAction>(null); const [notice, setNotice] = useState<AdapterNotice | null>(null); const [actionError, setActionError] = useState<ActionError | null>(null);
  useEffect(() => { let cancelled = false; setLoading(true); setError(null); (async () => { try { const item = await api.getException(exceptionId); const timeline = item ? await api.getExceptionTimeline(exceptionId) : []; if (cancelled) return; const value = item ? { ...item, timeline } : null; setException(value); setNotFound(value === null); setLoading(false); } catch (cause) { if (!cancelled) { setException(null); setError(toErrorMessage(cause)); setLoading(false); } } })(); return () => { cancelled = true; }; }, [exceptionId, reloadToken]);
  const runMutation = useCallback(async (action: Exclude<PendingAction, null>, run: () => Promise<{ data: { exception: ExceptionDetail }; notice?: AdapterNotice }>) => { setPending(action); setActionError(null); try { const result = await run(); setException(result.data.exception); setNotice(result.notice ?? null); return true; } catch (cause) { setActionError({ action, message: toErrorMessage(cause) }); return false; } finally { setPending(null); } }, []);
  const route = useCallback((input: RoutingDecisionInput) => runMutation("route", () => api.routeException(exceptionId, input)), [exceptionId, runMutation]);
  const releaseHold = useCallback((reason: string) => exception?.hold ? runMutation("release_hold", () => api.releaseHold(exceptionId, exception.hold!.id, { reason })) : Promise.resolve(false), [exception, exceptionId, runMutation]);
  const changeTolerance = useCallback((input: ChangeToleranceInput) => runMutation("change_tolerance", async () => { const result = await api.changeTolerance(exceptionId, input); const affected = result.data.affected_hold_ids; return { ...result, notice: { level: result.notice?.level ?? "info", message: `${result.notice?.message ? `${result.notice.message} ` : ""}Affected holds: ${affected.length ? affected.join(", ") : "none"}.` } }; }), [exceptionId, runMutation]);
  return { exception, loading, notFound, error, pending, notice, actionError, route, releaseHold, changeTolerance, dismissNotice: useCallback(() => setNotice(null), []), refresh: useCallback(() => setReloadToken((v) => v + 1), []) };
}
