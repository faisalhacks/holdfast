-- 009 — feedback_rules.
--
-- A persisted reviewer correction. These are FEEDBACK RULES, never "learning": a rule is a
-- row a named human wrote, readable and revocable, not a weight nobody can inspect. That
-- is a naming rule in AGENTS.md and it is also why this is a table with columns rather
-- than a model artefact.
--
-- `learned_from_case_id` is the provenance column — the case whose review produced the
-- rule — and it is NOT NULL. A mapping that cannot name the case it came from is exactly
-- the unauditable weight we are positioning against.
--
-- There is no delete path. A rule is DEACTIVATED, and deactivation is itself attributed:
-- `feedback_rules_deactivation_is_attributed` makes active = false with no named person
-- and no instant unrepresentable, the same shape as a hold release.
--
-- `FeedbackRuleBody` is a discriminated union and its `delta_attribution` member carries a
-- `Tolerance`, whose `absolute_paise` case is money. So the union is flattened into typed
-- columns for the same reason tolerance_changes is: money is a BIGINT column, never a
-- number inside a JSON document.

CREATE TABLE feedback_rules (
  id                   TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  kind                 feedback_rule_kind NOT NULL,

  -- vendor_alias
  raw_value            TEXT,
  canonical_vendor_id  TEXT,
  -- reference_pattern
  pattern              TEXT,
  canonical_form       TEXT,
  -- duplicate_exemption and delta_attribution
  vendor_id            TEXT,
  recurrence           recurrence_kind,
  -- delta_attribution
  cause                delta_cause,
  bound_kind           tolerance_kind,
  bound_value_paise    BIGINT,
  bound_value_ratio    DOUBLE PRECISION,
  bound_value_days     INTEGER,

  learned_from_case_id TEXT NOT NULL CHECK (length(btrim(learned_from_case_id)) > 0),
  created_by           TEXT NOT NULL CHECK (length(btrim(created_by)) > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason               TEXT NOT NULL CHECK (length(btrim(reason)) > 0),

  active               BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_by       TEXT,
  deactivated_at       TIMESTAMPTZ,

  CONSTRAINT feedback_rules_body_matches_kind CHECK (
    CASE kind
      WHEN 'vendor_alias' THEN
        raw_value IS NOT NULL AND canonical_vendor_id IS NOT NULL
        AND pattern IS NULL AND canonical_form IS NULL AND vendor_id IS NULL
        AND recurrence IS NULL AND cause IS NULL AND bound_kind IS NULL
      WHEN 'reference_pattern' THEN
        pattern IS NOT NULL AND canonical_form IS NOT NULL
        AND raw_value IS NULL AND canonical_vendor_id IS NULL AND vendor_id IS NULL
        AND recurrence IS NULL AND cause IS NULL AND bound_kind IS NULL
      WHEN 'duplicate_exemption' THEN
        vendor_id IS NOT NULL AND recurrence IS NOT NULL
        AND raw_value IS NULL AND canonical_vendor_id IS NULL AND pattern IS NULL
        AND canonical_form IS NULL AND cause IS NULL AND bound_kind IS NULL
      WHEN 'delta_attribution' THEN
        cause IS NOT NULL AND bound_kind IS NOT NULL
        AND raw_value IS NULL AND canonical_vendor_id IS NULL AND pattern IS NULL
        AND canonical_form IS NULL AND recurrence IS NULL
    END
  ),

  CONSTRAINT feedback_rules_bound_value_matches_kind CHECK (
    CASE bound_kind
      WHEN 'exact'          THEN bound_value_paise IS NULL AND bound_value_ratio IS NULL AND bound_value_days IS NULL
      WHEN 'absolute_paise' THEN bound_value_paise IS NOT NULL AND bound_value_ratio IS NULL AND bound_value_days IS NULL
      WHEN 'percentage'     THEN bound_value_paise IS NULL AND bound_value_ratio IS NOT NULL AND bound_value_days IS NULL
      WHEN 'days'           THEN bound_value_paise IS NULL AND bound_value_ratio IS NULL AND bound_value_days IS NOT NULL
      WHEN 'similarity'     THEN bound_value_paise IS NULL AND bound_value_ratio IS NOT NULL AND bound_value_days IS NULL
      ELSE bound_value_paise IS NULL AND bound_value_ratio IS NULL AND bound_value_days IS NULL
    END
  ),

  CONSTRAINT feedback_rules_bound_ratio_is_a_proportion
    CHECK (bound_value_ratio IS NULL OR (bound_value_ratio >= 0 AND bound_value_ratio <= 1)),

  -- Rules are deactivated, never removed — and never anonymously.
  CONSTRAINT feedback_rules_deactivation_is_attributed CHECK (
    (active AND deactivated_by IS NULL AND deactivated_at IS NULL)
    OR (NOT active
        AND deactivated_by IS NOT NULL
        AND length(btrim(deactivated_by)) > 0
        AND deactivated_at IS NOT NULL)
  ),

  CONSTRAINT feedback_rules_deactivated_after_created
    CHECK (deactivated_at IS NULL OR deactivated_at >= created_at)
);

CREATE INDEX feedback_rules_active_kind_idx ON feedback_rules (kind) WHERE active;
CREATE INDEX feedback_rules_case_idx ON feedback_rules (learned_from_case_id);
CREATE INDEX feedback_rules_vendor_idx ON feedback_rules (vendor_id) WHERE vendor_id IS NOT NULL;
-- One live alias per raw value: two active rules mapping the same string to different
-- vendors is a contradiction a reviewer has to resolve, not a race the engine picks.
CREATE UNIQUE INDEX feedback_rules_one_active_alias_idx
  ON feedback_rules (raw_value)
  WHERE kind = 'vendor_alias' AND active;

COMMENT ON TABLE feedback_rules IS
  'Persisted reviewer corrections. Rows a named human wrote, citing the case they came from. Deactivated, never removed.';
COMMENT ON COLUMN feedback_rules.learned_from_case_id IS
  'Provenance: the case whose review produced this rule. NOT NULL, because a mapping that cannot name its origin is unauditable.';
COMMENT ON COLUMN feedback_rules.active IS
  'False means superseded. The row stays, with the reviewer and instant that retired it.';
