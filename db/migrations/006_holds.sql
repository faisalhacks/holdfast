-- 006 — holds. Table 5 of 9.
--
-- The domain object is a HOLD, not a match verdict. A held invoice cannot be paid.
--
--   auto_releasable   — the hold lifts by itself once the condition resolves.
--   blocks_accounting — while true, no accounting entry may be created for the invoice.
--                       Some holds stop payment but permit accrual; that distinction is
--                       Oracle's and it is why this reads as an AP system rather than a
--                       match flag.
--
-- RELEASE IS NEVER SILENT. The three released_* columns move together: a released hold
-- always carries a named releaser, an instant AND a reason. That is the ActiveHold /
-- ReleasedHold union from lib/types.ts, expressed as a constraint rather than a comment,
-- so a release with a blank reason cannot be written at all.

CREATE TABLE holds (
  id                 TEXT              PRIMARY KEY,

  run_id             TEXT              NOT NULL REFERENCES runs (id),
  -- The unit of review: one invoice under examination in one run. Derived from
  -- (run_id, invoice_id) rather than given a table of its own.
  case_id            TEXT              NOT NULL,
  invoice_id         TEXT              NOT NULL REFERENCES invoices (id),

  type               hold_type         NOT NULL,
  -- Short fixed clause naming the condition. Not generated prose.
  reason             TEXT              NOT NULL,

  applied_at         TIMESTAMPTZ       NOT NULL,

  auto_releasable    BOOLEAN           NOT NULL,
  blocks_accounting  BOOLEAN           NOT NULL,
  severity           conflict_severity NOT NULL,

  -- At least one machine-readable reason this hold fired.
  conflicts          JSONB             NOT NULL,

  -- Null while held. A named human, or the system for an auto-release.
  released_by        TEXT,
  released_at        TIMESTAMPTZ,
  release_reason     TEXT,

  CONSTRAINT holds_id_present      CHECK (btrim(id) <> ''),
  CONSTRAINT holds_case_present    CHECK (btrim(case_id) <> ''),
  CONSTRAINT holds_reason_present  CHECK (btrim(reason) <> ''),

  -- A held invoice with no conflict is a policy bug. It is not merely counted here, it is
  -- refused: `RunTotals.held_invoices_without_conflict` is 0 by construction.
  CONSTRAINT holds_emit_a_conflict CHECK (
    jsonb_array_length(conflicts) >= 1 AND holdfast_conflicts_valid(conflicts)
  ),

  -- The whole claim, in one constraint.
  CONSTRAINT holds_release_is_never_silent CHECK (
    (released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)
    OR
    (released_by IS NOT NULL AND released_at IS NOT NULL
     AND release_reason IS NOT NULL
     AND btrim(released_by) <> '' AND btrim(release_reason) <> '')
  ),

  CONSTRAINT holds_released_after_applied CHECK (released_at IS NULL OR released_at >= applied_at)
);

-- Oracle applies a given hold code to an invoice once. Two `price_variance` holds on one
-- invoice in one run would double-count the exception queue.
CREATE UNIQUE INDEX holds_run_invoice_type_uq ON holds (run_id, invoice_id, type);

CREATE INDEX holds_invoice_idx  ON holds (invoice_id);
CREATE INDEX holds_run_type_idx ON holds (run_id, type);
CREATE INDEX holds_case_idx     ON holds (case_id);

-- The working set: what is still held. The exception queue reads this.
CREATE INDEX holds_active_idx ON holds (run_id, invoice_id) WHERE released_at IS NULL;

-- Holds that a named human had to release, which is the number that says how much review
-- the automation actually cost.
CREATE INDEX holds_human_released_idx ON holds (released_by, released_at)
  WHERE released_at IS NOT NULL AND auto_releasable = false;

COMMENT ON TABLE  holds IS 'Typed holds on invoices. A held invoice cannot be paid; release always carries a named releaser and a reason.';
COMMENT ON COLUMN holds.auto_releasable IS 'The hold lifts by itself once the underlying condition resolves.';
COMMENT ON COLUMN holds.blocks_accounting IS 'While true, no accounting entry may be created for the invoice.';
COMMENT ON COLUMN holds.released_by IS 'A named reviewer, or the system for an auto-release. Never blank on a released hold.';
