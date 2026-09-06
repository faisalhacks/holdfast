-- 003 — invoices.
--
-- `Invoice` + `TaxBreakdown` from lib/types.ts. The tax breakdown is flattened onto the
-- row for the same reason `RunTotals` is: all five of its fields are `Paise`, and money
-- lives in a BIGINT column or it does not live here.
--
-- What is deliberately NOT constrained:
--   * no UNIQUE on (vendor_id, reference) — `duplicate_reference` and
--     `duplicate_vendor_amount_date` are CONFLICT CODES. A duplicate must be storable so
--     that it can be held; a database that rejects it hides the case we exist to catch.
--   * no CHECK that the tax split sums. The contract says it must, and a document whose
--     split does not sum is exactly what `tax_split_mismatch` is for. Validation applies a
--     typed HOLD; it does not refuse the row at the door. The invariant is computed into
--     `tax_split_sums` instead, so it is detectable without being unstorable.
--   * no relation between `period` and `invoice_date` — `period_deferral` is a hold type.

CREATE TABLE invoices (
  id                       TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  reference                TEXT NOT NULL,
  normalised_reference     TEXT NOT NULL,
  vendor_id                TEXT NOT NULL CHECK (length(btrim(vendor_id)) > 0),
  vendor_name_raw          TEXT NOT NULL,

  invoice_date             DATE NOT NULL,
  received_date            DATE NOT NULL,
  due_date                 DATE,
  -- Accounting period, `YYYY-MM`.
  period                   TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),

  -- Signed: a credit note carries the sign of the document.
  gross_paise              BIGINT NOT NULL,
  net_paise                BIGINT NOT NULL,

  tax_total_paise          BIGINT NOT NULL,
  tax_igst_paise           BIGINT NOT NULL,
  tax_cgst_paise           BIGINT NOT NULL,
  tax_sgst_paise           BIGINT NOT NULL,
  tax_cess_paise           BIGINT NOT NULL,
  -- The contract invariant, computed rather than enforced. See the header.
  tax_split_sums           BOOLEAN GENERATED ALWAYS AS (
    tax_total_paise = tax_igst_paise + tax_cgst_paise + tax_sgst_paise + tax_cess_paise
  ) STORED,

  currency                 TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  is_credit_note           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set on recurring or instalment documents so duplicate detection can stand down.
  recurrence               recurrence_kind,
  purchase_order_reference TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invoices_vendor_id_idx ON invoices (vendor_id);
CREATE INDEX invoices_normalised_reference_idx ON invoices (normalised_reference);
CREATE INDEX invoices_period_idx ON invoices (period);
-- The duplicate-candidate probe: same vendor, same amount, same date.
CREATE INDEX invoices_duplicate_probe_idx ON invoices (vendor_id, gross_paise, invoice_date);

COMMENT ON TABLE invoices IS
  'Supplier documents. Money is BIGINT paise throughout; there is no rupees column anywhere in this schema.';
COMMENT ON COLUMN invoices.tax_split_sums IS
  'Computed: does igst+cgst+sgst+cess equal the stated total. False is a tax_split_mismatch conflict, not a rejected row.';
COMMENT ON COLUMN invoices.recurrence IS
  'Monthly/quarterly/instalment documents legitimately repeat; duplicate detection stands down on them.';
