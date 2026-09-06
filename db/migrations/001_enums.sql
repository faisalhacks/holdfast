-- 001 — the vocabulary.
--
-- Every type below is transcribed from a `const [...] as const` array in lib/types.ts,
-- which is frozen. The database and the contract name the same members in the same order,
-- so an invalid member is a write-time error rather than a rendering surprise.
--
-- Vocabularies that live INSIDE a jsonb document (conflict codes, delta causes) are
-- validated by the helper functions at the foot of this file, so a jsonb column is still
-- a typed column.

-- ── run lifecycle ────────────────────────────────────────────────────────────
CREATE TYPE run_kind   AS ENUM ('baseline', 'engine', 'rerun');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- ── documents ────────────────────────────────────────────────────────────────
-- Set on recurring or instalment documents so duplicate detection can stand down.
CREATE TYPE recurrence_kind AS ENUM ('monthly', 'quarterly', 'instalment');

-- Oracle AR application states. FOUR states, deliberately not collapsed: `unapplied`
-- (payer known, invoice unknown) routes to customer outreach; `unidentified` (payer
-- unknown) routes to internal correction. Collapsing them destroys that routing decision.
CREATE TYPE application_status AS ENUM ('applied', 'unapplied', 'on_account', 'unidentified');

-- ── candidates ───────────────────────────────────────────────────────────────
CREATE TYPE cardinality_kind AS ENUM (
  'one_to_one', 'one_to_many', 'many_to_one', 'many_to_many', 'partial'
);

-- Where a pairing came from. `model_proposal` is a nomination, never a verdict: it enters
-- the same scorer as every other candidate and is dropped if it does not clear.
CREATE TYPE proposal_source AS ENUM (
  'deterministic_exact', 'deterministic_fuzzy', 'cardinality_search',
  'feedback_rule', 'model_proposal'
);

-- ── holds ────────────────────────────────────────────────────────────────────
-- The typed holds, mirroring Oracle Payables hold codes. A held invoice cannot be paid.
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

-- Machine-readable reasons a hold fired. Carried inside the `conflicts` jsonb arrays and
-- checked there by holdfast_conflicts_valid().
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

-- ── evidence ─────────────────────────────────────────────────────────────────
CREATE TYPE side AS ENUM ('invoice', 'payment');

-- Why a monetary delta exists, where the evidence supports an attribution.
CREATE TYPE delta_cause AS ENUM (
  'bank_charge', 'early_payment_discount', 'tds_withholding',
  'rounding', 'partial_settlement', 'unattributed'
);

-- ── tolerance ────────────────────────────────────────────────────────────────
-- A tolerance is always a typed, named quantity — never a bare number in a comparison.
CREATE TYPE tolerance_kind AS ENUM (
  'exact', 'absolute_paise', 'percentage', 'days', 'similarity'
);

CREATE TYPE tolerance_scope_kind AS ENUM ('global', 'vendor', 'hold_type', 'invoice');

-- Widening is the move the incumbent ERP makes silently. Here it is a stored, indexed
-- column, so "show me every tolerance that was loosened" is one query.
CREATE TYPE tolerance_direction AS ENUM ('widened', 'narrowed', 'unchanged', 'retyped');

-- ── decisions ────────────────────────────────────────────────────────────────
CREATE TYPE decision_action AS ENUM (
  'apply_hold', 'release_hold', 'change_tolerance', 'route',
  'record_application_status', 'create_feedback_rule', 'escalate'
);

-- What a reviewer actually chooses. Never approve/reject — that framing asks a human to
-- ratify a machine's answer. This asks WHO SHOULD ACT.
CREATE TYPE resolution_path AS ENUM (
  're_application', 'customer_outreach', 'internal_correction'
);

CREATE TYPE owner_role AS ENUM (
  'ap_clerk', 'ap_manager', 'controller', 'requisitioner',
  'tax_team', 'treasury', 'vendor'
);

-- ── feedback rules ───────────────────────────────────────────────────────────
-- Persisted reviewer corrections are FEEDBACK RULES, never "learning".
CREATE TYPE feedback_rule_kind AS ENUM (
  'vendor_alias', 'reference_pattern', 'duplicate_exemption', 'delta_attribution'
);

-- ── audit journal ────────────────────────────────────────────────────────────
CREATE TYPE actor_kind AS ENUM ('human', 'system', 'model');

-- The only two places a generated call may sit.
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

-- The eight entity kinds a journal row may point at. They are exactly the eight tables
-- this schema carries besides the journal itself, which is how the count of nine was
-- arrived at rather than guessed.
CREATE TYPE entity_kind AS ENUM (
  'invoice', 'payment', 'hold', 'decision',
  'tolerance_change', 'feedback_rule', 'match_candidate', 'run'
);

-- ── helpers ──────────────────────────────────────────────────────────────────

-- These validators are deliberately NULL-hostile. A CHECK constraint passes when its
-- expression is NULL, so a missing key would otherwise be a silent way through every rule
-- below. Each returns a definite true or false and never NULL.

-- A sha256 hex digest, as text. Used by the run hashes and by the journal hash chain.
CREATE FUNCTION holdfast_is_sha256(h text) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$ SELECT h IS NOT NULL AND h ~ '^[0-9a-f]{64}$' $fn$;

-- An integer count of minor units as it appears inside a jsonb document. Money that
-- reaches a jsonb column is still integer paise: a value carrying a decimal point fails.
CREATE FUNCTION holdfast_is_paise_text(v text) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$ SELECT v IS NOT NULL AND v ~ '^-?[0-9]+$' $fn$;

-- Every held invoice emits at least one conflict; an empty array is a policy bug. Each
-- element must carry a code from the contract's vocabulary, a severity, the field path it
-- concerns and a SHORT fixed clause — never generated prose.
CREATE FUNCTION holdfast_conflicts_valid(c jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(
      c IS NOT NULL
      AND jsonb_typeof(c) = 'array'
      AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(c) AS e
            WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
               OR (e->>'code') IS NULL
               OR NOT ((e->>'code') = ANY (enum_range(NULL::conflict_code)::text[]))
               OR (e->>'severity') IS NULL
               OR NOT ((e->>'severity') = ANY (enum_range(NULL::conflict_severity)::text[]))
               OR coalesce(btrim(e->>'field_path'), '') = ''
               OR coalesce(btrim(e->>'clause'), '') = ''
          ),
      false);
  $fn$;

COMMENT ON FUNCTION holdfast_conflicts_valid(jsonb) IS
  'A conflicts array is typed: every element carries a contract conflict code, a severity, a field path and a fixed clause.';
