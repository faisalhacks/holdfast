-- 005 — match_candidates. The ninth table, and the one the model needs.
--
-- Nothing else in this schema joins an invoice to a payment. Without it, `holds` has no
-- evidence behind it, `ExceptionCase.top_candidate` has nowhere to point, the
-- `candidate_scored` audit event has no entity, and `EntityRef` carries a `match_candidate`
-- member that resolves to nothing. `vendors` was the other contender and lost on exactly
-- that test: VendorId is a branded string and a vendors table would add referential tidiness,
-- whereas without match_candidates the system has no persisted reconciliation at all.
--
-- Two claims are enforced here rather than asserted:
--
--   1. A candidate may not be marked `cleared` unless the deterministic scorer has
--      `reverified` it. An LLM proposal enters as `model_proposal, reverified = false` and
--      the database refuses to let it clear anything until deterministic code has re-scored
--      it on its own merits. This is the house rule expressed as a constraint.
--   2. The money inside `evidence` is integer paise. The amount evidence is exposed as
--      generated BIGINT columns, so a float delta fails the cast on the way in rather than
--      rounding quietly for the rest of its life.

-- Shared by match_candidates and holds. Every conflict is a machine-readable reason, and
-- an unknown code fails the cast to the enum rather than sitting in a blob unread.
CREATE FUNCTION holdfast_conflicts_valid(v JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  e JSONB;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'array' THEN
    RETURN FALSE;
  END IF;
  FOR e IN SELECT jsonb_array_elements(v) LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RETURN FALSE;
    END IF;
    IF e ->> 'code' IS NULL OR e ->> 'field_path' IS NULL
       OR e ->> 'clause' IS NULL OR e ->> 'severity' IS NULL THEN
      RETURN FALSE;
    END IF;
    -- Raises on an unrecognised member; the error names the offending value.
    PERFORM (e ->> 'code')::conflict_code;
    PERFORM (e ->> 'severity')::conflict_severity;
  END LOOP;
  RETURN TRUE;
END;
$fn$;

CREATE TABLE match_candidates (
  id             TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  run_id         TEXT NOT NULL REFERENCES runs (id),
  invoice_id     TEXT NOT NULL REFERENCES invoices (id),

  -- Bulk settlement means a candidate may carry dozens of payment ids. PostgreSQL has no
  -- element-wise foreign key, so 010 adds a constraint trigger that enforces one.
  payment_ids    TEXT[] NOT NULL DEFAULT '{}',
  cardinality    cardinality_kind NOT NULL,

  -- Every input to the composite, itemised, so a reviewer can reconstruct it by hand.
  score_breakdown JSONB NOT NULL,
  -- The ordering column IS the reported composite: generated from the breakdown, so the
  -- number a queue sorts on cannot drift from the number a reviewer is shown.
  score_composite  DOUBLE PRECISION
    GENERATED ALWAYS AS ((score_breakdown ->> 'composite')::DOUBLE PRECISION) STORED,
  scorer_version   TEXT
    GENERATED ALWAYS AS (score_breakdown ->> 'scorer_version') STORED,

  -- All four fields, aligned side by side. The detail screen renders exactly this.
  evidence       JSONB NOT NULL,
  evidence_amount_delta_paise   BIGINT
    GENERATED ALWAYS AS ((evidence #>> '{amount,delta}')::BIGINT) STORED,
  evidence_amount_invoice_paise BIGINT
    GENERATED ALWAYS AS ((evidence #>> '{amount,invoice_value}')::BIGINT) STORED,
  evidence_amount_payment_paise BIGINT
    GENERATED ALWAYS AS ((evidence #>> '{amount,payment_value}')::BIGINT) STORED,

  conflicts      JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Invoice gross minus the settled sum. Signed; zero on a full settlement.
  residual_paise BIGINT NOT NULL,
  proposed_by    proposal_source NOT NULL,
  reverified     BOOLEAN NOT NULL DEFAULT FALSE,
  -- True on the one candidate that auto-cleared this invoice in this run.
  cleared        BOOLEAN NOT NULL DEFAULT FALSE,
  rank           INTEGER NOT NULL CHECK (rank >= 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT match_candidates_rank_unique UNIQUE (run_id, invoice_id, rank),

  -- THE HOUSE RULE, AS A CONSTRAINT. No candidate clears without deterministic re-scoring,
  -- whatever proposed it. A model proposal that was never re-scored cannot clear anything.
  CONSTRAINT match_candidates_unverified_cannot_clear
    CHECK (NOT cleared OR reverified),

  CONSTRAINT match_candidates_payment_ids_not_null
    CHECK (array_position(payment_ids, NULL) IS NULL),

  CONSTRAINT match_candidates_one_to_one_has_one_payment
    CHECK (cardinality <> 'one_to_one' OR array_length(payment_ids, 1) = 1),

  -- Evidence is a discriminated union keyed on the compared field; the key and the
  -- discriminant have to agree or the object is not an EvidenceSet.
  CONSTRAINT match_candidates_evidence_is_a_full_set CHECK (
    evidence #>> '{vendor,field}'    = 'vendor'
    AND evidence #>> '{amount,field}'    = 'amount'
    AND evidence #>> '{date,field}'      = 'date'
    AND evidence #>> '{reference,field}' = 'reference'
  ),

  -- Integer minor units, signed. A delta written as 1234.50 fails here, not in a report.
  CONSTRAINT match_candidates_amount_delta_is_integer_paise
    CHECK ((evidence #>> '{amount,delta}') ~ '^-?[0-9]+$'),

  CONSTRAINT match_candidates_score_is_itemised CHECK (
    score_breakdown ->> 'composite' IS NOT NULL
    AND score_breakdown ->> 'scorer_version' IS NOT NULL
    AND score_breakdown -> 'weights' IS NOT NULL
    AND score_breakdown -> 'amount' IS NOT NULL
    AND score_breakdown -> 'reference' IS NOT NULL
    AND score_breakdown -> 'date' IS NOT NULL
    AND score_breakdown -> 'vendor' IS NOT NULL
  ),

  CONSTRAINT match_candidates_composite_is_a_ratio
    CHECK ((score_breakdown ->> 'composite')::DOUBLE PRECISION BETWEEN 0 AND 1),

  CONSTRAINT match_candidates_conflicts_are_structured
    CHECK (holdfast_conflicts_valid(conflicts))
);

-- One cleared candidate per invoice per run. Two auto-clears on one invoice is not a tie
-- to break later; it is a contradiction, and the index refuses it.
CREATE UNIQUE INDEX match_candidates_one_clear_per_invoice_idx
  ON match_candidates (run_id, invoice_id) WHERE cleared;

CREATE INDEX match_candidates_invoice_idx ON match_candidates (run_id, invoice_id, rank);
CREATE INDEX match_candidates_payment_ids_idx ON match_candidates USING GIN (payment_ids);
CREATE INDEX match_candidates_proposed_by_idx ON match_candidates (proposed_by);
-- Finds every model proposal that has not been re-scored — the firewall's own worklist.
CREATE INDEX match_candidates_unreverified_proposals_idx
  ON match_candidates (run_id, invoice_id)
  WHERE proposed_by = 'model_proposal' AND NOT reverified;

COMMENT ON TABLE match_candidates IS
  'A proposed pairing of one invoice with zero or more payments, with its itemised score and its four-field evidence set.';
COMMENT ON COLUMN match_candidates.reverified IS
  'True once the deterministic scorer has re-scored this candidate on its own merits.';
COMMENT ON COLUMN match_candidates.cleared IS
  'The candidate that auto-cleared this invoice. Constrained to require reverified, and refused while an unreleased hold stands.';
COMMENT ON COLUMN match_candidates.score_composite IS
  'Generated from score_breakdown so the sort key and the published number are the same value.';
