-- 006 — holds.
--
-- The domain object is a HOLD, not a match verdict. A held invoice cannot be paid.
--
-- `auto_releasable` — the hold lifts by itself once the condition resolves.
-- `blocks_accounting` — while true, no accounting entry may be created for the invoice.
-- Some holds stop payment but permit accrual; that distinction is Oracle's and it is why
-- this reads as an AP system rather than a match flag.
--
-- The one constraint that carries the product claim: the three release columns move
-- together. `ActiveHold` and `ReleasedHold` are separate types in the contract, and
-- `holds_release_is_never_silent` is the same statement in SQL — a release always carries
-- BOTH a named reviewer and a reason. A hold released by nobody, or for no stated reason,
-- is not representable.
--
-- Holds are UPDATEd in place on release. Only audit_journal is append-only by GRANT; the
-- journal is what makes the release visible after the fact, not an immutable hold row.

CREATE TABLE holds (
  id                TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  run_id            TEXT NOT NULL REFERENCES runs (id),
  case_id           TEXT NOT NULL CHECK (length(btrim(case_id)) > 0),
  invoice_id        TEXT NOT NULL REFERENCES invoices (id),
  type              hold_type NOT NULL,

  -- A short fixed clause naming the condition. Not generated prose.
  reason            TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  applied_at        TIMESTAMPTZ NOT NULL,
  auto_releasable   BOOLEAN NOT NULL,
  blocks_accounting BOOLEAN NOT NULL,
  severity          conflict_severity NOT NULL,

  -- The machine-readable reasons this hold fired. An empty array is a policy bug that the
  -- eval fails loudly on, and RunTotals counts it — so the row must remain storable, or
  -- `held_invoices_without_conflict` could never be anything but zero and the metric would
  -- be measuring the constraint rather than the engine.
  conflicts         JSONB NOT NULL DEFAULT '[]'::JSONB
                      CHECK (holdfast_conflicts_valid(conflicts)),

  released_by       TEXT,
  released_at       TIMESTAMPTZ,
  release_reason    TEXT,

  CONSTRAINT holds_release_is_never_silent CHECK (
    (released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)
    OR (released_by IS NOT NULL
        AND length(btrim(released_by)) > 0
        AND released_at IS NOT NULL
        AND release_reason IS NOT NULL
        AND length(btrim(release_reason)) > 0)
  ),

  CONSTRAINT holds_released_after_applied
    CHECK (released_at IS NULL OR released_at >= applied_at)
);

-- The working index: everything still in force, newest condition first.
CREATE INDEX holds_active_idx ON holds (run_id, invoice_id) WHERE released_at IS NULL;
CREATE INDEX holds_invoice_idx ON holds (invoice_id);
CREATE INDEX holds_case_idx ON holds (case_id);
CREATE INDEX holds_type_idx ON holds (type);
-- Per hold type, never aggregate-only: recall and precision are reported by type.
CREATE INDEX holds_run_type_idx ON holds (run_id, type);
CREATE INDEX holds_blocking_accounting_idx ON holds (invoice_id)
  WHERE blocks_accounting AND released_at IS NULL;

COMMENT ON TABLE holds IS
  'A typed hold on an invoice. A held invoice cannot be paid. Release requires a named reviewer and a reason, enforced by holds_release_is_never_silent.';
COMMENT ON COLUMN holds.auto_releasable IS
  'The hold lifts by itself once the underlying condition resolves. It still records who or what released it.';
COMMENT ON COLUMN holds.blocks_accounting IS
  'While true, no accounting entry may be created for the invoice. Some holds stop payment but permit accrual.';
COMMENT ON COLUMN holds.conflicts IS
  'Every held invoice should emit at least one. Not constrained to be non-empty: the eval must be able to count the policy bug.';
