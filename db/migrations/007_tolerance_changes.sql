-- 007 — tolerance_changes.
--
-- In the incumbent ERP, widening a tolerance silently auto-releases matching holds and
-- nothing records that a judgement was made. Here the widening IS the record: what it was,
-- what it became, what it applied to, who did it, why, when, and exactly which holds it
-- released. This is the project's strongest original claim, and the schema is where it has
-- to survive.
--
-- Three design points carry it:
--
--   1. `Tolerance` is a discriminated union whose `absolute_paise` member is money, so the
--      union is flattened into typed columns. A tolerance stored as JSON would put rupees
--      in a blob, and `numeric` would put them in a float. Both are the same bug wearing
--      different clothes.
--   2. `reviewer` and `reason` are NOT NULL and non-blank. An anonymous or unexplained
--      tolerance change is not representable.
--   3. `direction` is GENERATED, not supplied. Whether a change loosened or tightened is
--      computed by the database from the two values; the person making the change does not
--      get to describe their own edit. Note the similarity case: a similarity tolerance is
--      a FLOOR, so raising it narrows. Getting that backwards would let the one change we
--      most want surfaced be filed as a tightening.

CREATE TABLE tolerance_changes (
  id                 TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),

  from_kind          tolerance_kind NOT NULL,
  from_value_paise   BIGINT,
  from_value_ratio   DOUBLE PRECISION,
  from_value_days    INTEGER,

  to_kind            tolerance_kind NOT NULL,
  to_value_paise     BIGINT,
  to_value_ratio     DOUBLE PRECISION,
  to_value_days      INTEGER,

  scope_kind         tolerance_scope_kind NOT NULL,
  scope_vendor_id    TEXT,
  scope_hold_type    hold_type,
  scope_invoice_id   TEXT REFERENCES invoices (id),

  reviewer           TEXT NOT NULL CHECK (length(btrim(reviewer)) > 0),
  reason             TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_at         TIMESTAMPTZ NOT NULL,

  -- The holds this change released. Empty is legal; absent is not.
  affected_hold_ids  TEXT[] NOT NULL DEFAULT '{}',

  -- FK added in 008: decisions and tolerance_changes reference each other.
  decision_id        TEXT,
  run_id             TEXT REFERENCES runs (id),

  -- Loosened or tightened, computed from the values rather than declared by the reviewer.
  direction          tolerance_direction GENERATED ALWAYS AS (
    CASE
      WHEN from_kind <> to_kind THEN 'retyped'::tolerance_direction
      WHEN from_kind = 'exact' THEN 'unchanged'::tolerance_direction
      WHEN from_kind = 'absolute_paise' THEN
        CASE WHEN to_value_paise > from_value_paise THEN 'widened'::tolerance_direction
             WHEN to_value_paise < from_value_paise THEN 'narrowed'::tolerance_direction
             ELSE 'unchanged'::tolerance_direction END
      WHEN from_kind = 'percentage' THEN
        CASE WHEN to_value_ratio > from_value_ratio THEN 'widened'::tolerance_direction
             WHEN to_value_ratio < from_value_ratio THEN 'narrowed'::tolerance_direction
             ELSE 'unchanged'::tolerance_direction END
      WHEN from_kind = 'days' THEN
        CASE WHEN to_value_days > from_value_days THEN 'widened'::tolerance_direction
             WHEN to_value_days < from_value_days THEN 'narrowed'::tolerance_direction
             ELSE 'unchanged'::tolerance_direction END
      WHEN from_kind = 'similarity' THEN
        -- A similarity tolerance is a FLOOR. Raising it makes the test harder to pass.
        CASE WHEN to_value_ratio < from_value_ratio THEN 'widened'::tolerance_direction
             WHEN to_value_ratio > from_value_ratio THEN 'narrowed'::tolerance_direction
             ELSE 'unchanged'::tolerance_direction END
      ELSE 'unchanged'::tolerance_direction
    END
  ) STORED,

  CONSTRAINT tolerance_changes_from_value_matches_kind CHECK (
    CASE from_kind
      WHEN 'exact'          THEN from_value_paise IS NULL AND from_value_ratio IS NULL AND from_value_days IS NULL
      WHEN 'absolute_paise' THEN from_value_paise IS NOT NULL AND from_value_ratio IS NULL AND from_value_days IS NULL
      WHEN 'percentage'     THEN from_value_paise IS NULL AND from_value_ratio IS NOT NULL AND from_value_days IS NULL
      WHEN 'days'           THEN from_value_paise IS NULL AND from_value_ratio IS NULL AND from_value_days IS NOT NULL
      WHEN 'similarity'     THEN from_value_paise IS NULL AND from_value_ratio IS NOT NULL AND from_value_days IS NULL
    END
  ),

  CONSTRAINT tolerance_changes_to_value_matches_kind CHECK (
    CASE to_kind
      WHEN 'exact'          THEN to_value_paise IS NULL AND to_value_ratio IS NULL AND to_value_days IS NULL
      WHEN 'absolute_paise' THEN to_value_paise IS NOT NULL AND to_value_ratio IS NULL AND to_value_days IS NULL
      WHEN 'percentage'     THEN to_value_paise IS NULL AND to_value_ratio IS NOT NULL AND to_value_days IS NULL
      WHEN 'days'           THEN to_value_paise IS NULL AND to_value_ratio IS NULL AND to_value_days IS NOT NULL
      WHEN 'similarity'     THEN to_value_paise IS NULL AND to_value_ratio IS NOT NULL AND to_value_days IS NULL
    END
  ),

  -- Ratios are proportions in [0, 1] on both sides of the change.
  CONSTRAINT tolerance_changes_ratios_are_proportions CHECK (
    (from_value_ratio IS NULL OR (from_value_ratio >= 0 AND from_value_ratio <= 1))
    AND (to_value_ratio IS NULL OR (to_value_ratio >= 0 AND to_value_ratio <= 1))
  ),

  -- A change is scoped, and the scope is part of the record.
  CONSTRAINT tolerance_changes_scope_matches_kind CHECK (
    CASE scope_kind
      WHEN 'global'    THEN scope_vendor_id IS NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NULL
      WHEN 'vendor'    THEN scope_vendor_id IS NOT NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NULL
      WHEN 'hold_type' THEN scope_vendor_id IS NULL AND scope_hold_type IS NOT NULL AND scope_invoice_id IS NULL
      WHEN 'invoice'   THEN scope_vendor_id IS NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NOT NULL
    END
  ),

  CONSTRAINT tolerance_changes_affected_hold_ids_not_null
    CHECK (array_position(affected_hold_ids, NULL) IS NULL)
);

CREATE INDEX tolerance_changes_run_idx ON tolerance_changes (run_id);
CREATE INDEX tolerance_changes_reviewer_idx ON tolerance_changes (reviewer);
CREATE INDEX tolerance_changes_changed_at_idx ON tolerance_changes (changed_at DESC);
-- The audit view opens on this: every loosening, most recent first.
CREATE INDEX tolerance_changes_widened_idx ON tolerance_changes (changed_at DESC)
  WHERE direction = 'widened';

COMMENT ON TABLE tolerance_changes IS
  'A tolerance change recorded as a decision: from, to, scope, reviewer, reason, instant and the holds it released.';
COMMENT ON COLUMN tolerance_changes.direction IS
  'Generated from the two values. A similarity tolerance is a floor, so raising it narrows rather than widens.';
COMMENT ON COLUMN tolerance_changes.affected_hold_ids IS
  'The holds this change released. Empty is legal; absent is not, which is why the column is NOT NULL with a default.';
COMMENT ON COLUMN tolerance_changes.changed_at IS
  'Contract field `timestamp`. Renamed here because timestamp is a type name in SQL and reads as one at every call site.';
