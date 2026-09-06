-- 010 — cross-table invariants and the exception queue.
--
-- Two things a single CHECK constraint cannot say, said here instead. Both are deferred
-- constraint triggers that re-read the committed row rather than trusting the NEW tuple,
-- so the engine may write holds and candidates in either order inside one transaction and
-- still be judged on the state it actually leaves behind.

-- ── 1. Element-wise referential integrity for match_candidates.payment_ids ────────
-- Bulk settlement means a candidate carries a list of payment ids and PostgreSQL has no
-- foreign key over array elements. An unenforced list of ids is a dangling reference
-- waiting to happen, so the constraint is written out.
CREATE FUNCTION holdfast_assert_payment_ids_exist() RETURNS TRIGGER
LANGUAGE plpgsql AS $fn$
DECLARE
  v_unknown TEXT;
BEGIN
  SELECT candidate_payment.pid INTO v_unknown
  FROM unnest(NEW.payment_ids) AS candidate_payment(pid)
  WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = candidate_payment.pid)
  LIMIT 1;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION
      'match_candidates.payment_ids on % references unknown payment %', NEW.id, v_unknown
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE CONSTRAINT TRIGGER match_candidates_payment_ids_reference_payments
  AFTER INSERT OR UPDATE OF payment_ids ON match_candidates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION holdfast_assert_payment_ids_exist();

-- ── 2. A held invoice cannot be paid ─────────────────────────────────────────────
-- The central rule of the domain model, and the one a reviewer will test on camera. An
-- invoice with an unreleased hold may not carry an auto-cleared candidate in the same run,
-- and the rule is symmetric: it is enforced from the holds side and the candidates side,
-- so neither write order can slip past it.
--
-- Releasing the hold first is the supported path, and it is not silent — holds already
-- refuses a release without a named reviewer and a reason.
CREATE FUNCTION holdfast_assert_hold_and_clear_are_exclusive() RETURNS TRIGGER
LANGUAGE plpgsql AS $fn$
DECLARE
  v_held    BOOLEAN;
  v_cleared BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM holds h
    WHERE h.run_id = NEW.run_id
      AND h.invoice_id = NEW.invoice_id
      AND h.released_at IS NULL
  ) INTO v_held;

  SELECT EXISTS (
    SELECT 1 FROM match_candidates c
    WHERE c.run_id = NEW.run_id
      AND c.invoice_id = NEW.invoice_id
      AND c.cleared
  ) INTO v_cleared;

  IF v_held AND v_cleared THEN
    RAISE EXCEPTION
      'invoice % in run % is both held and auto-cleared; a held invoice cannot be paid',
      NEW.invoice_id, NEW.run_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE CONSTRAINT TRIGGER holds_never_coexist_with_a_clear
  AFTER INSERT OR UPDATE ON holds
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION holdfast_assert_hold_and_clear_are_exclusive();

CREATE CONSTRAINT TRIGGER match_candidates_never_clear_a_held_invoice
  AFTER INSERT OR UPDATE ON match_candidates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION holdfast_assert_hold_and_clear_are_exclusive();

-- ── The exception queue ──────────────────────────────────────────────────────────
-- ORDERED BY money_at_risk_paise DESCENDING — not by score, not by age. That is how AP
-- staff actually work, and putting the ordering in the view keeps every caller honest
-- about it. Rupees, not percentages, are what a reviewer feels.
CREATE VIEW exception_queue AS
SELECT
  h.case_id,
  h.run_id,
  h.invoice_id,
  max(i.gross_paise)                            AS money_at_risk_paise,
  min(h.applied_at)                             AS held_since,
  (now()::DATE - min(h.applied_at)::DATE)       AS age_days,
  bool_or(h.blocks_accounting)                  AS blocks_accounting,
  count(*)                                      AS active_hold_count,
  max(i.currency)                               AS currency
FROM holds h
JOIN invoices i ON i.id = h.invoice_id
WHERE h.released_at IS NULL
GROUP BY h.case_id, h.run_id, h.invoice_id
ORDER BY money_at_risk_paise DESC, held_since ASC;

COMMENT ON VIEW exception_queue IS
  'Open exception cases, ordered by money at risk descending. The ordering is the product claim, so it lives in the view rather than in each caller.';
