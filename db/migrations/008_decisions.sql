-- 008 — decisions.
--
-- Every reviewer action. `reviewer` and `reason` are NOT NULL and non-blank: an
-- unattributed or unexplained decision is not representable, which is the same guarantee
-- the contract makes with non-nullable fields and the same one `holds` makes on release.
--
-- `owner_next` is the routing output and it is not a status. The question put to a human is
-- never approve/reject — it is WHO SHOULD ACT — so `owner_next_role` is NOT NULL on every
-- decision while `resolution_path` is nullable, because an auto-release recorded by the
-- system still has an owner but is not a routing choice.

CREATE TABLE decisions (
  id                  TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  run_id              TEXT NOT NULL REFERENCES runs (id),
  case_id             TEXT NOT NULL CHECK (length(btrim(case_id)) > 0),
  invoice_id          TEXT NOT NULL REFERENCES invoices (id),

  action              decision_action NOT NULL,
  resolution_path     resolution_path,
  owner_next_role     owner_role NOT NULL,
  -- A named individual or team where one is known.
  owner_next_party    TEXT,

  reviewer            TEXT NOT NULL CHECK (length(btrim(reviewer)) > 0),
  reason              TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  decided_at          TIMESTAMPTZ NOT NULL,

  hold_ids            TEXT[] NOT NULL DEFAULT '{}',
  tolerance_change_id TEXT REFERENCES tolerance_changes (id),

  CONSTRAINT decisions_hold_ids_not_null
    CHECK (array_position(hold_ids, NULL) IS NULL),

  -- A hold action names the holds it acted on. Otherwise the journal records that
  -- something was released without recording what.
  CONSTRAINT decisions_hold_action_names_its_holds
    CHECK (action NOT IN ('apply_hold', 'release_hold')
           OR coalesce(array_length(hold_ids, 1), 0) >= 1),

  -- Widening a tolerance is a decision, and the decision points at the record of it.
  CONSTRAINT decisions_tolerance_action_names_its_change
    CHECK ((action = 'change_tolerance') = (tolerance_change_id IS NOT NULL)),

  -- Routing is the product; a route with no path is a status update pretending to be one.
  CONSTRAINT decisions_route_names_a_path
    CHECK (action <> 'route' OR resolution_path IS NOT NULL)
);

-- The other half of the pair. tolerance_changes is written first and the decision that
-- carries it second, so the constraint is deferrable: both rows land in one transaction.
ALTER TABLE tolerance_changes
  ADD CONSTRAINT tolerance_changes_decision_id_fkey
  FOREIGN KEY (decision_id) REFERENCES decisions (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX decisions_case_idx ON decisions (case_id);
CREATE INDEX decisions_invoice_idx ON decisions (invoice_id);
CREATE INDEX decisions_run_idx ON decisions (run_id, decided_at DESC);
CREATE INDEX decisions_reviewer_idx ON decisions (reviewer);
CREATE INDEX decisions_owner_next_role_idx ON decisions (owner_next_role);
CREATE INDEX decisions_tolerance_change_idx ON decisions (tolerance_change_id)
  WHERE tolerance_change_id IS NOT NULL;

COMMENT ON TABLE decisions IS
  'Every reviewer action, always attributed and always explained. resolution_path asks who should act, never approve/reject.';
COMMENT ON COLUMN decisions.resolution_path IS
  'Null only for actions that are not a routing choice, such as an auto-release recorded by the system.';
COMMENT ON COLUMN decisions.decided_at IS
  'Contract field `timestamp`. Renamed because timestamp is a type name in SQL and reads as one at every call site.';
