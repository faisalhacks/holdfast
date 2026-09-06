-- 011 — append-only, enforced.
--
-- Append-only is a claim made on camera, so it is enforced twice and asserted once.
--
--   1. GRANT. UPDATE, DELETE and TRUNCATE are revoked on audit_journal — from PUBLIC, from
--      the owner, and from any other role that somehow holds them. `pnpm migrate` reads
--      information_schema.role_table_grants afterwards and fails if either UPDATE or
--      DELETE survives, so a migration that merely says the words does not pass. This file
--      makes the same assertion itself, at the foot, so the transaction rolls back at the
--      point of failure rather than leaving a schema behind for the tool to complain about.
--
--   2. A TRIGGER. Stated plainly, because it matters: a superuser bypasses GRANT. The
--      revocation is real and is what the gate checks, but on a connection that happens to
--      be superuser it would not by itself stop an amendment. The trigger does, for every
--      role including the owner. Two mechanisms, because one of them has a known hole.
--
-- The other eight tables lose DELETE and TRUNCATE as well. UPDATE is retained there and
-- only there, because releasing a hold, deactivating a feedback rule and completing a run
-- are all legitimate in-place transitions — and each of them writes a journal row that
-- cannot itself be amended. There is no delete path in this system.

-- ── 1. the journal: no amendment, no removal ─────────────────────────────────
REVOKE UPDATE, DELETE, TRUNCATE ON audit_journal FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_journal FROM CURRENT_USER;

-- Sweep anything else that holds them: the owner is not necessarily the only grantee, and
-- a privilege we did not think to name is exactly the one that would survive.
DO $sweep$
DECLARE
  g text;
BEGIN
  FOR g IN
    SELECT DISTINCT grantee
      FROM information_schema.role_table_grants
     WHERE table_name = 'audit_journal'
       AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
  LOOP
    IF g = 'PUBLIC' THEN
      EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON audit_journal FROM PUBLIC';
    ELSE
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON audit_journal FROM %I', g);
    END IF;
  END LOOP;
END
$sweep$;

-- ── 2. no removal anywhere else either ───────────────────────────────────────
DO $norm$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'runs', 'invoices', 'payments', 'match_candidates',
    'holds', 'tolerance_changes', 'decisions', 'feedback_rules'
  ]
  LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM PUBLIC', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM CURRENT_USER', t);
  END LOOP;
END
$norm$;

-- ── 3. the trigger that closes the superuser hole ────────────────────────────
CREATE FUNCTION holdfast_audit_journal_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $trg$
  BEGIN
    RAISE EXCEPTION
      'audit_journal is append-only: a journal row is written once and never amended or removed'
      USING ERRCODE = 'restrict_violation';
  END
  $trg$;

COMMENT ON FUNCTION holdfast_audit_journal_append_only() IS
  'Refuses any amendment or removal of a journal row, including by the table owner or a superuser, for whom GRANT alone is not binding.';

CREATE TRIGGER audit_journal_no_amendment
  BEFORE UPDATE OR DELETE ON audit_journal
  FOR EACH ROW EXECUTE FUNCTION holdfast_audit_journal_append_only();

CREATE TRIGGER audit_journal_no_bulk_removal
  BEFORE TRUNCATE ON audit_journal
  FOR EACH STATEMENT EXECUTE FUNCTION holdfast_audit_journal_append_only();

-- ── 4. assert it, here, in the same transaction ──────────────────────────────
DO $assert$
DECLARE
  surviving text;
BEGIN
  SELECT string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type)
    INTO surviving
    FROM information_schema.role_table_grants
   WHERE table_name = 'audit_journal'
     AND privilege_type IN ('UPDATE', 'DELETE');

  IF surviving IS NOT NULL THEN
    RAISE EXCEPTION
      'audit_journal still grants %. Append-only is enforced by GRANT, not by convention.',
      surviving;
  END IF;
END
$assert$;
