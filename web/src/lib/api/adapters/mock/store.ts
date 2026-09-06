/**
 * MOCK ADAPTER STATE — DEMO ONLY.
 *
 * Decodes the recorded backend snapshot once through the live adapter's mappers, then
 * holds the result in memory. Writes made through the mock adapter mutate this object, so
 * a decision survives client-side navigation and is lost on a full reload. Nothing is
 * persisted and no request leaves the browser.
 *
 * The filtering, paging and ordering here reproduce what the backend route does, because
 * demo mode that filters differently from the API teaches the wrong thing about the
 * product. Ordering in particular is left exactly as the snapshot recorded it — money at
 * risk descending — and is never re-sorted.
 */

import type { BackendSnapshot } from "@/mocks/fixtures";
import type {
  ApplicationStatus,
  AuditEntry,
  AuditQuery,
  AuditSlice,
  CaseDossier,
  ChangeToleranceInput,
  Decision,
  DecisionOutcome,
  Hold,
  HoldInScope,
  Money,
  QueueCase,
  QueuePage,
  QueueQuery,
  RecordDecisionInput,
  RunOverview,
  Tolerance,
  ToleranceChange,
  ToleranceChangeOutcome,
  ToleranceDirection,
  ToleranceScope,
} from "@/lib/api/types";
import {
  mapAuditSlice,
  mapCaseDossier,
  mapQueuePage,
  mapRunOverview,
  caseSeverity,
} from "@/lib/api/adapters/live/map";

const clone = <T,>(value: T): T => structuredClone(value) as T;

function paise(money: Money): bigint {
  try {
    return BigInt(money.digits);
  } catch {
    return 0n;
  }
}

function toMoney(value: bigint): Money {
  const safe =
    value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : null;
  return { digits: value.toString(), safe };
}

/** Mirrors the backend's `TOLERANCE_GOVERNS`: which hold types a tolerance kind reaches. */
const GOVERNS: Readonly<Record<Tolerance["kind"], readonly string[]>> = {
  exact: [],
  absolute_paise: ["price_variance", "tax_amount_range", "dist_variance", "cardinality_residual"],
  percentage: ["price_variance", "quantity_variance", "tax_variance", "dist_variance"],
  days: ["period_deferral", "credit_note_crossing"],
  similarity: ["matching", "no_reference", "duplicate_candidate"],
};

function toleranceMagnitude(tolerance: Tolerance): number | null {
  switch (tolerance.kind) {
    case "exact":
      return 0;
    case "absolute_paise":
      return tolerance.value.safe;
    default:
      return tolerance.value;
  }
}

export interface MockStore {
  getRun(runId: string): RunOverview | null;
  getQueue(runId: string, query: QueueQuery): QueuePage;
  getCase(caseId: string): CaseDossier | null;
  getAudit(query: AuditQuery): AuditSlice;
  recordDecision(caseId: string, input: RecordDecisionInput): DecisionOutcome;
  changeTolerance(
    input: ChangeToleranceInput,
    inScope: readonly HoldInScope[],
  ): ToleranceChangeOutcome;
  holdsInScope(scope: ToleranceScope, to: Tolerance): readonly HoldInScope[];
  direction(from: Tolerance, to: Tolerance): ToleranceDirection;
  describeScope(scope: ToleranceScope): string;
  sumGross(holds: readonly HoldInScope[]): Money;
}

