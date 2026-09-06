-- 001 — closed vocabularies.
--
-- Every `as const` tuple in lib/types.ts becomes a PostgreSQL enum. The contract is a
-- union of string literals; a CHECK constraint would let a typo through until someone
-- read it, an enum makes the typo unrepresentable and shows the permitted set in
-- information_schema for anyone auditing the schema without the TypeScript beside them.
--
-- Ordering inside each type follows lib/types.ts exactly, so `enum_range` reads back as
-- the contract tuple.

CREATE TYPE hold_type AS ENUM (
  'matching',
  'price_variance',
  'quantity_variance',
  'tax_variance',
  'tax_amount_range',
  'dist_variance',
  'duplicate_candidate',
  'no_reference',
  'cardinality_residual',
  'period_deferral',
  'credit_note_crossing'
);

CREATE TYPE conflict_severity AS ENUM ('advisory', 'material', 'blocking');

CREATE TYPE conflict_code AS ENUM (
  'vendor_mismatch',
  'vendor_below_similarity_floor',
  'amount_over_tolerance',
  'amount_over_cap',
  'date_outside_window',
  'reference_absent',
  'reference_mismatch',
  'reference_displaced',
  'tax_split_mismatch',
  'tax_total_mismatch',
  'duplicate_reference',
  'duplicate_vendor_amount_date',
  'residual_unsettled',
  'period_mismatch',
  'credit_note_crosses_period',
  'multiple_candidates_tied',
  'no_candidate_found'
);

-- Four distinct states, deliberately not collapsed: `unapplied` routes to internal
-- correction, `unidentified` routes to customer outreach. Collapsing them destroys the
-- routing decision, which is the product.
CREATE TYPE application_status AS ENUM (
  'applied',
  'unapplied',
  'on_account',
  'unidentified'
);

-- Never approve/reject. The reviewer is asked WHO SHOULD ACT.
CREATE TYPE resolution_path AS ENUM (
  're_application',
  'customer_outreach',
  'internal_correction'
);

CREATE TYPE owner_role AS ENUM (
  'ap_clerk',
  'ap_manager',
  'controller',
  'requisitioner',
  'tax_team',
  'treasury',
  'vendor'
);

CREATE TYPE decision_action AS ENUM (
  'apply_hold',
  'release_hold',
  'change_tolerance',
  'route',
  'record_application_status',
  'create_feedback_rule',
  'escalate'
);

-- `model_proposal` is a nomination, never a verdict. It enters the same scorer as every
-- other candidate and is dropped if it does not clear on its own merits.
CREATE TYPE proposal_source AS ENUM (
  'deterministic_exact',
  'deterministic_fuzzy',
  'cardinality_search',
  'feedback_rule',
  'model_proposal'
);

CREATE TYPE cardinality_kind AS ENUM (
  'one_to_one',
  'one_to_many',
  'many_to_one',
  'many_to_many',
  'partial'
);

CREATE TYPE delta_cause AS ENUM (
  'bank_charge',
  'early_payment_discount',
  'tds_withholding',
  'rounding',
  'partial_settlement',
  'unattributed'
);

CREATE TYPE run_kind AS ENUM ('baseline', 'engine', 'rerun');

CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- A tolerance is a typed, named quantity — never a bare number floating in a comparison.
CREATE TYPE tolerance_kind AS ENUM (
  'exact',
  'absolute_paise',
  'percentage',
  'days',
  'similarity'
);

CREATE TYPE tolerance_scope_kind AS ENUM ('global', 'vendor', 'hold_type', 'invoice');

CREATE TYPE tolerance_direction AS ENUM ('widened', 'narrowed', 'unchanged', 'retyped');

CREATE TYPE feedback_rule_kind AS ENUM (
  'vendor_alias',
  'reference_pattern',
  'duplicate_exemption',
  'delta_attribution'
);

CREATE TYPE recurrence_kind AS ENUM ('monthly', 'quarterly', 'instalment');

CREATE TYPE actor_kind AS ENUM ('human', 'system', 'model');

-- The only two places a generated call may sit. Neither may reach a hold release; the
-- audit_journal constraint in 011 is what makes that a database guarantee, not a habit.
CREATE TYPE llm_call_site AS ENUM ('ingestion_normalisation', 'residual_proposal');

CREATE TYPE audit_event AS ENUM (
  'invoice_ingested',
  'payment_ingested',
  'run_started',
  'run_completed',
  'candidate_scored',
  'hold_applied',
  'hold_released',
  'decision_recorded',
  'tolerance_changed',
  'feedback_rule_created',
  'feedback_rule_deactivated',
  'application_status_changed',
  'proposal_received',
  'proposal_discarded',
  'export_generated'
);

CREATE TYPE entity_kind AS ENUM (
  'invoice',
  'payment',
  'hold',
  'decision',
  'tolerance_change',
  'feedback_rule',
  'match_candidate',
  'run'
);
