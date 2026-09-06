-- 002 — runs. Table 1 of 9.
--
-- A run is the unit of reproducibility: it names the bytes it read (dataset_hash), the
-- floors it was judged against (thresholds_hash) and the code that produced it. A rerun is
-- a DIFF against `parent_run_id` over the same frozen input — run 1 is never mutated, which
-- is why there is a parent pointer and no in-place revision of an earlier run.

CREATE TABLE runs (
  id                 TEXT        PRIMARY KEY,
  kind               run_kind    NOT NULL,
  status             run_status  NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL,
  finished_at        TIMESTAMPTZ,

  -- Every published number has to name the bytes it came from.
  dataset_hash       TEXT        NOT NULL,
  thresholds_hash    TEXT        NOT NULL,
  engine_version     TEXT        NOT NULL,
  scorer_version     TEXT        NOT NULL,

  -- Run creation is idempotent on this key.
  idempotency_key    TEXT        NOT NULL,

  -- Set on a rerun: the run this one is a diff against. Never a mutation of it.
  parent_run_id      TEXT        REFERENCES runs (id),

  -- The feedback rules that were active for this run, so a rerun's diff is explicable.
  feedback_rule_ids  TEXT[]      NOT NULL DEFAULT '{}',

  -- RunTotals. Null until the run completes. Money inside it is integer paise, enforced
  -- below: a decimal point in a money key fails the write.
  totals             JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT runs_id_present         CHECK (btrim(id) <> ''),
  CONSTRAINT runs_dataset_hash_sha   CHECK (holdfast_is_sha256(dataset_hash)),
  CONSTRAINT runs_thresholds_hash_sha CHECK (holdfast_is_sha256(thresholds_hash)),
  CONSTRAINT runs_versions_present   CHECK (btrim(engine_version) <> '' AND btrim(scorer_version) <> ''),
  CONSTRAINT runs_idempotency_present CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT runs_not_its_own_parent CHECK (parent_run_id IS DISTINCT FROM id),

  -- A rerun without a parent is not a diff, it is a second first run.
  CONSTRAINT runs_rerun_has_parent   CHECK (kind <> 'rerun' OR parent_run_id IS NOT NULL),

  CONSTRAINT runs_finished_after_started CHECK (finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT runs_completed_is_finished  CHECK (status <> 'completed' OR finished_at IS NOT NULL),

  -- A completed run publishes totals or it published nothing.
  CONSTRAINT runs_completed_has_totals CHECK (status <> 'completed' OR totals IS NOT NULL),

  CONSTRAINT runs_totals_is_object CHECK (totals IS NULL OR jsonb_typeof(totals) = 'object'),

  -- Money is integer minor units even inside the totals document.
  CONSTRAINT runs_totals_money_is_paise CHECK (
    totals IS NULL OR (
          holdfast_is_paise_text(totals->>'amount_invoiced_paise')
      AND holdfast_is_paise_text(totals->>'amount_auto_cleared_paise')
      AND holdfast_is_paise_text(totals->>'amount_held_paise')
    )
  )
);

-- Idempotent run creation: the second attempt with the same key collides rather than
-- producing a second run over the same input.
CREATE UNIQUE INDEX runs_idempotency_key_uq ON runs (idempotency_key);

CREATE INDEX runs_kind_status_idx ON runs (kind, status);
CREATE INDEX runs_parent_idx      ON runs (parent_run_id) WHERE parent_run_id IS NOT NULL;
CREATE INDEX runs_started_at_idx  ON runs (started_at DESC);

COMMENT ON TABLE  runs IS 'One reconciliation run. Reproducible: it names its dataset hash, threshold hash and code versions.';
COMMENT ON COLUMN runs.parent_run_id IS 'A rerun is a diff against this run over the same frozen input. The parent is never mutated.';
COMMENT ON COLUMN runs.totals IS 'RunTotals. Operational figures only — nothing here needs the answer key.';
