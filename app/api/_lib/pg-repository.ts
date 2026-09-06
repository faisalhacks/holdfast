// The Postgres repository.
//
// Selected with HOLDFAST_REPO=pg and DATABASE_URL. It reads TABLES — the same rows the
// engine writes — and never calls an engine function, so the API stayed independent of
// engine work throughout.
//
// Money: every `*_paise` column is BIGINT, and the driver is deliberately left to hand
// BIGINT back as decimal digits in a string. `paiseFromDigits` is the only way those
// digits become a number, and it refuses rather than rounds. No parse of a monetary value
// through a float happens anywhere in this file.
//
// Instants and dates are converted by type parsers registered once, below, so no query
// has to wrap a column in to_char and no row mapper has to guess whether it received a
// Date or a string.

import { Pool, types } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import type {
  Actor,
  ApplicationStatus,
  AuditEntry,
  AuditEntryId,
  CaseId,
  Conflict,
  Decision,
  DecisionAction,
  EntityRef,
  EvidenceSet,
  ExceptionCase,
  FeedbackRule,
  FeedbackRuleBody,
  FeedbackRuleId,
  Hold,
  HoldId,
  HoldPolicy,
  HoldType,
  Invoice,
  InvoiceId,
  IsoDate,
  IsoTimestamp,
  MatchCandidate,
  MatchCandidateId,
  MatchStatus,
  OwnerRole,
  Paise,
  Payment,
  PaymentId,
  ResolutionPath,
  ReviewerId,
  Run,
  RunId,
  RunKind,
  RunStatus,
  RunTotals,
  ScoreBreakdown,
  Sha256,
  Tolerance,
  ToleranceChange,
  ToleranceChangeId,
  ToleranceScope,
  Vendor,
  VendorId,
} from '@/lib/types';
import { daysBetween } from './ids';
import { payloadHash } from './journal';
import { paiseFromDigits } from './money';
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
import { EXPECTED_TABLES, TABLES } from './pg-schema';

// DATE stays the `YYYY-MM-DD` text Postgres sent; TIMESTAMPTZ becomes RFC 3339 in UTC.
// BIGINT is left alone on purpose — as a string it still holds every digit.
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value: string) => new Date(value).toISOString());
types.setTypeParser(types.builtins.TIMESTAMP, (value: string) => new Date(`${value}Z`).toISOString());

const POOL_KEY = Symbol.for('holdfast.api.pg-pool');

function pool(): Pool {
  const holder = globalThis as unknown as Record<symbol, Pool | undefined>;
  const existing = holder[POOL_KEY];
  if (existing) return existing;
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('HOLDFAST_REPO=pg requires DATABASE_URL');
  }
  const created = new Pool({ connectionString, max: 4 });
  holder[POOL_KEY] = created;
  return created;
}

type Row = QueryResultRow & Record<string, unknown>;

async function query(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
  const result = await pool().query<Row>(sql, [...params]);
  return result.rows;
}

