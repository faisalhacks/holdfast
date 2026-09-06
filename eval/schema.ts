// W03 — eval harness. Input validation.
//
// Everything that enters the harness from outside — the dataset on disk, the holdout that
// lives outside the repository, a system's decisions — is validated here before it is
// scored. Two reasons, and neither is ceremony:
//
//   1. The harness is the thing that judges the engine. A judge that crashes on a field it
//      did not expect stops being a judge. `pnpm eval` must run to completion and write a
//      report; a malformed row becomes a recorded note, not a stack trace.
//   2. The house rule is that the LLM proposes and deterministic code verifies. The LLM
//      baseline's output goes through the SAME parser as every other system's, and an id
//      it invented that is not in the ledger is dropped here, counted, and reported.
//
// The row shapes below are PROJECTIONS of `lib/types.ts`, not redefinitions of it: the
// field names are the contract's, the harness reads only the fields it scores, and unknown
// keys pass through untouched so that a richer generator output still loads.

import { z } from 'zod';
import {
  HOLD_TYPES,
  STRATA,
  CONFLICT_CODES,
  CONFLICT_SEVERITIES,
  EVAL_DATASETS,
} from '../lib/types';
import type {
  ConflictCode,
  ConflictSeverity,
  FieldPath,
  HoldType,
  InvoiceId,
  IsoDate,
  Paise,
  PaymentId,
  Stratum,
  EvalDatasetName,
} from '../lib/types';

/**
 * The contract's scalars are nominally branded and the brand is type-level only. This is
 * the single place a raw JSON value acquires one, which is exactly where validation is.
 */
const brand = <T>(value: string | number): T => value as unknown as T;

/**
 * Integer minor units, as they appear in a JSON file. A generator may emit paise as a JSON
 * number or as a BIGINT-shaped decimal string; both are integers and both are accepted.
 * There is no float path here and there is no float path anywhere else either.
 */
