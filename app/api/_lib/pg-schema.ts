// What the Postgres repository expects to find.
//
// `db/**` is built by another worker and had not landed when these routes were written,
// so the API states its expectations HERE, in one file, rather than scattering assumed
// column names through a dozen queries. If the migrations name something differently,
// this is the only file that changes.
//
// Shape rules the queries assume:
//   * every monetary column is BIGINT and its name ends in `_paise`
//   * nested contract objects (conflicts, score, evidence, actor, scope, detail, a
//     tolerance, a feedback rule body, an id list) are JSONB holding exactly the object
//     `lib/types.ts` declares
//   * dates are DATE, instants are TIMESTAMPTZ
//   * the journal is append-only by GRANT; nothing here issues an update against it
//
// GET /api/meta reports which of these tables the connected database actually has, so a
// mismatch is visible in one request rather than at the first query that needs it.

export const TABLES = {
  vendors: 'vendors',
  invoices: 'invoices',
  payments: 'payments',
  runs: 'runs',
  holds: 'holds',
  hold_policies: 'hold_policies',
  match_candidates: 'match_candidates',
  exception_cases: 'exception_cases',
  run_outcomes: 'run_outcomes',
  decisions: 'decisions',
  tolerance_changes: 'tolerance_changes',
  feedback_rules: 'feedback_rules',
  audit_entries: 'audit_entries',
} as const;

export const EXPECTED_TABLES: readonly string[] = Object.values(TABLES);

/**
 * Columns the queries name, by table. Published at /api/meta beside the presence probe so
 * whoever wires the schema can diff it against the migrations without reading this code.
 */
export const EXPECTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  vendors: ['id', 'name', 'normalised_name', 'tax_identifier'],
  invoices: [
    'id',
    'reference',
    'normalised_reference',
    'vendor_id',
    'vendor_name_raw',
    'invoice_date',
    'received_date',
    'due_date',
    'period',
    'gross_paise',
    'net_paise',
    'tax_total_paise',
    'tax_igst_paise',
    'tax_cgst_paise',
    'tax_sgst_paise',
    'tax_cess_paise',
    'currency',
    'is_credit_note',
    'recurrence',
    'purchase_order_reference',
    'created_at',
  ],
  payments: [
    'id',
    'value_date',
    'amount_paise',
    'currency',
    'narration_raw',
    'narration_normalised',
    'reference_extracted',
    'vendor_name_extracted',
    'vendor_id',
    'application_status',
    'bank_transaction_id',
    'created_at',
  ],
  runs: [
    'id',
    'kind',
    'status',
    'started_at',
    'finished_at',
    'dataset_hash',
    'thresholds_hash',
    'engine_version',
    'scorer_version',
    'idempotency_key',
    'parent_run_id',
    'feedback_rule_ids',
    'totals',
  ],
  holds: [
    'id',
    'run_id',
    'case_id',
    'invoice_id',
    'type',
    'reason',
    'applied_at',
    'auto_releasable',
    'blocks_accounting',
    'severity',
    'conflicts',
    'released_by',
    'released_at',
    'release_reason',
  ],
  hold_policies: ['type', 'auto_releasable', 'blocks_accounting', 'default_severity', 'clause'],
  match_candidates: [
    'id',
    'run_id',
    'invoice_id',
    'payment_ids',
    'cardinality',
    'score',
    'evidence',
    'conflicts',
    'residual_paise',
    'proposed_by',
    'reverified',
    'rank',
    'created_at',
  ],
  exception_cases: [
    'case_id',
    'run_id',
    'invoice_id',
    'money_at_risk_paise',
    'held_since',
    'application_status',
  ],
  run_outcomes: ['run_id', 'invoice_id', 'case_id', 'status', 'hold_types', 'money_at_risk_paise'],
  decisions: [
    'id',
    'run_id',
    'case_id',
    'invoice_id',
    'action',
    'resolution_path',
    'owner_role',
    'owner_party',
    'reviewer',
    'reason',
    'decided_at',
    'hold_ids',
    'tolerance_change_id',
  ],
  tolerance_changes: [
    'id',
    'tolerance_from',
    'tolerance_to',
    'scope',
    'reviewer',
    'reason',
    'changed_at',
    'affected_hold_ids',
    'decision_id',
    'run_id',
  ],
  feedback_rules: [
    'id',
    'body',
    'learned_from_case_id',
    'created_by',
    'created_at',
    'reason',
    'active',
    'deactivated_by',
    'deactivated_at',
  ],
  audit_entries: [
    'id',
    'sequence',
    'occurred_at',
    'recorded_at',
    'actor',
    'event',
    'entity_kind',
    'entity_id',
    'run_id',
    'case_id',
    'detail',
    'payload_hash',
    'prev_hash',
  ],
};
