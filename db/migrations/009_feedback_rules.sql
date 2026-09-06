-- 009 — feedback_rules. Table 8 of 9.
--
-- A persisted reviewer correction. These are FEEDBACK RULES, never "learning": a rule is a
-- row a named human wrote, readable and revocable, not a weight nobody can inspect.
--
-- `learned_from_case_id` is the provenance column — the case whose review produced the
-- rule. A rule with no provenance is indistinguishable from a tuning knob, so it is
-- NOT NULL.
--
-- Rules are DEACTIVATED, never removed. There is no delete path in this system, and the
-- constraint below is what makes that true rather than merely intended: deactivating a
-- rule requires a named person and an instant, and the row stays.

CREATE TABLE feedback_rules (
  id                    TEXT               PRIMARY KEY,

  kind                  feedback_rule_kind NOT NULL,
  -- FeedbackRuleBody, discriminated on `kind`.
  body                  JSONB              NOT NULL,

  learned_from_case_id  TEXT               NOT NULL,

  created_by            TEXT               NOT NULL,
  created_at            TIMESTAMPTZ        NOT NULL,
  reason                TEXT               NOT NULL,

  active                BOOLEAN            NOT NULL DEFAULT true,
  deactivated_by        TEXT,
  deactivated_at        TIMESTAMPTZ,

  CONSTRAINT feedback_rules_id_present     CHECK (btrim(id) <> ''),
  CONSTRAINT feedback_rules_author_named   CHECK (btrim(created_by) <> ''),
  CONSTRAINT feedback_rules_reason_given   CHECK (btrim(reason) <> ''),
  CONSTRAINT feedback_rules_has_provenance CHECK (btrim(learned_from_case_id) <> ''),

  CONSTRAINT feedback_rules_body_is_object CHECK (jsonb_typeof(body) = 'object'),
  -- The discriminant column and the document's own discriminant are the same value.
  CONSTRAINT feedback_rules_body_kind_agrees CHECK ((body->>'kind') = kind::text),

  -- Deactivation is the only way out, and it is attributed. An inactive rule with no
  -- named deactivator would be a removal wearing a flag.
  CONSTRAINT feedback_rules_deactivation_is_attributed CHECK (
    (active AND deactivated_by IS NULL AND deactivated_at IS NULL)
    OR
    (NOT active AND deactivated_by IS NOT NULL AND deactivated_at IS NOT NULL
     AND btrim(deactivated_by) <> '')
  ),

  CONSTRAINT feedback_rules_deactivated_after_created CHECK (
    deactivated_at IS NULL OR deactivated_at >= created_at
  )
);

-- The rules a run actually applies.
CREATE INDEX feedback_rules_active_idx ON feedback_rules (kind) WHERE active;
CREATE INDEX feedback_rules_case_idx   ON feedback_rules (learned_from_case_id);
CREATE INDEX feedback_rules_author_idx ON feedback_rules (created_by, created_at DESC);

-- A vendor alias is looked up by its raw string on every ingested document.
CREATE INDEX feedback_rules_vendor_alias_idx
  ON feedback_rules ((body->>'raw_value'))
  WHERE kind = 'vendor_alias' AND active;

COMMENT ON TABLE  feedback_rules IS 'Persisted reviewer corrections. Rules are rows a named human wrote — readable, revocable, and deactivated rather than removed.';
COMMENT ON COLUMN feedback_rules.learned_from_case_id IS 'Provenance: the reviewed case that produced this rule.';
COMMENT ON COLUMN feedback_rules.active IS 'Deactivation is attributed and reversible. Rows are never removed.';
