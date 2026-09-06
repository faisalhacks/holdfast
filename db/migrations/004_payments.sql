-- 004 — payments.
--
-- `Payment` from lib/types.ts: one line of the bank statement.
--
-- `narration_raw` is the narration exactly as received — truncated, case-mangled, whatever
-- it was — and it is never overwritten by the normaliser. `narration_normalised`,
-- `reference_extracted` and `vendor_name_extracted` sit beside it so a reviewer always
-- sees both the raw value and what a deterministic rule made of it.
--
-- `application_status` carries all four Oracle AR states. `unapplied` (payer known,
-- invoice unknown) and `unidentified` (payer unknown) are separate columns of the same
-- enum on purpose: one routes to internal correction, the other to customer outreach.

CREATE TABLE payments (
  id                    TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  value_date            DATE NOT NULL,
  amount_paise          BIGINT NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),

  narration_raw         TEXT NOT NULL,
  narration_normalised  TEXT NOT NULL,
  reference_extracted   TEXT,
  vendor_name_extracted TEXT,
  vendor_id             TEXT,

  application_status    application_status NOT NULL DEFAULT 'unapplied',
  -- The statement line's own identity. Ingesting the same statement twice is a bug, not a
  -- duplicate-candidate case: duplicates are an invoice-side hold, never a bank-side one.
  bank_transaction_id   TEXT NOT NULL UNIQUE CHECK (length(btrim(bank_transaction_id)) > 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- `unidentified` means the payer itself is unknown. Naming a vendor and calling the
  -- payer unknown in the same row is the collapse this enum exists to prevent.
  CONSTRAINT payments_unidentified_has_no_vendor
    CHECK (application_status <> 'unidentified' OR vendor_id IS NULL)
);

CREATE INDEX payments_vendor_id_idx ON payments (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX payments_value_date_idx ON payments (value_date);
CREATE INDEX payments_reference_extracted_idx ON payments (reference_extracted)
  WHERE reference_extracted IS NOT NULL;
CREATE INDEX payments_application_status_idx ON payments (application_status);
-- The amount-window probe used when no reference survives the narration.
CREATE INDEX payments_amount_probe_idx ON payments (amount_paise, value_date);

COMMENT ON TABLE payments IS
  'Bank statement lines. amount_paise is BIGINT minor units; the raw narration is preserved verbatim beside its normalised form.';
COMMENT ON COLUMN payments.narration_raw IS
  'The bank narration exactly as received. A normaliser writes narration_normalised; it never rewrites this column.';
