-- 002 — runs.
--
-- `Run` from lib/types.ts. `RunTotals` is flattened onto the row rather than parked in a
-- JSONB blob, because three of its fields are `Paise` and the house rule is that money is
-- a BIGINT COLUMN. Money inside JSON is money nobody can constrain, index or sum without
-- a cast that silently produces a float.
--
-- A rerun is a DIFF between two runs over the same frozen input. `parent_run_id` names the
-- run it is a diff against; run 1 is never mutated, which is why there is no version
-- column and no delete path here.

CREATE TABLE runs (
  id                TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  kind              run_kind    NOT NULL,
  status            run_status  NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  finished_at       TIMESTAMPTZ,

  -- Every published number has to name the bytes it came from.
  dataset_hash      TEXT NOT NULL CHECK (dataset_hash ~ '^[0-9a-f]{64}$'),
  thresholds_hash   TEXT NOT NULL CHECK (thresholds_hash ~ '^[0-9a-f]{64}$'),
  engine_version    TEXT NOT NULL CHECK (length(btrim(engine_version)) > 0),
  scorer_version    TEXT NOT NULL CHECK (length(btrim(scorer_version)) > 0),

  -- Run creation is idempotent on this key.
  idempotency_key   TEXT NOT NULL UNIQUE CHECK (length(btrim(idempotency_key)) > 0),

  parent_run_id     TEXT REFERENCES runs (id),
  feedback_rule_ids TEXT[] NOT NULL DEFAULT '{}',

  -- ── RunTotals, or all-null while the run is still in flight ───────────────────
  totals_invoices_total              INTEGER CHECK (totals_invoices_total >= 0),
  totals_payments_total              INTEGER CHECK (totals_payments_total >= 0),
  totals_decided_count               INTEGER CHECK (totals_decided_count >= 0),
  totals_coverage                    DOUBLE PRECISION
      CHECK (totals_coverage >= 0 AND totals_coverage <= 1),
  totals_auto_cleared_count          INTEGER CHECK (totals_auto_cleared_count >= 0),
  totals_held_count                  INTEGER CHECK (totals_held_count >= 0),
  totals_human_required_count        INTEGER CHECK (totals_human_required_count >= 0),
  totals_unmatched_count             INTEGER CHECK (totals_unmatched_count >= 0),
  totals_holds_by_type               JSONB
      CHECK (totals_holds_by_type IS NULL OR jsonb_typeof(totals_holds_by_type) = 'object'),
  totals_conflicts_emitted           INTEGER CHECK (totals_conflicts_emitted >= 0),
  -- A held invoice with no conflict is a policy bug. It is NOT constrained to zero:
  -- forcing it to zero would make an honest bad run unrecordable, and the adverse finding
  -- is the thing that ships. The eval fails loudly on it; the journal keeps the evidence.
  totals_held_invoices_without_conflict INTEGER
      CHECK (totals_held_invoices_without_conflict >= 0),

  totals_amount_invoiced_paise       BIGINT,
  totals_amount_auto_cleared_paise   BIGINT,
  totals_amount_held_paise           BIGINT,

  CONSTRAINT runs_finished_after_started
    CHECK (finished_at IS NULL OR finished_at >= started_at),

  CONSTRAINT runs_terminal_status_is_finished
    CHECK (status NOT IN ('completed', 'failed') OR finished_at IS NOT NULL),

  -- A rerun names the run it diffs against. Nothing else carries a parent.
  CONSTRAINT runs_rerun_names_its_parent
    CHECK ((kind = 'rerun') = (parent_run_id IS NOT NULL)),
  CONSTRAINT runs_parent_is_not_self
    CHECK (parent_run_id IS DISTINCT FROM id),

  -- `totals` is `RunTotals | null`: present as a whole, or absent as a whole. A run
  -- reporting coverage but no rupee figure is the shape of a flattering half-report.
  CONSTRAINT runs_totals_all_or_nothing CHECK (
    (totals_invoices_total IS NULL
     AND totals_coverage IS NULL
     AND totals_amount_invoiced_paise IS NULL
     AND totals_amount_auto_cleared_paise IS NULL
     AND totals_amount_held_paise IS NULL)
    OR
    (totals_invoices_total IS NOT NULL
     AND totals_payments_total IS NOT NULL
     AND totals_decided_count IS NOT NULL
     AND totals_coverage IS NOT NULL
     AND totals_auto_cleared_count IS NOT NULL
     AND totals_held_count IS NOT NULL
     AND totals_human_required_count IS NOT NULL
     AND totals_unmatched_count IS NOT NULL
     AND totals_holds_by_type IS NOT NULL
     AND totals_conflicts_emitted IS NOT NULL
     AND totals_held_invoices_without_conflict IS NOT NULL
     AND totals_amount_invoiced_paise IS NOT NULL
     AND totals_amount_auto_cleared_paise IS NOT NULL
     AND totals_amount_held_paise IS NOT NULL)
  )
);

CREATE INDEX runs_parent_run_id_idx ON runs (parent_run_id) WHERE parent_run_id IS NOT NULL;
CREATE INDEX runs_started_at_idx ON runs (started_at DESC);

COMMENT ON TABLE runs IS
  'One execution of the engine, a baseline, or a rerun. RunTotals is flattened onto the row so the three Paise figures stay BIGINT columns.';
COMMENT ON COLUMN runs.parent_run_id IS
  'Set on a rerun: the run this one is a diff against. Never a mutation of it.';
COMMENT ON COLUMN runs.totals_held_invoices_without_conflict IS
  'Contract says this must be 0. Deliberately not constrained to 0 — an unflattering run must still be recordable.';