const integerMinorUnits = z.union([
  z.number().int(),
  z.string().regex(/^-?\d+$/).transform((text) => Number.parseInt(text, 10)),
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ── dataset rows ─────────────────────────────────────────────────────────────

const invoiceRow = z
  .object({
    id: z.string().min(1),
    reference: z.string().default(''),
    normalised_reference: z.string().optional(),
    vendor_id: z.string().nullish(),
    vendor_name_raw: z.string().default(''),
    invoice_date: isoDate.nullish(),
    period: z.string().nullish(),
    gross_paise: integerMinorUnits,
    is_credit_note: z.boolean().default(false),
  })
  .passthrough();

const paymentRow = z
  .object({
    id: z.string().min(1),
    value_date: isoDate.nullish(),
    amount_paise: integerMinorUnits,
    narration_raw: z.string().default(''),
    narration_normalised: z.string().optional(),
    reference_extracted: z.string().nullish(),
    vendor_name_extracted: z.string().nullish(),
  })
  .passthrough();

const truthRowSchema = z
  .object({
    invoice_id: z.string().min(1),
    // Explicit null means NO match exists. An empty array would be ambiguous, so it is
    // normalised to null on the way in and the ambiguity is recorded as a note.
    payment_ids: z.array(z.string()).nullable(),
    expected_hold_type: z.enum(HOLD_TYPES).nullable(),
    stratum: z.enum(STRATA),
    dataset: z.enum(EVAL_DATASETS).default('selection'),
    note: z.string().default(''),
  })
  .passthrough();

/** A file may be a bare array or `{ invoices: [...] }` / `{ payments: [...] }` / etc. */
const unwrap = (raw: unknown, key: string): unknown => {
  if (Array.isArray(raw)) return raw;
  if (raw !== null && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const inner = record[key] ?? record['rows'] ?? record['data'];
    if (Array.isArray(inner)) return inner;
  }
  return raw;
};

export interface EvalInvoice {
  readonly id: InvoiceId;
  readonly reference: string;
  readonly vendor_name_raw: string;
  readonly invoice_date: IsoDate | null;
  readonly period: string | null;
  readonly gross_paise: Paise;
  readonly is_credit_note: boolean;
}

export interface EvalPayment {
  readonly id: PaymentId;
  readonly value_date: IsoDate | null;
  readonly amount_paise: Paise;
  readonly narration_raw: string;
  readonly reference_extracted: string | null;
  readonly vendor_name_extracted: string | null;
}

export interface EvalTruthRow {
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[] | null;
  readonly expected_hold_type: HoldType | null;
  readonly stratum: Stratum;
  readonly dataset: EvalDatasetName;
  readonly note: string;
}

export interface ParseOutcome<T> {
  readonly rows: readonly T[];
  readonly rejected: number;
  readonly problems: readonly string[];
}

function parseRows<S extends z.ZodTypeAny, T>(
  raw: unknown,
  key: string,
  schema: S,
  map: (value: z.infer<S>) => T,
  label: string
): ParseOutcome<T> {
  const list = unwrap(raw, key);
  if (!Array.isArray(list)) {
    return { rows: [], rejected: 0, problems: [`${label}: file is not an array of rows`] };
  }
  const rows: T[] = [];
  const problems: string[] = [];
  let rejected = 0;
  for (let i = 0; i < list.length; i += 1) {
    const parsed = schema.safeParse(list[i]);
    if (parsed.success) {
      rows.push(map(parsed.data));
    } else {
      rejected += 1;
      if (problems.length < 5) {
        problems.push(`${label}[${i}]: ${parsed.error.issues[0]?.message ?? 'invalid row'}`);
      }
    }
  }
  return { rows, rejected, problems };
}

export const parseInvoices = (raw: unknown): ParseOutcome<EvalInvoice> =>
  parseRows(raw, 'invoices', invoiceRow, (v) => ({
    id: brand<InvoiceId>(v.id),
    reference: v.reference,
    vendor_name_raw: v.vendor_name_raw,
    invoice_date: v.invoice_date == null ? null : brand<IsoDate>(v.invoice_date),
    period: v.period ?? null,
    gross_paise: brand<Paise>(v.gross_paise),
    is_credit_note: v.is_credit_note,
  }), 'invoices');

export const parsePayments = (raw: unknown): ParseOutcome<EvalPayment> =>
  parseRows(raw, 'payments', paymentRow, (v) => ({
    id: brand<PaymentId>(v.id),
    value_date: v.value_date == null ? null : brand<IsoDate>(v.value_date),
    amount_paise: brand<Paise>(v.amount_paise),
    narration_raw: v.narration_raw,
    reference_extracted: v.reference_extracted ?? null,
    vendor_name_extracted: v.vendor_name_extracted ?? null,
  }), 'payments');

export const parseTruth = (raw: unknown): ParseOutcome<EvalTruthRow> =>
  parseRows(raw, 'truth', truthRowSchema, (v) => ({
    invoice_id: brand<InvoiceId>(v.invoice_id),
    payment_ids:
      v.payment_ids === null || v.payment_ids.length === 0
        ? null
        : v.payment_ids.map((id) => brand<PaymentId>(id)),
    expected_hold_type: v.expected_hold_type,
    stratum: v.stratum,
    dataset: v.dataset,
    note: v.note,
  }), 'truth');

/** Optional `<root>/stratification.json`: the DECLARED mix, so realised can disagree. */
export const declaredMixSchema = z.record(z.enum(STRATA), z.number().int().nonnegative());

// ── what a system under evaluation returns ───────────────────────────────────

const conflictSchema = z
  .object({
    code: z.enum(CONFLICT_CODES),
    field_path: z.string().default('invoice'),
    clause: z.string().default(''),
    severity: z.enum(CONFLICT_SEVERITIES).default('material'),
  })
  .passthrough();

/**
 * One decision about one invoice.
 *
 * `requires_human` is the system's own declaration that a named person must act before
 * this invoice can move. It is what coverage is computed from: an auto-releasing hold is
 * decided without a human; a hold needing a named release is not. A system that leaves the
 * field off is treated as requiring a human, because the safe reading of silence is that
 * nobody has decided.
 */
export const systemOutcomeSchema = z
  .object({
    invoice_id: z.string().min(1),
    action: z.enum(['auto_clear', 'hold', 'unmatched']),
    payment_ids: z.array(z.string()).default([]),
    hold_type: z.enum(HOLD_TYPES).nullable().default(null),
    requires_human: z.boolean().default(true),
    conflicts: z.array(conflictSchema).default([]),
  })
  .passthrough();

export interface SystemConflict {
  readonly code: ConflictCode;
  readonly field_path: FieldPath;
  readonly clause: string;
  readonly severity: ConflictSeverity;
}

export interface SystemOutcome {
  readonly invoice_id: InvoiceId;
  readonly action: 'auto_clear' | 'hold' | 'unmatched';
  readonly payment_ids: readonly PaymentId[];
  readonly hold_type: HoldType | null;
  readonly requires_human: boolean;
  readonly conflicts: readonly SystemConflict[];
}

export interface OutcomeParse {
  readonly outcomes: readonly SystemOutcome[];
  readonly problems: readonly string[];
}

/**
 * Validate a system's decisions against the ledger it was given.
 *
 * A payment id that is not in the ledger is KEPT IN THE SET and counted, not silently
 * removed. This matters for the LLM baseline, which can invent an id that looks plausible:
 * dropping it would leave a set that might happen to equal truth, and the system would be
 * credited with a clear it did not make. A set naming a payment that does not exist is not
 * the truth set, so it fails set equality and is scored as the false clear it is. The
 * harness does not quietly repair a system's output to flatter it.
 */
export function parseSystemOutcomes(
  raw: unknown,
  knownInvoices: ReadonlySet<string>,
  knownPayments: ReadonlySet<string>
): OutcomeParse {
  if (!Array.isArray(raw)) {
    return { outcomes: [], problems: ['system returned something that is not an array of outcomes'] };
  }
  const outcomes: SystemOutcome[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  let invented = 0;
  let unknownInvoice = 0;
  let duplicated = 0;

  for (const entry of raw) {
    const parsed = systemOutcomeSchema.safeParse(entry);
    if (!parsed.success) {
      if (problems.length < 5) problems.push(`outcome rejected: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    const value = parsed.data;
    if (!knownInvoices.has(value.invoice_id)) { unknownInvoice += 1; continue; }
    if (seen.has(value.invoice_id)) { duplicated += 1; continue; }
    seen.add(value.invoice_id);

    const kept: PaymentId[] = [];
    for (const id of value.payment_ids) {
      if (!knownPayments.has(id)) invented += 1;
      kept.push(brand<PaymentId>(id));
    }
    const uniqueKept = [...new Set(kept)];

    // Two normalisations, both of which cost the system rather than help it:
    //
    //   An auto-clear with nothing left in it is not an auto-clear. It becomes unmatched,
    //   which routes to a human, which is the honest reading of "I cleared nothing".
    //
    //   An auto-clear that the system itself says needs a named human is not an auto-clear
    //   either. It becomes the hold it declared, or unmatched. Nobody gets coverage credit
    //   for a decision they said a person still has to make.
    let action: 'auto_clear' | 'hold' | 'unmatched' = value.action;
    if (action === 'auto_clear' && uniqueKept.length === 0) action = 'unmatched';
    if (action === 'auto_clear' && value.requires_human) action = value.hold_type === null ? 'unmatched' : 'hold';

    outcomes.push({
      invoice_id: brand<InvoiceId>(value.invoice_id),
      action,
      payment_ids: uniqueKept,
      hold_type: value.hold_type,
      requires_human: value.requires_human,
      conflicts: value.conflicts.map((c) => ({
        code: c.code,
        field_path: brand<FieldPath>(c.field_path),
        clause: c.clause,
        severity: c.severity,
      })),
    });
  }

  if (invented > 0) {
    problems.push(
      `${invented} cleared payment id(s) are not in the ledger; they were kept in the set, so ` +
        'those clears cannot equal truth and are scored as false clears'
    );
  }
  if (unknownInvoice > 0) problems.push(`${unknownInvoice} outcome(s) named an invoice not in the ledger`);
  if (duplicated > 0) problems.push(`${duplicated} duplicate outcome(s) for the same invoice were dropped`);

  return { outcomes, problems };
}
