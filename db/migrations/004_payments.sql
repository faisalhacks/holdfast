-- 004 — payments. Table 3 of 9.
--
-- One line of the bank statement. `narration_raw` is preserved verbatim, always —
-- truncated, case-mangled, whatever it was — because the normalised form is a derivation
-- and a reviewer must be able to see what was actually received.

CREATE TABLE payments (
  id                     TEXT               PRIMARY KEY,

  value_date             DATE               NOT NULL,

  -- Money: integer minor units (paise), BIGINT, signed.
  amount_paise           BIGINT             NOT NULL,
  currency               TEXT               NOT NULL DEFAULT 'INR',

  narration_raw          TEXT               NOT NULL,
  narration_normalised   TEXT               NOT NULL,

  -- Reference token recovered from the narration, if any.
  reference_extracted    TEXT,
  vendor_name_extracted  TEXT,
  vendor_id              TEXT,

  application_status     application_status NOT NULL,

  bank_transaction_id    TEXT               NOT NULL,

  created_at             TIMESTAMPTZ        NOT NULL DEFAULT now(),

  CONSTRAINT payments_id_present       CHECK (btrim(id) <> ''),
  CONSTRAINT payments_currency_inr     CHECK (currency = 'INR'),
  CONSTRAINT payments_narration_kept   CHECK (btrim(narration_raw) <> ''),
  CONSTRAINT payments_bank_txn_present CHECK (btrim(bank_transaction_id) <> ''),

  -- The four application states are not collapsed, and this is the column that keeps them
  -- apart: `unidentified` means the PAYER is unknown, so there is no vendor to route to.
  -- Every other state names a known payer. Collapsing `unapplied` into `unidentified`
  -- would send a customer-outreach case to internal correction, which is the routing bug
  -- the four-state model exists to prevent.
  CONSTRAINT payments_payer_known_unless_unidentified CHECK (
    (application_status =  'unidentified' AND vendor_id IS NULL)
    OR
    (application_status <> 'unidentified' AND vendor_id IS NOT NULL)
  )
);

-- A bank line appears once. Re-ingesting the same statement collides rather than
-- doubling the money on the payment side.
CREATE UNIQUE INDEX payments_bank_transaction_id_uq ON payments (bank_transaction_id);

CREATE INDEX payments_vendor_idx     ON payments (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX payments_value_date_idx ON payments (value_date);
CREATE INDEX payments_status_idx     ON payments (application_status);
CREATE INDEX payments_reference_idx  ON payments (reference_extracted) WHERE reference_extracted IS NOT NULL;

COMMENT ON TABLE  payments IS 'Bank statement lines. All money is BIGINT paise; the raw narration is never rewritten in place.';
COMMENT ON COLUMN payments.amount_paise IS 'Paise — integer minor units.';
COMMENT ON COLUMN payments.narration_raw IS 'The bank narration exactly as received. Normalisation writes narration_normalised beside it.';
COMMENT ON COLUMN payments.application_status IS 'Four Oracle AR states. unapplied = payer known, invoice unknown. unidentified = payer unknown.';
