-- 003 — invoices. Table 2 of 9.
--
-- Every monetary column is BIGINT paise. There is no `rupees` column here or anywhere
-- else, and no NUMERIC or DOUBLE PRECISION column carries money in this schema.
--
-- `vendor_id` is a plain identifier rather than a foreign key into a vendors table: a
-- vendor is a value in the contract (lib/types.ts `Vendor`) and is NOT one of the eight
-- entity kinds a journal row may point at, so it does not earn a table of its own. The
-- raw vendor name as it arrived is kept beside the id, always.

CREATE TABLE invoices (
  id                        TEXT        PRIMARY KEY,

  reference                 TEXT        NOT NULL,
  normalised_reference      TEXT        NOT NULL,

  vendor_id                 TEXT        NOT NULL,
  vendor_name_raw           TEXT        NOT NULL,

  invoice_date              DATE        NOT NULL,
  received_date             DATE        NOT NULL,
  due_date                  DATE,

  -- Accounting period the invoice belongs to, `YYYY-MM`.
  period                    TEXT        NOT NULL,

  -- Money: integer minor units (paise), BIGINT, signed.
  gross_paise               BIGINT      NOT NULL,
  net_paise                 BIGINT      NOT NULL,

  -- TaxBreakdown, flattened. Kept as columns rather than a document because the tax split
  -- is compared field by field and its identity is checked below.
  tax_total_paise           BIGINT      NOT NULL,
  tax_igst_paise            BIGINT      NOT NULL,
  tax_cgst_paise            BIGINT      NOT NULL,
  tax_sgst_paise            BIGINT      NOT NULL,
  tax_cess_paise            BIGINT      NOT NULL,

  currency                  TEXT        NOT NULL DEFAULT 'INR',

  -- True for a credit note; the sign of gross_paise follows the document.
  is_credit_note            BOOLEAN     NOT NULL DEFAULT false,

  -- Set on recurring or instalment documents so duplicate detection can stand down.
  recurrence                recurrence_kind,

  purchase_order_reference  TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT invoices_id_present        CHECK (btrim(id) <> ''),
  CONSTRAINT invoices_reference_present CHECK (btrim(reference) <> ''),
  CONSTRAINT invoices_vendor_present    CHECK (btrim(vendor_id) <> ''),
  CONSTRAINT invoices_currency_inr      CHECK (currency = 'INR'),
  CONSTRAINT invoices_period_format     CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

  -- The contract states the identity plainly: total = igst + cgst + sgst + cess. A tax
  -- split that does not add up is `tax_split_mismatch`, and it is caught on the way in.
  CONSTRAINT invoices_tax_split_adds_up CHECK (
    tax_total_paise = tax_igst_paise + tax_cgst_paise + tax_sgst_paise + tax_cess_paise
  )
);

CREATE INDEX invoices_vendor_idx      ON invoices (vendor_id);
CREATE INDEX invoices_period_idx      ON invoices (period);
CREATE INDEX invoices_norm_ref_idx    ON invoices (normalised_reference);
CREATE INDEX invoices_invoice_date_idx ON invoices (invoice_date);

-- The duplicate-candidate probe: same vendor, same amount, same date. Indexed because it
-- is asked once per ingested document.
CREATE INDEX invoices_vendor_amount_date_idx ON invoices (vendor_id, gross_paise, invoice_date);

COMMENT ON TABLE  invoices IS 'Supplier invoices. All money is BIGINT paise; a held invoice cannot be paid.';
COMMENT ON COLUMN invoices.gross_paise IS 'Paise — integer minor units. Rs 1,234.50 is 123450.';
COMMENT ON COLUMN invoices.vendor_name_raw IS 'The vendor name exactly as it arrived, kept beside the resolved id.';
COMMENT ON COLUMN invoices.recurrence IS 'Recurring or instalment documents are legitimately similar; duplicate detection stands down.';
