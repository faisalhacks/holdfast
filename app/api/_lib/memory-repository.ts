// The in-memory repository.
//
// This is the default implementation and it is seeded with a complete, self-consistent
// month of reconciliation, so the API answers real questions with real rows from the
// first request — before the schema, the generator or the engine exist.
//
// State lives on globalThis so a Next dev-server reload does not silently discard
// decisions a reviewer just recorded.

import type {
  ApplicationStatus,
  AuditEntry,
  CaseId,
  Decision,
  ExceptionCase,
  FeedbackRule,
  FeedbackRuleId,
  Hold,
  HoldId,
  HoldPolicy,
  Invoice,
  InvoiceId,
  IsoTimestamp,
  MatchCandidate,
  Payment,
  Run,
  RunId,
  Sha256,
  ToleranceChange,
} from '@/lib/types';
import { daysBetween, nowTimestamp } from './ids';
import { sealEntry } from './journal';
import { sumPaise } from './money';
import type {
  ApplicationStatusInput,
  AuditDraft,
  AuditQuery,
  CaseBundle,
  DecisionDraft,
  DecisionQuery,
  FeedbackRuleDraft,
  HoldReleaseInput,
  OutcomeRow,
  QueuePage,
  QueueQuery,
  Repository,
  RepositoryStatus,
  RunDraft,
  ToleranceChangeDraft,
} from './repository';
import { buildSeed, type CaseRow, type SeedData } from './seed';

const STORE_KEY = Symbol.for('holdfast.api.memory-repository');

interface Store {
  data: SeedData;
}

function store(): Store {
  const holder = globalThis as unknown as Record<symbol, Store | undefined>;
  const existing = holder[STORE_KEY];
  if (existing) return existing;
  const created: Store = { data: buildSeed() };
  holder[STORE_KEY] = created;
  return created;
}

function byTimestamp(a: { timestamp: IsoTimestamp }, b: { timestamp: IsoTimestamp }): number {
  return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;
}

class MemoryRepository implements Repository {
  readonly kind = 'memory' as const;

  private get data(): SeedData {
    return store().data;
  }

  async status(): Promise<RepositoryStatus> {
    const d = this.data;
    return {
      kind: this.kind,
      ready: true,
      detail: {
        source: 'seeded in-memory rows',
        runs: d.runs.length,
        invoices: d.invoices.length,
        payments: d.payments.length,
        holds: d.holds.length,
        cases: d.caseRows.length,
        decisions: d.decisions.length,
        tolerance_changes: d.toleranceChanges.length,
        feedback_rules: d.feedbackRules.length,
        audit_entries: d.audit.length,
        durable: false,
        note: 'writes live for the lifetime of the server process',
      },
    };
  }

  // ── runs ──────────────────────────────────────────────────────────────────

  async listRuns(limit: number): Promise<readonly Run[]> {
    return [...this.data.runs]
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      .slice(0, limit);
  }

  async getRun(id: RunId): Promise<Run | null> {
    return this.data.runs.find((r) => r.id === id) ?? null;
  }

  async getRunByIdempotencyKey(key: string): Promise<Run | null> {
    return this.data.runs.find((r) => r.idempotency_key === key) ?? null;
  }

  async latestRun(): Promise<Run | null> {
    const sorted = [...this.data.runs].sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    return sorted[0] ?? null;
  }

  async insertRun(draft: RunDraft): Promise<Run> {
    const run: Run = {
      id: draft.id,
      kind: draft.kind,
      status: 'pending',
      started_at: draft.started_at,
      finished_at: null,
      dataset_hash: draft.dataset_hash,
      thresholds_hash: draft.thresholds_hash,
      engine_version: draft.engine_version,
      scorer_version: draft.scorer_version,
      idempotency_key: draft.idempotency_key,
      parent_run_id: draft.parent_run_id,
      feedback_rule_ids: draft.feedback_rule_ids,
      totals: null,
    };
    this.data.runs.push(run);
    return run;
  }

  // ── outcomes and queue ────────────────────────────────────────────────────

  async listOutcomes(runId: RunId): Promise<readonly OutcomeRow[]> {
    return this.data.outcomes.filter((o) => o.run_id === runId);
  }

  private holdsForCase(caseId: CaseId): Hold[] {
    return this.data.holds.filter((h) => h.case_id === caseId);
  }

  private topCandidate(runId: RunId, invoiceId: InvoiceId): MatchCandidate | null {
    const all = this.data.candidates
      .filter((c) => c.run_id === runId && c.invoice_id === invoiceId)
      .sort((a, b) => a.rank - b.rank);
    return all[0] ?? null;
  }

  private latestDecision(caseId: CaseId): Decision | null {
    const all = this.data.decisions.filter((d) => d.case_id === caseId).sort(byTimestamp);
    return all[all.length - 1] ?? null;
  }