// ── column readers ──────────────────────────────────────────────────────────────

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const maybeText = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);
const flag = (v: unknown): boolean => v === true || v === 't' || v === 'true';
const count = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const parsed = Number.parseInt(String(v ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (v: unknown, field: string): Paise => paiseFromDigits(String(v ?? '0'), field);
const maybeMoney = (v: unknown, field: string): Paise | null =>
  v === null || v === undefined ? null : money(v, field);

function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

// ── row mappers ─────────────────────────────────────────────────────────────────

function mapVendor(row: Row): Vendor {
  return {
    id: text(row['id']) as VendorId,
    name: text(row['name']),
    normalised_name: text(row['normalised_name']),
    tax_identifier: maybeText(row['tax_identifier']),
  };
}

function mapInvoice(row: Row): Invoice {
  return {
    id: text(row['id']) as InvoiceId,
    reference: text(row['reference']),
    normalised_reference: text(row['normalised_reference']),
    vendor_id: text(row['vendor_id']) as VendorId,
    vendor_name_raw: text(row['vendor_name_raw']),
    invoice_date: text(row['invoice_date']) as IsoDate,
    received_date: text(row['received_date']) as IsoDate,
    due_date: (maybeText(row['due_date']) as IsoDate | null),
    period: text(row['period']),
    gross_paise: money(row['gross_paise'], 'gross_paise'),
    net_paise: money(row['net_paise'], 'net_paise'),
    tax: {
      total_paise: money(row['tax_total_paise'], 'tax_total_paise'),
      igst_paise: money(row['tax_igst_paise'], 'tax_igst_paise'),
      cgst_paise: money(row['tax_cgst_paise'], 'tax_cgst_paise'),
      sgst_paise: money(row['tax_sgst_paise'], 'tax_sgst_paise'),
      cess_paise: money(row['tax_cess_paise'], 'tax_cess_paise'),
    },
    currency: 'INR',
    is_credit_note: flag(row['is_credit_note']),
    recurrence: maybeText(row['recurrence']) as Invoice['recurrence'],
    purchase_order_reference: maybeText(row['purchase_order_reference']),
    created_at: text(row['created_at']) as IsoTimestamp,
  };
}

function mapPayment(row: Row): Payment {
  return {
    id: text(row['id']) as PaymentId,
    value_date: text(row['value_date']) as IsoDate,
    amount_paise: money(row['amount_paise'], 'amount_paise'),
    currency: 'INR',
    narration_raw: text(row['narration_raw']),
    narration_normalised: text(row['narration_normalised']),
    reference_extracted: maybeText(row['reference_extracted']),
    vendor_name_extracted: maybeText(row['vendor_name_extracted']),
    vendor_id: maybeText(row['vendor_id']) as VendorId | null,
    application_status: text(row['application_status']) as ApplicationStatus,
    bank_transaction_id: text(row['bank_transaction_id']),
    created_at: text(row['created_at']) as IsoTimestamp,
  };
}

function mapRun(row: Row): Run {
  return {
    id: text(row['id']) as RunId,
    kind: text(row['kind']) as RunKind,
    status: text(row['status']) as RunStatus,
    started_at: text(row['started_at']) as IsoTimestamp,
    finished_at: maybeText(row['finished_at']) as IsoTimestamp | null,
    dataset_hash: text(row['dataset_hash']) as Sha256,
    thresholds_hash: text(row['thresholds_hash']) as Sha256,
    engine_version: text(row['engine_version']),
    scorer_version: text(row['scorer_version']),
    idempotency_key: text(row['idempotency_key']),
    parent_run_id: maybeText(row['parent_run_id']) as RunId | null,
    feedback_rule_ids: json<FeedbackRuleId[]>(row['feedback_rule_ids'], []),
    totals: json<RunTotals | null>(row['totals'], null),
  };
}

function mapHold(row: Row): Hold {
  return {
    id: text(row['id']) as HoldId,
    run_id: text(row['run_id']) as RunId,
    case_id: text(row['case_id']) as CaseId,
    invoice_id: text(row['invoice_id']) as InvoiceId,
    type: text(row['type']) as HoldType,
    reason: text(row['reason']),
    applied_at: text(row['applied_at']) as IsoTimestamp,
    auto_releasable: flag(row['auto_releasable']),
    blocks_accounting: flag(row['blocks_accounting']),
    severity: text(row['severity']) as Hold['severity'],
    conflicts: json<Conflict[]>(row['conflicts'], []),
    released_by: maybeText(row['released_by']) as ReviewerId | null,
    released_at: maybeText(row['released_at']) as IsoTimestamp | null,
    release_reason: maybeText(row['release_reason']),
  };
}

function mapCandidate(row: Row): MatchCandidate {
  return {
    id: text(row['id']) as MatchCandidateId,
    run_id: text(row['run_id']) as RunId,
    invoice_id: text(row['invoice_id']) as InvoiceId,
    payment_ids: json<PaymentId[]>(row['payment_ids'], []),
    cardinality: text(row['cardinality']) as MatchCandidate['cardinality'],
    score: json<ScoreBreakdown>(row['score'], {} as ScoreBreakdown),
    evidence: json<EvidenceSet>(row['evidence'], {} as EvidenceSet),
    conflicts: json<Conflict[]>(row['conflicts'], []),
    residual_paise: money(row['residual_paise'], 'residual_paise'),
    proposed_by: text(row['proposed_by']) as MatchCandidate['proposed_by'],
    reverified: flag(row['reverified']),
    rank: count(row['rank']),
    created_at: text(row['created_at']) as IsoTimestamp,
  };
}

function mapDecision(row: Row): Decision {
  return {
    id: text(row['id']) as Decision['id'],
    run_id: text(row['run_id']) as RunId,
    case_id: text(row['case_id']) as CaseId,
    invoice_id: text(row['invoice_id']) as InvoiceId,
    action: text(row['action']) as DecisionAction,
    resolution_path: maybeText(row['resolution_path']) as ResolutionPath | null,
    owner_next: {
      role: text(row['owner_role']) as OwnerRole,
      party: maybeText(row['owner_party']),
    },
    reviewer: text(row['reviewer']) as ReviewerId,
    reason: text(row['reason']),
    timestamp: text(row['decided_at']) as IsoTimestamp,
    hold_ids: json<HoldId[]>(row['hold_ids'], []),
    tolerance_change_id: maybeText(row['tolerance_change_id']) as ToleranceChangeId | null,
  };
}

function mapToleranceChange(row: Row): ToleranceChange {
  return {
    id: text(row['id']) as ToleranceChangeId,
    from: json<Tolerance>(row['tolerance_from'], { kind: 'exact' }),
    to: json<Tolerance>(row['tolerance_to'], { kind: 'exact' }),
    scope: json<ToleranceScope>(row['scope'], { kind: 'global' }),
    reviewer: text(row['reviewer']) as ReviewerId,
    reason: text(row['reason']),
    timestamp: text(row['changed_at']) as IsoTimestamp,
    affected_hold_ids: json<HoldId[]>(row['affected_hold_ids'], []),
    decision_id: maybeText(row['decision_id']) as Decision['id'] | null,
    run_id: maybeText(row['run_id']) as RunId | null,
  };
}

function mapFeedbackRule(row: Row): FeedbackRule {
  return {
    id: text(row['id']) as FeedbackRuleId,
    body: json<FeedbackRuleBody>(row['body'], {
      kind: 'reference_pattern',
      pattern: '',
      canonical_form: '',
    }),
    learned_from_case_id: text(row['learned_from_case_id']) as CaseId,
    created_by: text(row['created_by']) as ReviewerId,
    created_at: text(row['created_at']) as IsoTimestamp,
    reason: text(row['reason']),
    active: flag(row['active']),
    deactivated_by: maybeText(row['deactivated_by']) as ReviewerId | null,
    deactivated_at: maybeText(row['deactivated_at']) as IsoTimestamp | null,
  };
}

function mapAuditEntry(row: Row): AuditEntry {
  const entity: EntityRef = {
    entity: text(row['entity_kind']),
    id: text(row['entity_id']),
  } as EntityRef;
  return {
    id: text(row['id']) as AuditEntryId,
    sequence: count(row['sequence']),
    occurred_at: text(row['occurred_at']) as IsoTimestamp,
    recorded_at: text(row['recorded_at']) as IsoTimestamp,
    actor: json<Actor>(row['actor'], { kind: 'system', component: 'unknown' }),
    event: text(row['event']) as AuditEntry['event'],
    entity,
    run_id: maybeText(row['run_id']) as RunId | null,
    case_id: maybeText(row['case_id']) as CaseId | null,
    detail: json<AuditEntry['detail']>(row['detail'], {}),
    payload_hash: text(row['payload_hash']) as Sha256,
    prev_hash: maybeText(row['prev_hash']) as Sha256 | null,
  };
}

function mapOutcome(row: Row): OutcomeRow {
  return {
    run_id: text(row['run_id']) as RunId,
    invoice_id: text(row['invoice_id']) as InvoiceId,
    case_id: maybeText(row['case_id']) as CaseId | null,
    status: text(row['status']) as MatchStatus,
    hold_types: json<HoldType[]>(row['hold_types'], []),
    money_at_risk_paise: money(row['money_at_risk_paise'], 'money_at_risk_paise'),
  };
}

// ── the implementation ──────────────────────────────────────────────────────────

class PgRepository implements Repository {
  readonly kind = 'postgres' as const;

  async status(): Promise<RepositoryStatus> {
    try {
      const rows = await query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_name = ANY($1)`,
        [EXPECTED_TABLES],
      );
      const present = new Set(rows.map((r) => text(r['table_name'])));
      const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
      return {
        kind: this.kind,
        ready: missing.length === 0,
        detail: {
          connected: true,
          tables_expected: EXPECTED_TABLES.length,
          tables_present: present.size,
          tables_missing: missing.join(', '),
          note:
            missing.length === 0
              ? 'schema matches what the API reads'
              : 'the API reads tables that this database does not yet have',
        },
      };
    } catch (err) {
      return {
        kind: this.kind,
        ready: false,
        detail: {
          connected: false,
          error: err instanceof Error ? err.message : 'connection failed',
        },
      };
    }
  }

  // ── runs ──────────────────────────────────────────────────────────────────

  async listRuns(limit: number): Promise<readonly Run[]> {
    const rows = await query(
      `SELECT * FROM ${TABLES.runs} ORDER BY started_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapRun);
  }

  async getRun(id: RunId): Promise<Run | null> {
    const rows = await query(`SELECT * FROM ${TABLES.runs} WHERE id = $1`, [id]);
    const row = rows[0];
    return row === undefined ? null : mapRun(row);
  }

  async getRunByIdempotencyKey(key: string): Promise<Run | null> {
    const rows = await query(`SELECT * FROM ${TABLES.runs} WHERE idempotency_key = $1`, [key]);
    const row = rows[0];
    return row === undefined ? null : mapRun(row);
  }

  async latestRun(): Promise<Run | null> {
    const rows = await query(`SELECT * FROM ${TABLES.runs} ORDER BY started_at DESC LIMIT 1`);
    const row = rows[0];
    return row === undefined ? null : mapRun(row);
  }

  async insertRun(draft: RunDraft): Promise<Run> {
    const rows = await query(
      `INSERT INTO ${TABLES.runs}
         (id, kind, status, started_at, finished_at, dataset_hash, thresholds_hash,
          engine_version, scorer_version, idempotency_key, parent_run_id,
          feedback_rule_ids, totals)
       VALUES ($1, $2, 'pending', $3, NULL, $4, $5, $6, $7, $8, $9, $10::jsonb, NULL)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        draft.id,
        draft.kind,
        draft.started_at,
        draft.dataset_hash,
        draft.thresholds_hash,
        draft.engine_version,
        draft.scorer_version,
        draft.idempotency_key,
        draft.parent_run_id,
        JSON.stringify(draft.feedback_rule_ids),
      ],
    );
    const row = rows[0];
    if (row !== undefined) return mapRun(row);
    // The key was already taken between the read and the write; the existing run wins.
    const existing = await this.getRunByIdempotencyKey(draft.idempotency_key);
    if (existing === null) throw new Error('run insert did not return a row');
    return existing;
  }

  // ── outcomes and queue ────────────────────────────────────────────────────

  async listOutcomes(runId: RunId): Promise<readonly OutcomeRow[]> {
    const rows = await query(`SELECT * FROM ${TABLES.run_outcomes} WHERE run_id = $1`, [runId]);
    return rows.map(mapOutcome);
  }

  private buildQueueFilter(
    runId: RunId,
    q: QueueQuery,
  ): { where: string; params: unknown[] } {
    const params: unknown[] = [runId];
    let where = 'ec.run_id = $1';

    if (q.hold_type !== null) {
      params.push(q.hold_type);
      where += ` AND EXISTS (SELECT 1 FROM ${TABLES.holds} h
                   WHERE h.case_id = ec.case_id AND h."type" = $${params.length})`;
    }
    if (q.blocks_accounting !== null) {
      params.push(q.blocks_accounting);
      where += ` AND COALESCE((SELECT bool_or(h.blocks_accounting) FROM ${TABLES.holds} h
                   WHERE h.case_id = ec.case_id AND h.released_at IS NULL), false)
                 = $${params.length}`;
    }
    if (q.undecided_only) {
      where += ` AND NOT EXISTS (SELECT 1 FROM ${TABLES.decisions} d WHERE d.case_id = ec.case_id)`;
    }
    return { where, params };
  }

  async listExceptionCases(runId: RunId, q: QueueQuery): Promise<QueuePage> {
    const { where, params } = this.buildQueueFilter(runId, q);

    const totals = await query(
      `SELECT COUNT(*) AS matching, COALESCE(SUM(ec.money_at_risk_paise), 0) AS at_risk
         FROM ${TABLES.exception_cases} ec WHERE ${where}`,
      params,
    );
    const totalsRow = totals[0];

    const pageParams = [...params, q.limit, q.offset];
    const rows = await query(
      `SELECT * FROM ${TABLES.exception_cases} ec
        WHERE ${where}
        ORDER BY ec.money_at_risk_paise DESC, ec.case_id ASC
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams,
    );

    const caseIds = rows.map((r) => text(r['case_id']));
    const cases = await this.hydrateCases(runId, rows, caseIds);

    return {
      cases,
      total_matching: count(totalsRow?.['matching']),
      money_at_risk_total: BigInt(String(totalsRow?.['at_risk'] ?? '0')),
    };
  }

  private async hydrateCases(
    runId: RunId,
    rows: readonly Row[],
    caseIds: readonly string[],
  ): Promise<ExceptionCase[]> {
    if (caseIds.length === 0) return [];
    const invoiceIds = rows.map((r) => text(r['invoice_id']));

    const [holdRows, candidateRows, decisionRows] = await Promise.all([
      query(`SELECT * FROM ${TABLES.holds} WHERE case_id = ANY($1)`, [caseIds]),
      query(
        `SELECT * FROM ${TABLES.match_candidates}
          WHERE run_id = $1 AND invoice_id = ANY($2) ORDER BY "rank" ASC`,
        [runId, invoiceIds],
      ),
      query(
        `SELECT * FROM ${TABLES.decisions} WHERE case_id = ANY($1) ORDER BY decided_at ASC`,
        [caseIds],
      ),
    ]);

    const holdsByCase = new Map<string, Hold[]>();
    for (const row of holdRows) {
      const hold = mapHold(row);
      const list = holdsByCase.get(String(hold.case_id)) ?? [];
      list.push(hold);
      holdsByCase.set(String(hold.case_id), list);
    }

    const topByInvoice = new Map<string, MatchCandidate>();
    for (const row of candidateRows) {
      const candidate = mapCandidate(row);
      if (!topByInvoice.has(String(candidate.invoice_id))) {
        topByInvoice.set(String(candidate.invoice_id), candidate);
      }
    }

    const decisionByCase = new Map<string, Decision>();
    for (const row of decisionRows) {
      const decision = mapDecision(row);
      decisionByCase.set(String(decision.case_id), decision);
    }

    const now = new Date().toISOString();
    return rows.map((row) => {
      const caseId = text(row['case_id']);
      const holds = holdsByCase.get(caseId) ?? [];
      const heldSince = text(row['held_since']) as IsoTimestamp;
      return {
        case_id: caseId as CaseId,
        run_id: text(row['run_id']) as RunId,
        invoice_id: text(row['invoice_id']) as InvoiceId,
        money_at_risk_paise: money(row['money_at_risk_paise'], 'money_at_risk_paise'),
        holds,
        held_since: heldSince,
        age_days: daysBetween(String(heldSince), now),
        blocks_accounting: holds.some((h) => h.released_at === null && h.blocks_accounting),
        application_status: text(row['application_status']) as ApplicationStatus,
        top_candidate: topByInvoice.get(text(row['invoice_id'])) ?? null,
        decision: decisionByCase.get(caseId) ?? null,
      };
    });
  }

  async getCaseBundle(caseId: CaseId): Promise<CaseBundle | null> {
    const caseRows = await query(
      `SELECT * FROM ${TABLES.exception_cases} ec WHERE ec.case_id = $1`,
      [caseId],
    );
    const caseRow = caseRows[0];
    if (caseRow === undefined) return null;

    const runId = text(caseRow['run_id']) as RunId;
    const invoiceId = text(caseRow['invoice_id']) as InvoiceId;

    const [exception] = await this.hydrateCases(runId, [caseRow], [String(caseId)]);
    if (exception === undefined) return null;

    const invoiceRows = await query(`SELECT * FROM ${TABLES.invoices} WHERE id = $1`, [invoiceId]);
    const invoiceRow = invoiceRows[0];
    if (invoiceRow === undefined) return null;
    const invoice = mapInvoice(invoiceRow);

    const [vendorRows, candidateRows, decisionRows, auditRows, siblingRows] = await Promise.all([
      query(`SELECT * FROM ${TABLES.vendors} WHERE id = $1`, [invoice.vendor_id]),
      query(
        `SELECT * FROM ${TABLES.match_candidates}
          WHERE run_id = $1 AND invoice_id = $2 ORDER BY "rank" ASC`,
        [runId, invoiceId],
      ),
      query(
        `SELECT * FROM ${TABLES.decisions} WHERE case_id = $1 ORDER BY decided_at ASC`,
        [caseId],
      ),
      query(
        `SELECT * FROM ${TABLES.audit_entries} WHERE case_id = $1 ORDER BY sequence ASC`,
        [caseId],
      ),
      query(
        `SELECT * FROM ${TABLES.invoices} WHERE vendor_id = $1 AND id <> $2`,
        [invoice.vendor_id, invoiceId],
      ),
    ]);

    const candidates = candidateRows.map(mapCandidate);
    const paymentIds = new Set<string>();
    const ruleIds = new Set<string>();
    for (const candidate of candidates) {
      for (const id of candidate.payment_ids) paymentIds.add(String(id));
      for (const evidence of Object.values(candidate.evidence ?? {})) {
        const note = evidence?.normalisation;
        if (note && note.feedback_rule_id !== null) ruleIds.add(String(note.feedback_rule_id));
      }
    }

    const holdIds = exception.holds.map((h) => String(h.id));
    const [paymentRows, toleranceRows, ruleRows] = await Promise.all([
      paymentIds.size === 0
        ? Promise.resolve([] as Row[])
        : query(`SELECT * FROM ${TABLES.payments} WHERE id = ANY($1)`, [[...paymentIds]]),
      holdIds.length === 0
        ? Promise.resolve([] as Row[])
        : query(
            `SELECT * FROM ${TABLES.tolerance_changes}
              WHERE affected_hold_ids ?| $1::text[] ORDER BY changed_at ASC`,
            [holdIds],
          ),
      query(
        `SELECT * FROM ${TABLES.feedback_rules}
          WHERE id = ANY($1) OR learned_from_case_id = $2`,
        [[...ruleIds], caseId],
      ),
    ]);

    return {
      exception,
      invoice,
      vendor: vendorRows[0] === undefined ? null : mapVendor(vendorRows[0]),
      holds: exception.holds,
      candidates,
      payments: paymentRows.map(mapPayment),
      decisions: decisionRows.map(mapDecision),
      tolerance_changes: toleranceRows.map(mapToleranceChange),
      feedback_rules: ruleRows.map(mapFeedbackRule),
      audit: auditRows.map(mapAuditEntry),
      vendor_invoices: siblingRows.map(mapInvoice),
    };
  }

  // ── holds ─────────────────────────────────────────────────────────────────

  async holdPolicies(): Promise<readonly HoldPolicy[]> {
    const rows = await query(`SELECT * FROM ${TABLES.hold_policies} ORDER BY "type" ASC`);
    return rows.map((row) => ({
      type: text(row['type']) as HoldType,
      auto_releasable: flag(row['auto_releasable']),
      blocks_accounting: flag(row['blocks_accounting']),
      default_severity: text(row['default_severity']) as HoldPolicy['default_severity'],
      clause: text(row['clause']),
    }));
  }

  async listHolds(runId: RunId): Promise<readonly Hold[]> {
    const rows = await query(`SELECT * FROM ${TABLES.holds} WHERE run_id = $1`, [runId]);
    return rows.map(mapHold);
  }

  async getHolds(ids: readonly HoldId[]): Promise<readonly Hold[]> {
    if (ids.length === 0) return [];
    const rows = await query(`SELECT * FROM ${TABLES.holds} WHERE id = ANY($1)`, [ids.map(String)]);
    return rows.map(mapHold);
  }

  async releaseHolds(input: HoldReleaseInput): Promise<readonly Hold[]> {
    const rows = await query(
      `UPDATE ${TABLES.holds}
          SET released_by = $2, released_at = $3, release_reason = $4
        WHERE id = ANY($1) AND released_at IS NULL
        RETURNING *`,
      [input.hold_ids.map(String), input.reviewer, input.released_at, input.reason],
    );
    return rows.map(mapHold);
  }

  async getInvoices(ids: readonly InvoiceId[]): Promise<readonly Invoice[]> {
    if (ids.length === 0) return [];
    const rows = await query(`SELECT * FROM ${TABLES.invoices} WHERE id = ANY($1)`, [
      ids.map(String),
    ]);
    return rows.map(mapInvoice);
  }

  // ── decisions ─────────────────────────────────────────────────────────────

  async listDecisions(q: DecisionQuery): Promise<readonly Decision[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (q.run_id !== null) {
      params.push(q.run_id);
      clauses.push(`run_id = $${params.length}`);
    }
    if (q.case_id !== null) {
      params.push(q.case_id);
      clauses.push(`case_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await query(
      `SELECT * FROM ${TABLES.decisions} ${where} ORDER BY decided_at ASC`,
      params,
    );
    return rows.map(mapDecision);
  }

  async insertDecision(draft: DecisionDraft): Promise<Decision> {
    const rows = await query(
      `INSERT INTO ${TABLES.decisions}
         (id, run_id, case_id, invoice_id, action, resolution_path, owner_role, owner_party,
          reviewer, reason, decided_at, hold_ids, tolerance_change_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
       RETURNING *`,
      [
        draft.id,
        draft.run_id,
        draft.case_id,
        draft.invoice_id,
        draft.action,
        draft.resolution_path,
        draft.owner_next.role,
        draft.owner_next.party,
        draft.reviewer,
        draft.reason,
        draft.timestamp,
        JSON.stringify(draft.hold_ids),
        draft.tolerance_change_id,
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('decision insert did not return a row');
    return mapDecision(row);
  }

  // ── tolerance changes ─────────────────────────────────────────────────────

  async listToleranceChanges(runId: RunId | null): Promise<readonly ToleranceChange[]> {
    const where = runId === null ? '' : 'WHERE run_id = $1';
    const params = runId === null ? [] : [runId];
    const rows = await query(
      `SELECT * FROM ${TABLES.tolerance_changes} ${where} ORDER BY changed_at ASC`,
      params,
    );
    return rows.map(mapToleranceChange);
  }

  async insertToleranceChange(draft: ToleranceChangeDraft): Promise<ToleranceChange> {
    const rows = await query(
      `INSERT INTO ${TABLES.tolerance_changes}
         (id, tolerance_from, tolerance_to, scope, reviewer, reason, changed_at,
          affected_hold_ids, decision_id, run_id)
       VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7,$8::jsonb,$9,$10)
       RETURNING *`,
      [
        draft.id,
        JSON.stringify(draft.from),
        JSON.stringify(draft.to),
        JSON.stringify(draft.scope),
        draft.reviewer,
        draft.reason,
        draft.timestamp,
        JSON.stringify(draft.affected_hold_ids),
        draft.decision_id,
        draft.run_id,
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('tolerance change insert did not return a row');
    return mapToleranceChange(row);
  }

  // ── feedback rules ────────────────────────────────────────────────────────

  async listFeedbackRules(activeOnly: boolean): Promise<readonly FeedbackRule[]> {
    const where = activeOnly ? 'WHERE active = true' : '';
    const rows = await query(
      `SELECT * FROM ${TABLES.feedback_rules} ${where} ORDER BY created_at ASC`,
    );
    return rows.map(mapFeedbackRule);
  }

  async getFeedbackRule(id: FeedbackRuleId): Promise<FeedbackRule | null> {
    const rows = await query(`SELECT * FROM ${TABLES.feedback_rules} WHERE id = $1`, [id]);
    const row = rows[0];
    return row === undefined ? null : mapFeedbackRule(row);
  }

  async insertFeedbackRule(draft: FeedbackRuleDraft): Promise<FeedbackRule> {
    const rows = await query(
      `INSERT INTO ${TABLES.feedback_rules}
         (id, body, learned_from_case_id, created_by, created_at, reason, active,
          deactivated_by, deactivated_at)
       VALUES ($1,$2::jsonb,$3,$4,$5,$6,true,NULL,NULL)
       RETURNING *`,
      [
        draft.id,
        JSON.stringify(draft.body),
        draft.learned_from_case_id,
        draft.created_by,
        draft.created_at,
        draft.reason,
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('feedback rule insert did not return a row');
    return mapFeedbackRule(row);
  }

  async deactivateFeedbackRule(
    id: FeedbackRuleId,
    reviewer: ReviewerId,
    at: IsoTimestamp,
  ): Promise<FeedbackRule> {
    const rows = await query(
      `UPDATE ${TABLES.feedback_rules}
          SET active = false, deactivated_by = $2, deactivated_at = $3
        WHERE id = $1
        RETURNING *`,
      [id, reviewer, at],
    );
    const row = rows[0];
    if (row === undefined) throw new Error(`feedback rule "${id}" is not in the database`);
    return mapFeedbackRule(row);
  }

  // ── application status ────────────────────────────────────────────────────

  async recordApplicationStatus(input: ApplicationStatusInput): Promise<ApplicationStatus> {
    await query(
      `UPDATE ${TABLES.exception_cases} SET application_status = $2 WHERE case_id = $1`,
      [input.case_id, input.status],
    );
    if (input.payment_id !== null) {
      await query(`UPDATE ${TABLES.payments} SET application_status = $2 WHERE id = $1`, [
        input.payment_id,
        input.status,
      ]);
    }
    return input.status;
  }

  // ── journal ───────────────────────────────────────────────────────────────

  async listAuditEntries(q: AuditQuery): Promise<readonly AuditEntry[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (q.run_id !== null) {
      params.push(q.run_id);
      clauses.push(`run_id = $${params.length}`);
    }
    if (q.case_id !== null) {
      params.push(q.case_id);
      clauses.push(`case_id = $${params.length}`);
    }
    if (q.event !== null) {
      params.push(q.event);
      clauses.push(`event = $${params.length}`);
    }
    if (q.entity_id !== null) {
      params.push(q.entity_id);
      clauses.push(`entity_id = $${params.length}`);
    }
    if (q.after_sequence !== null) {
      params.push(q.after_sequence);
      clauses.push(`sequence > $${params.length}`);
    }
    params.push(q.limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await query(
      `SELECT * FROM ${TABLES.audit_entries} ${where} ORDER BY sequence ASC LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapAuditEntry);
  }

  /**
   * Appends under an advisory lock, so two concurrent writers cannot mint the same
   * sequence number or chain onto the same predecessor. The journal itself is never
   * updated — the lock only orders the inserts.
   */
  async appendAuditEntries(drafts: readonly AuditDraft[]): Promise<readonly AuditEntry[]> {
    if (drafts.length === 0) return [];
    const client: PoolClient = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('holdfast.audit_journal'))`);
      const head = await client.query<Row>(
        `SELECT sequence, payload_hash FROM ${TABLES.audit_entries}
          ORDER BY sequence DESC LIMIT 1`,
      );
      const headRow = head.rows[0];
      let sequence = count(headRow?.['sequence']);
      let prev: Sha256 | null = headRow === undefined ? null : (text(headRow['payload_hash']) as Sha256);

      const appended: AuditEntry[] = [];
      for (const draft of drafts) {
        sequence += 1;
        const hash = payloadHash(draft, sequence, prev);
        const id = `aud_${hash.slice(0, 24)}`;
        const recordedAt = new Date().toISOString();
        await client.query(
          `INSERT INTO ${TABLES.audit_entries}
             (id, sequence, occurred_at, recorded_at, actor, event, entity_kind, entity_id,
              run_id, case_id, detail, payload_hash, prev_hash)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
          [
            id,
            sequence,
            draft.occurred_at,
            recordedAt,
            JSON.stringify(draft.actor),
            draft.event,
            draft.entity.entity,
            String(draft.entity.id),
            draft.run_id,
            draft.case_id,
            JSON.stringify(draft.detail),
            hash,
            prev,
          ],
        );
        appended.push({
          id: id as AuditEntryId,
          sequence,
          occurred_at: draft.occurred_at,
          recorded_at: recordedAt as IsoTimestamp,
          actor: draft.actor,
          event: draft.event,
          entity: draft.entity,
          run_id: draft.run_id,
          case_id: draft.case_id,
          detail: draft.detail,
          payload_hash: hash,
          prev_hash: prev,
        });
        prev = hash;
      }
      await client.query('COMMIT');
      return appended;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

let instance: PgRepository | null = null;

export function pgRepository(): Repository {
  if (instance === null) instance = new PgRepository();
  return instance;
}