export function mockStore(snapshot: BackendSnapshot): MockStore {
  const run = mapRunOverview(snapshot.run);
  const queue = mapQueuePage(snapshot.queue);
  const audit = mapAuditSlice(snapshot.audit);

  const cases = new Map<string, CaseDossier>();
  for (const [caseId, payload] of Object.entries(snapshot.cases)) {
    cases.set(caseId, mapCaseDossier(payload));
  }

  // Live, mutable state. Seeded from the snapshot, replaced on every write.
  let rows: QueueCase[] = queue.cases.map((row) => clone(row) as QueueCase);
  const dossiers = new Map<string, CaseDossier>(
    [...cases.entries()].map(([id, dossier]) => [id, clone(dossier) as CaseDossier]),
  );
  let journal: AuditEntry[] = [...audit.entries];
  let sequence = journal.reduce((max, entry) => Math.max(max, entry.sequence), 0);
  let counter = 0;

  const nextId = (prefix: string) => `${prefix}_demo_${(counter += 1)}`;

  function appendJournal(entry: Omit<AuditEntry, "id" | "sequence">): AuditEntry {
    sequence += 1;
    const full: AuditEntry = { ...entry, id: nextId("aud"), sequence };
    journal = [...journal, full];
    return full;
  }

  /** Re-derives the queue row from its dossier, so the two never disagree after a write. */
  function syncRow(dossier: CaseDossier): void {
    rows = rows.map((row) =>
      row.case_id === dossier.case_id
        ? {
            ...row,
            holds: dossier.holds,
            openHolds: dossier.openHolds,
            severity: caseSeverity(dossier.openHolds),
            payable: dossier.openHolds.length === 0,
            decision: dossier.decisions[dossier.decisions.length - 1] ?? row.decision,
            application_status: dossier.application_status,
          }
        : row,
    );
  }

  function updateDossier(caseId: string, next: CaseDossier): void {
    dossiers.set(caseId, next);
    syncRow(next);
  }

  return {
    getRun(runId) {
      return runId === run.run_id ? clone(run) : null;
    },

    getQueue(runId, query) {
      if (runId !== queue.run_id) {
        return { ...queue, cases: [], returned: 0, total_matching: 0, has_more: false };
      }
      let matching = rows;
      if (query.hold_type && query.hold_type !== "all") {
        matching = matching.filter((row) =>
          row.holds.some((hold) => hold.type === query.hold_type),
        );
      }
      if (query.blocks_accounting === true || query.blocks_accounting === false) {
        matching = matching.filter((row) => row.blocks_accounting === query.blocks_accounting);
      }
      if (query.undecided_only) matching = matching.filter((row) => row.decision === null);

      const limit = Math.max(1, query.limit ?? 25);
      const offset = Math.max(0, query.offset ?? 0);
      const page = matching.slice(offset, offset + limit);
      const total = matching.reduce((sum, row) => sum + paise(row.money_at_risk), 0n);

      return {
        run_id: queue.run_id,
        ordering: queue.ordering,
        limit,
        offset,
        returned: page.length,
        total_matching: matching.length,
        has_more: offset + page.length < matching.length,
        money_at_risk_total: toMoney(total),
        cases: clone(page),
      };
    },

    getCase(caseId) {
      const dossier = dossiers.get(caseId);
      return dossier ? (clone(dossier) as CaseDossier) : null;
    },

    getAudit(query) {
      let entries = journal;
      if (query.run_id) entries = entries.filter((entry) => entry.run_id === query.run_id);
      if (query.case_id) entries = entries.filter((entry) => entry.case_id === query.case_id);
      if (query.event && query.event !== "all") {
        entries = entries.filter((entry) => entry.event === query.event);
      }
      if (query.entity_id) {
        entries = entries.filter((entry) => entry.entity.id === query.entity_id);
      }
      const limited = entries.slice(0, query.limit ?? 100);

      const actors = new Map<string, number>();
      for (const entry of limited) {
        const key =
          entry.actor.kind === "human"
            ? `human:${entry.actor.reviewer}`
            : entry.actor.kind === "model"
              ? `model:${entry.actor.model_id}@${entry.actor.call_site}`
              : `system:${entry.actor.component}`;
        actors.set(key, (actors.get(key) ?? 0) + 1);
      }

      const sequences = limited.map((entry) => entry.sequence).sort((a, b) => a - b);
      const first = sequences[0] ?? null;
      const last = sequences[sequences.length - 1] ?? null;
      const seen = new Set(sequences);
      const missing: number[] = [];
      if (first !== null && last !== null) {
        for (let s = first; s <= last; s += 1) if (!seen.has(s)) missing.push(s);
      }

      return {
        entries: clone(limited),
        chain: {
          first_sequence: first,
          last_sequence: last,
          entries_examined: limited.length,
          missing_sequences: missing,
          unverifiable_entries: [],
          broken_links: [],
          intact: true,
          contiguous: missing.length === 0,
          note: audit.chain.note,
        },
        actors: [...actors.entries()].map(([actor, entry_count]) => ({ actor, entry_count })),
      };
    },

    recordDecision(caseId, input) {
      const dossier = dossiers.get(caseId);
      if (!dossier) throw new Error(`case "${caseId}" is not in this snapshot`);

      const at = new Date().toISOString();
      const releasedIds: string[] = [];
      const entries: AuditEntry[] = [];
      let holds = dossier.holds;
      let applicationStatus: ApplicationStatus | null = null;

      if (input.action === "release_hold") {
        const ids = new Set(input.hold_ids ?? []);
        holds = dossier.holds.map((hold): Hold => {
          if (!ids.has(hold.id) || !hold.is_open) return hold;
          releasedIds.push(hold.id);
          entries.push(
            appendJournal({
              occurred_at: at,
              recorded_at: at,
              actor: { kind: "human", reviewer: input.reviewer },
              event: "hold_released",
              entity: { entity: "hold", id: hold.id },
              run_id: dossier.run_id,
              case_id: caseId,
              detail: {
                hold_type: hold.type,
                released_by: input.reviewer,
                reason: input.reason,
                auto_releasable: hold.auto_releasable,
              },
              payload_hash: "",
              prev_hash: null,
            }),
          );
          return {
            ...hold,
            is_open: false,
            released_by: input.reviewer,
            released_at: at,
            release_reason: input.reason,
          };
        });
      }

      if (input.action === "record_application_status" && input.application_status) {
        applicationStatus = input.application_status;
      }

      const decision: Decision = {
        id: nextId("dec"),
        run_id: dossier.run_id,
        case_id: caseId,
        invoice_id: dossier.invoice_id,
        action: input.action,
        resolution_path: input.resolution_path,
        owner_next: input.owner_next,
        reviewer: input.reviewer,
        reason: input.reason,
        timestamp: at,
        hold_ids: input.hold_ids ?? [],
        tolerance_change_id: null,
      };

      entries.push(
        appendJournal({
          occurred_at: at,
          recorded_at: at,
          actor: { kind: "human", reviewer: input.reviewer },
          event: "decision_recorded",
          entity: { entity: "decision", id: decision.id },
          run_id: dossier.run_id,
          case_id: caseId,
          detail: {
            action: decision.action,
            resolution_path: decision.resolution_path,
            owner_role: decision.owner_next.role,
            owner_party: decision.owner_next.party,
            hold_count: decision.hold_ids.length,
          },
          payload_hash: "",
          prev_hash: null,
        }),
      );

      const openHolds = holds.filter((hold) => hold.is_open);
      const next: CaseDossier = {
        ...dossier,
        holds,
        openHolds,
        severity: caseSeverity(openHolds),
        payable: openHolds.length === 0,
        open_hold_count: openHolds.length,
        released_hold_count: holds.length - openHolds.length,
        application_status: applicationStatus ?? dossier.application_status,
        decisions: [...dossier.decisions, decision],
        why_held: dossier.why_held.filter((why) =>
          openHolds.some((hold) => hold.id === why.hold_id),
        ),
        audit: { ...dossier.audit, entries: [...dossier.audit.entries, ...entries] },
      };
      updateDossier(caseId, next);

      return {
        decision,
        released_hold_ids: releasedIds,
        application_status: applicationStatus,
        journal_entries: entries,
      };
    },

    holdsInScope(scope, to) {
      const governed = new Set(GOVERNS[to.kind]);
      const out: HoldInScope[] = [];
      for (const dossier of dossiers.values()) {
        for (const hold of dossier.openHolds) {
          if (!governed.has(hold.type)) continue;
          const matches =
            scope.kind === "global" ||
            (scope.kind === "hold_type" && scope.hold_type === hold.type) ||
            (scope.kind === "invoice" && scope.invoice_id === dossier.invoice_id) ||
            (scope.kind === "vendor" && scope.vendor_id === dossier.vendor.id);
          if (!matches) continue;
          out.push({
            id: hold.id,
            type: hold.type,
            case_id: dossier.case_id,
            invoice_id: dossier.invoice_id,
            severity: hold.severity,
            auto_releasable: hold.auto_releasable,
            blocks_accounting: hold.blocks_accounting,
            invoice_gross: dossier.invoice.gross,
          });
        }
      }
      return out;
    },

    direction(from, to) {
      if (from.kind !== to.kind) return "retyped";
      const a = toleranceMagnitude(from);
      const b = toleranceMagnitude(to);
      if (a === null || b === null || a === b) return "unchanged";
      return b > a ? "widened" : "narrowed";
    },

    describeScope(scope) {
      switch (scope.kind) {
        case "global":
          return "every hold in the run";
        case "vendor":
          return `vendor ${scope.vendor_id}`;
        case "hold_type":
          return `hold type ${scope.hold_type}`;
        case "invoice":
          return `invoice ${scope.invoice_id}`;
      }
    },

    sumGross(holds) {
      let total = 0n;
      for (const hold of holds) if (hold.invoice_gross) total += paise(hold.invoice_gross);
      return toMoney(total);
    },

    changeTolerance(input, inScope) {
      const at = new Date().toISOString();
      const changeId = nextId("tch");
      const decisionId = nextId("dec");
      const entries: AuditEntry[] = [];
      const releasedIds: string[] = [];

      if (input.release_affected_holds) {
        for (const target of inScope) {
          const dossier = dossiers.get(target.case_id);
          if (!dossier) continue;
          const holds = dossier.holds.map((hold): Hold =>
            hold.id === target.id
              ? {
                  ...hold,
                  is_open: false,
                  released_by: input.reviewer,
                  released_at: at,
                  release_reason: `tolerance change ${changeId}: ${input.reason}`,
                }
              : hold,
          );
          releasedIds.push(target.id);
          entries.push(
            appendJournal({
              occurred_at: at,
              recorded_at: at,
              actor: { kind: "human", reviewer: input.reviewer },
              event: "hold_released",
              entity: { entity: "hold", id: target.id },
              run_id: dossier.run_id,
              case_id: dossier.case_id,
              detail: {
                hold_type: target.type,
                released_by: input.reviewer,
                tolerance_change_id: changeId,
              },
              payload_hash: "",
              prev_hash: null,
            }),
          );
          const openHolds = holds.filter((hold) => hold.is_open);
          updateDossier(dossier.case_id, {
            ...dossier,
            holds,
            openHolds,
            severity: caseSeverity(openHolds),
            payable: openHolds.length === 0,
            open_hold_count: openHolds.length,
            released_hold_count: holds.length - openHolds.length,
            why_held: dossier.why_held.filter((why) =>
              openHolds.some((hold) => hold.id === why.hold_id),
            ),
          });
        }
      }

      const scopeDescription = this.describeScope(input.scope);
      const direction = this.direction(input.from, input.to);

      const change: ToleranceChange = {
        id: changeId,
        decision_id: decisionId,
        from: input.from,
        to: input.to,
        scope: input.scope,
        direction,
        scope_description: scopeDescription,
        reviewer: input.reviewer,
        reason: input.reason,
        timestamp: at,
        affected_hold_ids: releasedIds,
      };

      const dossier = dossiers.get(input.case_id);
      const decision: Decision = {
        id: decisionId,
        run_id: dossier?.run_id ?? run.run_id,
        case_id: input.case_id,
        invoice_id: dossier?.invoice_id ?? "",
        action: "change_tolerance",
        resolution_path: "internal_correction",
        owner_next: input.owner_next,
        reviewer: input.reviewer,
        reason: input.reason,
        timestamp: at,
        hold_ids: releasedIds,
        tolerance_change_id: changeId,
      };

      entries.push(
        appendJournal({
          occurred_at: at,
          recorded_at: at,
          actor: { kind: "human", reviewer: input.reviewer },
          event: "tolerance_changed",
          entity: { entity: "tolerance_change", id: changeId },
          run_id: decision.run_id,
          case_id: input.case_id,
          detail: {
            direction,
            scope_kind: input.scope.kind,
            from_kind: input.from.kind,
            to_kind: input.to.kind,
            holds_in_scope: inScope.length,
            holds_released: releasedIds.length,
            reason: input.reason,
          },
          payload_hash: "",
          prev_hash: null,
        }),
      );

      if (dossier) {
        const current = dossiers.get(input.case_id) ?? dossier;
        updateDossier(input.case_id, {
          ...current,
          decisions: [...current.decisions, decision],
          tolerance_changes: [...current.tolerance_changes, change],
          audit: { ...current.audit, entries: [...current.audit.entries, ...entries] },
        });
      }

      return {
        tolerance_change: change,
        decision,
        direction,
        scope_description: scopeDescription,
        holds_in_scope: inScope,
        released_hold_ids: releasedIds,
        holds_left_untouched: input.release_affected_holds
          ? []
          : inScope.map((hold) => hold.id),
        journal_entries: entries,
      };
    },
  };
}