  private toExceptionCase(row: CaseRow): ExceptionCase {
    const holds = this.holdsForCase(row.case_id);
    const active = holds.filter((h) => h.released_at === null);
    return {
      case_id: row.case_id,
      run_id: row.run_id,
      invoice_id: row.invoice_id,
      money_at_risk_paise: row.money_at_risk_paise,
      holds,
      held_since: row.held_since,
      age_days: daysBetween(String(row.held_since), new Date().toISOString()),
      blocks_accounting: active.some((h) => h.blocks_accounting),
      application_status: row.application_status,
      top_candidate: this.topCandidate(row.run_id, row.invoice_id),
      decision: this.latestDecision(row.case_id),
    };
  }

  async listExceptionCases(runId: RunId, query: QueueQuery): Promise<QueuePage> {
    let cases = this.data.caseRows
      .filter((row) => row.run_id === runId)
      .map((row) => this.toExceptionCase(row));

    if (query.hold_type !== null) {
      const wanted = query.hold_type;
      cases = cases.filter((c) => c.holds.some((h) => h.type === wanted));
    }
    if (query.blocks_accounting !== null) {
      cases = cases.filter((c) => c.blocks_accounting === query.blocks_accounting);
    }
    if (query.undecided_only) {
      cases = cases.filter((c) => c.decision === null);
    }

    // THE QUEUE IS ORDERED BY money_at_risk_paise DESCENDING. Not by score, not by age.
    cases.sort((a, b) => {
      const left = BigInt(a.money_at_risk_paise);
      const right = BigInt(b.money_at_risk_paise);
      if (left === right) return a.case_id < b.case_id ? -1 : 1;
      return right > left ? 1 : -1;
    });

    return {
      cases: cases.slice(query.offset, query.offset + query.limit),
      total_matching: cases.length,
      money_at_risk_total: sumPaise(cases.map((c) => c.money_at_risk_paise)),
    };
  }

  async getCaseBundle(caseId: CaseId): Promise<CaseBundle | null> {
    const row = this.data.caseRows.find((c) => c.case_id === caseId);
    if (row === undefined) return null;

    const invoice = this.data.invoices.find((i) => i.id === row.invoice_id);
    if (invoice === undefined) return null;

    const holds = this.holdsForCase(caseId);
    const candidates = this.data.candidates
      .filter((c) => c.run_id === row.run_id && c.invoice_id === row.invoice_id)
      .sort((a, b) => a.rank - b.rank);

    const paymentIds = new Set<string>();
    for (const candidate of candidates) {
      for (const id of candidate.payment_ids) paymentIds.add(String(id));
    }
    const payments = this.data.payments.filter((p) => paymentIds.has(String(p.id)));

    const holdIds = new Set(holds.map((h) => String(h.id)));
    const toleranceChanges = this.data.toleranceChanges.filter((tc) =>
      tc.affected_hold_ids.some((id) => holdIds.has(String(id))),
    );

    const ruleIds = new Set<string>();
    for (const candidate of candidates) {
      for (const evidence of Object.values(candidate.evidence)) {
        const note = evidence.normalisation;
        if (note && note.feedback_rule_id !== null) ruleIds.add(String(note.feedback_rule_id));
      }
    }
    const feedbackRules = this.data.feedbackRules.filter(
      (r) => ruleIds.has(String(r.id)) || String(r.learned_from_case_id) === String(caseId),
    );

    return {
      exception: this.toExceptionCase(row),
      invoice,
      vendor: this.data.vendors.find((v) => v.id === invoice.vendor_id) ?? null,
      holds,
      candidates,
      payments,
      decisions: this.data.decisions.filter((d) => d.case_id === caseId).sort(byTimestamp),
      tolerance_changes: toleranceChanges,
      feedback_rules: feedbackRules,
      audit: this.data.audit
        .filter((e) => e.case_id === caseId)
        .sort((a, b) => a.sequence - b.sequence),
      vendor_invoices: this.data.invoices.filter(
        (i) => i.vendor_id === invoice.vendor_id && i.id !== invoice.id,
      ),
    };
  }

  // ── holds ─────────────────────────────────────────────────────────────────

  async holdPolicies(): Promise<readonly HoldPolicy[]> {
    return this.data.holdPolicies;
  }

  async listHolds(runId: RunId): Promise<readonly Hold[]> {
    return this.data.holds.filter((h) => h.run_id === runId);
  }

  async getHolds(ids: readonly HoldId[]): Promise<readonly Hold[]> {
    const wanted = new Set(ids.map(String));
    return this.data.holds.filter((h) => wanted.has(String(h.id)));
  }

  async releaseHolds(input: HoldReleaseInput): Promise<readonly Hold[]> {
    const wanted = new Set(input.hold_ids.map(String));
    const released: Hold[] = [];
    this.data.holds.forEach((hold, index) => {
      if (!wanted.has(String(hold.id))) return;
      const next: Hold = {
        ...hold,
        released_by: input.reviewer,
        released_at: input.released_at,
        release_reason: input.reason,
      };
      this.data.holds[index] = next;
      released.push(next);
    });
    return released;
  }

