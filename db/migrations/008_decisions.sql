-- 008 — decisions. Table 7 of 9.
--
-- Every reviewer action, in one stream. `reviewer` and `reason` are NOT NULL: an
-- unattributed or unexplained decision is not representable in this schema.
--
-- The routing output is `owner_role` + `owner_party` — WHO SHOULD ACT — rather than an
-- approve/reject flag. Asking a human to ratify a machine's answer is the framing this
-- product exists to avoid, and there is no column here to record one.

CREATE TABLE decisions (
  id                   TEXT            PRIMARY KEY,

  run_id               TEXT            NOT NULL REFERENCES runs (id),
  case_id              TEXT            NOT NULL,
  invoice_id           TEXT            NOT NULL REFERENCES invoices (id),

  action               decision_action NOT NULL,
  -- Null only for actions that are not a routing choice (an auto-release recorded by the
  -- system, for instance).
  resolution_path      resolution_path,

  -- OwnerNext, flattened. Who acts now.
  owner_role           owner_role      NOT NULL,
  owner_party          TEXT,

  reviewer             TEXT            NOT NULL,
  reason               TEXT            NOT NULL,
  -- Decision.timestamp; `timestamp` is a type name in SQL.
  occurred_at          TIMESTAMPTZ     NOT NULL,

  hold_ids             TEXT[]          NOT NULL DEFAULT '{}',
  tolerance_change_id  TEXT,

  created_at           TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT decisions_id_present     CHECK (btrim(id) <> ''),
  CONSTRAINT decisions_case_present   CHECK (btrim(case_id) <> ''),
  CONSTRAINT decisions_reviewer_named CHECK (btrim(reviewer) <> ''),
  CONSTRAINT decisions_reason_given   CHECK (btrim(reason) <> ''),

  -- A hold action names the holds it acted on.
  CONSTRAINT decisions_hold_action_names_holds CHECK (
    action NOT IN ('apply_hold', 'release_hold')
    OR coalesce(array_length(hold_ids, 1), 0) >= 1
  ),

  -- A tolerance change is a decision, and it points at the change it made. Without this
  -- the two records could drift apart, which is exactly the silent widening we criticise.
  CONSTRAINT decisions_tolerance_action_names_change CHECK (
    (action = 'change_tolerance') = (tolerance_change_id IS NOT NULL)
  )
);

-- decisions <-> tolerance_changes point at each other. Both sides are deferrable so a
-- reviewer action and the change it made can be written in either order inside one
-- transaction, and neither can be left dangling at commit.
ALTER TABLE decisions
  ADD CONSTRAINT decisions_tolerance_change_fk
  FOREIGN KEY (tolerance_change_id) REFERENCES tolerance_changes (id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE tolerance_changes
  ADD CONSTRAINT tolerance_changes_decision_fk
  FOREIGN KEY (decision_id) REFERENCES decisions (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX decisions_run_idx      ON decisions (run_id);
CREATE INDEX decisions_invoice_idx  ON decisions (invoice_id);
CREATE INDEX decisions_case_idx     ON decisions (case_id);
CREATE INDEX decisions_reviewer_idx ON decisions (reviewer, occurred_at DESC);
CREATE INDEX decisions_action_idx   ON decisions (action);
CREATE INDEX decisions_holds_gin    ON decisions USING GIN (hold_ids);

COMMENT ON TABLE  decisions IS 'Every reviewer action. Reviewer and reason are non-nullable: an unexplained decision cannot be stored.';
COMMENT ON COLUMN decisions.owner_role IS 'Who acts next. Routing is the product; this is the field it lands in.';
COMMENT ON COLUMN decisions.tolerance_change_id IS 'Present exactly when the action is change_tolerance.';
