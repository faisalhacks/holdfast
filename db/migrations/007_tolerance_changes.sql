-- 007 — tolerance_changes. Table 6 of 9.
--
-- THE CLAIM THIS TABLE EXISTS TO MAKE.
-- In the incumbent ERP, widening a tolerance silently auto-releases the matching holds and
-- nothing records that a judgement was made. Here the widening IS the record: what it was,
-- what it became, what it applied to, who did it, why, when, and exactly which holds it
-- released. A tolerance change is a DECISION, not configuration — 008 adds the foreign key
-- that puts it in the same decision stream as any other reviewer action.
--
-- `direction` is stored, not derived at read time, so "show me every tolerance anyone
-- loosened this quarter" is one indexed query rather than an archaeology exercise.

-- A tolerance is always a typed, named quantity. `absolute_paise` carries money and is
-- therefore an integer count of minor units; `percentage` and `similarity` are proportions
-- in [0, 1]; `exact` carries no value at all.
CREATE FUNCTION holdfast_tolerance_valid(t jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(
      t IS NOT NULL
      AND jsonb_typeof(t) = 'object'
      AND (t->>'kind') IS NOT NULL
      AND ((t->>'kind') = ANY (enum_range(NULL::tolerance_kind)::text[]))
      AND CASE t->>'kind'
            WHEN 'exact'          THEN (t->'value') IS NULL
            WHEN 'absolute_paise' THEN holdfast_is_paise_text(t->>'value')
            WHEN 'days'           THEN jsonb_typeof(t->'value') = 'number'
            ELSE jsonb_typeof(t->'value') = 'number'
                 AND (t->>'value')::double precision BETWEEN 0 AND 1
          END,
      false);
  $fn$;

COMMENT ON FUNCTION holdfast_tolerance_valid(jsonb) IS
  'A typed tolerance. An absolute tolerance is money and is integer paise; a percentage or similarity is a proportion in [0, 1].';

CREATE TABLE tolerance_changes (
  id                 TEXT                 PRIMARY KEY,

  -- `from` and `to` are reserved words; the contract fields are ToleranceChange.from/.to.
  from_tolerance     JSONB                NOT NULL,
  to_tolerance       JSONB                NOT NULL,
  from_kind          tolerance_kind       NOT NULL,
  to_kind            tolerance_kind       NOT NULL,

  -- Whether this loosened or tightened. Surfaced prominently in the audit view.
  direction          tolerance_direction  NOT NULL,

  -- ToleranceScope, flattened so the scope can be queried, plus the document itself.
  scope              JSONB                NOT NULL,
  scope_kind         tolerance_scope_kind NOT NULL,
  scope_vendor_id    TEXT,
  scope_hold_type    hold_type,
  scope_invoice_id   TEXT                 REFERENCES invoices (id),

  -- A reviewer is always NAMED, and always says why. Neither is nullable.
  reviewer           TEXT                 NOT NULL,
  reason             TEXT                 NOT NULL,
  -- ToleranceChange.timestamp. `timestamp` is a type name in SQL, so the column is named
  -- for what it records.
  occurred_at        TIMESTAMPTZ          NOT NULL,

  -- The holds this change released. Empty is legal; absent is not.
  affected_hold_ids  TEXT[]               NOT NULL DEFAULT '{}',

  decision_id        TEXT,
  run_id             TEXT                 REFERENCES runs (id),

  created_at         TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT tolerance_changes_id_present       CHECK (btrim(id) <> ''),
  CONSTRAINT tolerance_changes_reviewer_named   CHECK (btrim(reviewer) <> ''),
  CONSTRAINT tolerance_changes_reason_given     CHECK (btrim(reason) <> ''),

  CONSTRAINT tolerance_changes_from_typed CHECK (holdfast_tolerance_valid(from_tolerance)),
  CONSTRAINT tolerance_changes_to_typed   CHECK (holdfast_tolerance_valid(to_tolerance)),

  -- The queryable kind columns cannot drift from the documents they summarise.
  CONSTRAINT tolerance_changes_from_kind_agrees CHECK ((from_tolerance->>'kind') = from_kind::text),
  CONSTRAINT tolerance_changes_to_kind_agrees   CHECK ((to_tolerance->>'kind')   = to_kind::text),
  CONSTRAINT tolerance_changes_scope_kind_agrees CHECK ((scope->>'kind') = scope_kind::text),

  -- A retype is exactly a change of kind, and a change of kind is exactly a retype.
  CONSTRAINT tolerance_changes_retype_is_a_kind_change CHECK (
    (direction = 'retyped') = (from_kind <> to_kind)
  ),

  -- A scope names precisely the thing it applies to and nothing else.
  CONSTRAINT tolerance_changes_scope_is_specific CHECK (
    CASE scope_kind
      WHEN 'global'    THEN scope_vendor_id IS NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NULL
      WHEN 'vendor'    THEN scope_vendor_id IS NOT NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NULL
      WHEN 'hold_type' THEN scope_vendor_id IS NULL AND scope_hold_type IS NOT NULL AND scope_invoice_id IS NULL
      WHEN 'invoice'   THEN scope_vendor_id IS NULL AND scope_hold_type IS NULL AND scope_invoice_id IS NOT NULL
    END
  )
);

CREATE INDEX tolerance_changes_reviewer_idx ON tolerance_changes (reviewer);
CREATE INDEX tolerance_changes_when_idx     ON tolerance_changes (occurred_at DESC);
CREATE INDEX tolerance_changes_run_idx      ON tolerance_changes (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX tolerance_changes_scope_idx    ON tolerance_changes (scope_kind);
CREATE INDEX tolerance_changes_holds_gin    ON tolerance_changes USING GIN (affected_hold_ids);

-- The question the incumbent cannot answer: who loosened a tolerance, when, and what did
-- it let through.
CREATE INDEX tolerance_changes_widened_idx ON tolerance_changes (occurred_at DESC)
  WHERE direction = 'widened';

COMMENT ON TABLE  tolerance_changes IS 'Widening a tolerance is a recorded judgement: reviewer, reason, instant, scope and the exact holds it released.';
COMMENT ON COLUMN tolerance_changes.direction IS 'widened / narrowed / unchanged / retyped. Stored so loosening is one query away.';
COMMENT ON COLUMN tolerance_changes.affected_hold_ids IS 'The holds this change released. Empty is legal; absent is not.';