  async getInvoices(ids: readonly InvoiceId[]): Promise<readonly Invoice[]> {
    const wanted = new Set(ids.map(String));
    return this.data.invoices.filter((i) => wanted.has(String(i.id)));
  }

  // ── decisions ─────────────────────────────────────────────────────────────

  async listDecisions(query: DecisionQuery): Promise<readonly Decision[]> {
    return this.data.decisions
      .filter((d) => (query.run_id === null ? true : d.run_id === query.run_id))
      .filter((d) => (query.case_id === null ? true : d.case_id === query.case_id))
      .sort(byTimestamp);
  }

  async insertDecision(draft: DecisionDraft): Promise<Decision> {
    const decision: Decision = { ...draft };
    this.data.decisions.push(decision);
    return decision;
  }

  // ── tolerance changes ─────────────────────────────────────────────────────

  async listToleranceChanges(runId: RunId | null): Promise<readonly ToleranceChange[]> {
    return this.data.toleranceChanges
      .filter((tc) => (runId === null ? true : tc.run_id === runId))
      .sort(byTimestamp);
  }

  async insertToleranceChange(draft: ToleranceChangeDraft): Promise<ToleranceChange> {
    const change: ToleranceChange = { ...draft };
    this.data.toleranceChanges.push(change);
    return change;
  }

  // ── feedback rules ────────────────────────────────────────────────────────

  async listFeedbackRules(activeOnly: boolean): Promise<readonly FeedbackRule[]> {
    return this.data.feedbackRules.filter((r) => (activeOnly ? r.active : true));
  }

  async getFeedbackRule(id: FeedbackRuleId): Promise<FeedbackRule | null> {
    return this.data.feedbackRules.find((r) => r.id === id) ?? null;
  }

  async insertFeedbackRule(draft: FeedbackRuleDraft): Promise<FeedbackRule> {
    const rule: FeedbackRule = {
      ...draft,
      active: true,
      deactivated_by: null,
      deactivated_at: null,
    };
    this.data.feedbackRules.push(rule);
    return rule;
  }

  async deactivateFeedbackRule(
    id: FeedbackRuleId,
    reviewer: FeedbackRule['created_by'],
    at: IsoTimestamp,
  ): Promise<FeedbackRule> {
    const index = this.data.feedbackRules.findIndex((r) => r.id === id);
    const existing = index < 0 ? undefined : this.data.feedbackRules[index];
    if (existing === undefined) throw new Error(`feedback rule "${id}" is not in the store`);
    const next: FeedbackRule = {
      ...existing,
      active: false,
      deactivated_by: reviewer,
      deactivated_at: at,
    };
    this.data.feedbackRules[index] = next;
    return next;
  }

  // ── application status ────────────────────────────────────────────────────

  async recordApplicationStatus(input: ApplicationStatusInput): Promise<ApplicationStatus> {
    const index = this.data.caseRows.findIndex((c) => c.case_id === input.case_id);
    const row = index < 0 ? undefined : this.data.caseRows[index];
    if (row === undefined) throw new Error(`case "${input.case_id}" is not in the store`);
    this.data.caseRows[index] = { ...row, application_status: input.status };

    if (input.payment_id !== null) {
      const pIndex = this.data.payments.findIndex((p) => p.id === input.payment_id);
      const payment = pIndex < 0 ? undefined : this.data.payments[pIndex];
      if (payment !== undefined) {
        const next: Payment = { ...payment, application_status: input.status };
        this.data.payments[pIndex] = next;
      }
    }
    return input.status;
  }

  // ── journal ───────────────────────────────────────────────────────────────

  async listAuditEntries(query: AuditQuery): Promise<readonly AuditEntry[]> {
    return this.data.audit
      .filter((e) => (query.run_id === null ? true : e.run_id === query.run_id))
      .filter((e) => (query.case_id === null ? true : e.case_id === query.case_id))
      .filter((e) => (query.event === null ? true : e.event === query.event))
      .filter((e) =>
        query.entity_id === null ? true : String(e.entity.id) === query.entity_id,
      )
      .filter((e) =>
        query.after_sequence === null ? true : e.sequence > query.after_sequence,
      )
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, query.limit);
  }

  async appendAuditEntries(drafts: readonly AuditDraft[]): Promise<readonly AuditEntry[]> {
    const appended: AuditEntry[] = [];
    for (const draft of drafts) {
      const last = this.data.audit[this.data.audit.length - 1];
      const sequence = (last?.sequence ?? 0) + 1;
      const prev: Sha256 | null = last?.payload_hash ?? null;
      const entry = sealEntry(draft, sequence, prev, nowTimestamp());
      this.data.audit.push(entry);
      appended.push(entry);
    }
    return appended;
  }
}

let instance: MemoryRepository | null = null;

export function memoryRepository(): Repository {
  if (instance === null) instance = new MemoryRepository();
  return instance;
}
