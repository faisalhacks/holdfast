-- 012 — exception_queue. A VIEW, not a tenth table.
--
-- `ExceptionCase` in lib/types.ts is a projection, not a stored entity: it is assembled
-- from an invoice, the holds still in force against it, and the best candidate found for
-- it. Storing it would mean maintaining a copy of facts that already exist, and the copy
-- is what goes stale. So it is derived here.
--
-- THE ORDER IS THE PRODUCT. The queue is ordered by money at risk, DESCENDING — not by
-- score, not by age. That is how AP staff actually work, and it is the one thing about
-- this screen that a demo either gets right or gets wrong.

CREATE VIEW exception_queue AS
SELECT
  h.case_id,
  h.run_id,
  h.invoice_id,
  -- Magnitude, so a credit note sorts by what it puts at stake rather than by its sign.
  abs(i.gross_paise)                      AS money_at_risk_paise,
  i.vendor_id,
  i.vendor_name_raw,
  i.period,
  count(*)                                AS hold_count,
  array_agg(h.type ORDER BY h.type)       AS hold_types,
  min(h.applied_at)                       AS held_since,
  (CURRENT_DATE - min(h.applied_at)::date) AS age_days,
  bool_or(h.blocks_accounting)            AS blocks_accounting,
  -- max() over the enum, not over its text: the enum is declared advisory < material <
  -- blocking, so this is the most severe hold on the case. Sorting the text instead would
  -- rank 'material' above 'blocking' and quietly understate the worst hold.
  max(h.severity)                         AS highest_severity_present,
  bool_and(h.auto_releasable)             AS all_holds_auto_releasable,
  top.candidate_id                        AS top_candidate_id,
  top.residual_paise                      AS top_candidate_residual_paise
FROM holds h
JOIN invoices i ON i.id = h.invoice_id
LEFT JOIN LATERAL (
  SELECT mc.id AS candidate_id, mc.residual_paise
  FROM match_candidates mc
  WHERE mc.run_id = h.run_id
    AND mc.invoice_id = h.invoice_id
  ORDER BY mc.rank
  LIMIT 1
) AS top ON true
WHERE h.released_at IS NULL
GROUP BY
  h.case_id, h.run_id, h.invoice_id,
  i.gross_paise, i.vendor_id, i.vendor_name_raw, i.period,
  top.candidate_id, top.residual_paise
ORDER BY money_at_risk_paise DESC;

COMMENT ON VIEW exception_queue IS
  'Derived exception queue: invoices with holds still in force, ordered by money at risk descending. A view, not one of the nine tables.';
