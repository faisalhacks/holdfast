-- 005 — match_candidates. Table 4 of 9. The ninth table the model needs.
--
-- WHY THIS TABLE AND NOT A VENDORS TABLE
-- lib/types.ts `EntityRef` names the eight things an audit journal row may point at:
-- invoice, payment, hold, decision, tolerance_change, feedback_rule, match_candidate, run.
-- Seven of those were named in the brief; `match_candidate` is the eighth, and without it
-- the `candidate_scored`, `proposal_received` and `proposal_discarded` journal events point
-- at rows that exist nowhere. Eight addressable entities plus the journal itself is nine.
-- `Vendor` is a value in the contract, not an addressable entity, and is carried on the
-- documents that reference it.
--
-- THE RULE OF THE HOUSE, IN A CONSTRAINT
-- A candidate from `model_proposal` is a nomination. It is stored with the same
-- deterministic ScoreBreakdown as every other candidate, and that breakdown must add up:
-- each contribution equals score x weight, and the composite equals the sum of the four
-- contributions. There is nowhere in this table to record a model's own stated certainty,
-- and `reverified` records whether the deterministic scorer has re-scored the row.

-- A ScoreBreakdown a reviewer can reconstruct by hand. If it does not add up, it is not
-- stored — a composite nobody can reproduce is a number nobody should trust.
CREATE FUNCTION holdfast_score_breakdown_valid(s jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(
      s IS NOT NULL
      AND jsonb_typeof(s) = 'object'
      AND coalesce(btrim(s->>'scorer_version'), '') <> ''
      AND jsonb_typeof(s->'weights') = 'object'
      AND jsonb_typeof(s->'composite') = 'number'
      AND NOT EXISTS (
            SELECT 1
            FROM unnest(ARRAY['amount', 'reference', 'date', 'vendor']) AS f
            WHERE jsonb_typeof(s->f)                IS DISTINCT FROM 'object'
               OR jsonb_typeof(s->f->'score')       IS DISTINCT FROM 'number'
               OR jsonb_typeof(s->f->'weight')      IS DISTINCT FROM 'number'
               OR jsonb_typeof(s->f->'contribution') IS DISTINCT FROM 'number'
               OR jsonb_typeof(s->'weights'->f)     IS DISTINCT FROM 'number'
               OR abs(
                    (s->f->>'contribution')::double precision
                    - (s->f->>'score')::double precision * (s->f->>'weight')::double precision
                  ) > 0.000001
          )
      AND abs(
            (s->>'composite')::double precision
            - (   (s->'amount'->>'contribution')::double precision
                + (s->'reference'->>'contribution')::double precision
                + (s->'date'->>'contribution')::double precision
                + (s->'vendor'->>'contribution')::double precision )
          ) <= 0.000001,
      false);
  $fn$;

COMMENT ON FUNCTION holdfast_score_breakdown_valid(jsonb) IS
  'A composite score is stored only if it equals the sum of its four contributions, each of which equals score x weight.';

-- All four compared fields, aligned side by side, with the delta in each field's own units
-- and the tolerance that was applied. Deliberately NO free-text member: fluent prose
-- attached to a wrong match is how a reviewer rubber-stamps an error, so a document
-- carrying `text`, `narrative`, `explanation` or `summary` is rejected here.
CREATE FUNCTION holdfast_evidence_set_valid(e jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $fn$
    SELECT coalesce(
      e IS NOT NULL
      AND jsonb_typeof(e) = 'object'
      AND NOT EXISTS (
            SELECT 1
            FROM unnest(ARRAY['vendor', 'amount', 'date', 'reference']) AS f
            WHERE jsonb_typeof(e->f)                     IS DISTINCT FROM 'object'
               OR jsonb_typeof(e->f->'within_tolerance') IS DISTINCT FROM 'boolean'
               OR jsonb_typeof(e->f->'tolerance')        IS DISTINCT FROM 'object'
               OR (e->f->'tolerance'->>'kind') IS NULL
               OR NOT ((e->f->'tolerance'->>'kind') = ANY (enum_range(NULL::tolerance_kind)::text[]))
               OR (e->f->'text')        IS NOT NULL
               OR (e->f->'narrative')   IS NOT NULL
               OR (e->f->'explanation') IS NOT NULL
               OR (e->f->'summary')     IS NOT NULL
          )
      -- The amount delta is money: payment minus invoice, signed, integer paise.
      AND holdfast_is_paise_text(e->'amount'->>'delta')
      AND (e->'amount'->>'cause') IS NOT NULL
      AND ((e->'amount'->>'cause') = ANY (enum_range(NULL::delta_cause)::text[]))
      -- The date delta is whole days, signed.
      AND jsonb_typeof(e->'date'->'delta') = 'number',
      false);
  $fn$;

COMMENT ON FUNCTION holdfast_evidence_set_valid(jsonb) IS
  'Evidence is field-level and structured. A narrative member is not merely unused — it is rejected.';

CREATE TABLE match_candidates (
  id              TEXT            PRIMARY KEY,

  run_id          TEXT            NOT NULL REFERENCES runs (id),
  invoice_id      TEXT            NOT NULL REFERENCES invoices (id),

  -- Bulk settlement means a candidate may carry dozens of payment ids. Held as an array
  -- rather than a junction table: the set is the candidate, and it is written once.
  payment_ids     TEXT[]          NOT NULL DEFAULT '{}',
  cardinality     cardinality_kind NOT NULL,

  -- ScoreBreakdown. Itemised so the composite can be audited by addition.
  score           JSONB           NOT NULL,
  -- EvidenceSet: vendor, amount, date, reference — all four, always.
  evidence        JSONB           NOT NULL,
  -- Zero or more machine-readable reasons this pairing is not clean.
  conflicts       JSONB           NOT NULL DEFAULT '[]'::jsonb,

  -- Money: invoice gross minus the settled sum. Zero on a full settlement, signed.
  residual_paise  BIGINT          NOT NULL,

  proposed_by     proposal_source NOT NULL,

  -- True once the deterministic scorer has re-scored this candidate on its own merits.
  -- A candidate from `model_proposal` that has not been re-scored may not clear anything.
  reverified      BOOLEAN         NOT NULL DEFAULT false,

  rank            INTEGER         NOT NULL,

  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT match_candidates_id_present   CHECK (btrim(id) <> ''),
  CONSTRAINT match_candidates_rank_positive CHECK (rank >= 1),
  CONSTRAINT match_candidates_score_adds_up CHECK (holdfast_score_breakdown_valid(score)),
  CONSTRAINT match_candidates_evidence_typed CHECK (holdfast_evidence_set_valid(evidence)),
  -- Zero conflicts is legal on a candidate (a clean pairing has none); a malformed
  -- conflict is not. `payment_ids` may legitimately be empty — the contract pairs an
  -- invoice with ZERO or more payments, and the no-candidate case is a real outcome.
  CONSTRAINT match_candidates_conflicts_typed CHECK (
    jsonb_typeof(conflicts) = 'array'
    AND (jsonb_array_length(conflicts) = 0 OR holdfast_conflicts_valid(conflicts))
  )
);

-- One rank per invoice per run: two candidates cannot both be "the top candidate".
CREATE UNIQUE INDEX match_candidates_run_invoice_rank_uq
  ON match_candidates (run_id, invoice_id, rank);

CREATE INDEX match_candidates_run_idx        ON match_candidates (run_id);
CREATE INDEX match_candidates_invoice_idx    ON match_candidates (invoice_id);
CREATE INDEX match_candidates_source_idx     ON match_candidates (proposed_by);
CREATE INDEX match_candidates_payments_gin   ON match_candidates USING GIN (payment_ids);

-- The audit question this table exists to answer: which generated proposals were taken,
-- and had the deterministic scorer looked at them first.
CREATE INDEX match_candidates_unverified_proposals_idx
  ON match_candidates (run_id, invoice_id)
  WHERE proposed_by = 'model_proposal' AND reverified = false;

COMMENT ON TABLE  match_candidates IS 'Proposed pairings of one invoice with zero or more payments. A model proposal is scored here by the same deterministic breakdown as any other candidate.';
COMMENT ON COLUMN match_candidates.proposed_by IS 'model_proposal is a nomination, never a verdict.';
COMMENT ON COLUMN match_candidates.reverified IS 'The deterministic scorer has re-scored this candidate on its own merits.';
COMMENT ON COLUMN match_candidates.residual_paise IS 'Paise — invoice gross minus the settled sum. Signed.';
