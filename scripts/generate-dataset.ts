// HOLDFAST — W02. The dataset generator.
//
//   tsx scripts/generate-dataset.ts                 both sets (selection + holdout)
//   tsx scripts/generate-dataset.ts --dataset selection
//   tsx scripts/generate-dataset.ts --dataset holdout --out <dir>
//   tsx scripts/generate-dataset.ts --check         regenerate and diff against what is on disk
//
// TWO SETS, ONE GENERATOR, TWO SEEDS.
//
//   selection (200 invoices, seed 20260906) -> data/          committed, and the set every
//                                                             later sweep agent optimises against.
//   holdout   ( 60 invoices, seed 20260907) -> outside the repo, NEVER committed.
//
// The holdout exists because selecting the winner of a twenty-way normalisation search on
// the same 200 rows we then report is fitting to the test set. It is written outside the
// repository rather than gitignored, because sparse-checkout controls the working tree and
// not the object store: a committed holdout is reachable with `git cat-file` by any agent
// that thinks to try. Only its sha256 digests are committed, by `pnpm freeze`, into
// data/MANIFEST — before a single sweep agent spawns. data/holdout.spec.json carries the
// seed, the proportions and this entrypoint so anyone can regenerate it byte-identically
// and check those digests.
//
// THE FIREWALL. This generator has never seen engine/, eval/ or app/. It performs no
// normalisation of any kind: `normalised_reference`, `narration_normalised` and
// `normalised_name` are emitted byte-identical to their raw counterparts, and every
// extraction field on a statement row (`reference_extracted`, `vendor_name_extracted`,
// `vendor_id`) is null with `application_status` at `unidentified`, because an
// unreconciled bank statement has nothing applied and recovering those values is exactly
// the work being measured. Normalisation performed identically on both sides is the first
// thing a critic looks for and the fastest way to turn our headline into an artifact.
//
// Money is integer paise throughout. No value in this file is ever a float.
// All names, tax identifiers and account fragments are invented; see scripts/vocab.ts.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPLICATION_STATUSES,
  EVAL_DATASETS,
  HOLD_TYPES,
  STRATA,
  type EvalDatasetName,
  type HoldType,
  type Invoice,
  type InvoiceId,
  type IsoDate,
  type IsoTimestamp,
  type Paise,
  type Payment,
  type PaymentId,
  type Stratum,
  type TaxBreakdown,
  type TruthRow,
  type Vendor,
  type VendorId,
} from '../lib/types.js';

import {
  addMonths,
  allocate,
  at,
  chance,
  civilFromDays,
  daysFromCivil,
  intBetween,
  isoDate,
  isoPeriod,
  mulberry32,
  pickOne,
  shortDate,
  stampAt,
  type Rng,
} from './prng.js';

import {
  corruptReference,
  driftReference,
  gstinVariant,
  mangleVendor,
  renderBulkNarration,
  renderNarration,
  renderReferencelessNarration,
  scuffVendorNameOnInvoice,
  truncateNarration,
  GSTIN_VARIANT_STYLES,
  NARRATION_TEMPLATES,
  REFERENCE_DRIFT_STYLES,
  VENDOR_MANGLE_STYLES,
  type NarrationSlots,
} from './mangle.js';

import {
  BUYER_STATE,
  NOISE_FRAGMENTS,
  REFERENCE_CONVENTIONS,
  VENDOR_STATES,
  VENDOR_STEMS,
  VENDOR_SUFFIXES,
  VENDOR_TRADES,
} from './vocab.js';

// ─────────────────────────────────────────────────────────────────────────────
// The committed constants. Change any of these and both datasets change.
// ─────────────────────────────────────────────────────────────────────────────

/** The committed seed. Regeneration at this seed is byte-identical, forever. */
export const SELECTION_SEED = 20260906;
/** The holdout seed. Deliberately `SELECTION_SEED + 1`, and recorded in holdout.spec.json. */
export const HOLDOUT_SEED = SELECTION_SEED + 1;

export const SELECTION_INVOICE_COUNT = 200;
export const HOLDOUT_INVOICE_COUNT = 60;

export const GENERATOR_VERSION = '1.0.0';

/** The declared mix. The generator asserts the realised mix equals this, exactly. */
export const DECLARED_SELECTION: Readonly<Record<Stratum, number>> = {
  clean: 120,
  duplicate: 20,
  tolerance: 15,
  cardinality: 15,
  reference: 15,
  period: 15,
};

const STRATUM_WEIGHTS: readonly number[] = STRATA.map((s) => DECLARED_SELECTION[s]);

/** Proportions the holdout keeps. Whole invoices come out of largest-remainder rounding. */
export function proportions(): Readonly<Record<Stratum, number>> {
  const out: Record<Stratum, number> = {
    clean: 0, duplicate: 0, tolerance: 0, cardinality: 0, reference: 0, period: 0,
  };
  for (const s of STRATA) out[s] = DECLARED_SELECTION[s] / SELECTION_INVOICE_COUNT;
  return out;
}

export function declaredFor(count: number): Readonly<Record<Stratum, number>> {
  const alloc = allocate(STRATUM_WEIGHTS, count);
  const out: Record<Stratum, number> = {
    clean: 0, duplicate: 0, tolerance: 0, cardinality: 0, reference: 0, period: 0,
  };
  STRATA.forEach((s, i) => {
    out[s] = at(alloc, i);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branded-scalar constructors. `lib/brands.ts` is W01's and does not exist yet, so the
// generator does its own narrowing rather than reaching into another worker's directory.
// ─────────────────────────────────────────────────────────────────────────────

const paise = (n: number): Paise => {
  if (!Number.isSafeInteger(n)) throw new Error(`generator: money must be an integer count of paise, got ${n}`);
  return n as Paise;
};
const isoD = (s: string): IsoDate => s as IsoDate;
const ts = (s: string): IsoTimestamp => s as IsoTimestamp;
const invoiceId = (s: string): InvoiceId => s as InvoiceId;
const paymentId = (s: string): PaymentId => s as PaymentId;
const vendorId = (s: string): VendorId => s as VendorId;

// ─────────────────────────────────────────────────────────────────────────────
// Internal build records
// ─────────────────────────────────────────────────────────────────────────────

interface VendorRec {
  readonly row: Vendor;
  readonly state: string;
  readonly convention: string;
  readonly gstinRaw: string | null;
  seq: number;
}

interface NarrationPlan {
  readonly mode: 'normal' | 'displaced' | 'referenceless' | 'foreign_reference';
  readonly template: number;
  readonly vendorStyle: number;
  readonly refDrift: number;
  readonly gstinStyle: number | null;
  readonly maxLen: number;
  /** Used by `foreign_reference`: a reference belonging to a different invoice. */
  readonly overrideReference: string | null;
}

type Settlement =
  | { readonly kind: 'single'; readonly amount: number; readonly valueDay: number; readonly narration: NarrationPlan }
  | { readonly kind: 'bulk'; readonly group: string }
  | {
      readonly kind: 'split';
      readonly parts: readonly number[];
      readonly startDay: number;
      readonly gapDays: number;
      readonly narration: NarrationPlan;
    }
  | { readonly kind: 'none' };

interface Row {
  readonly invoice: Invoice;
  readonly vendor: VendorRec;
  readonly stratum: Stratum;
  readonly variant: string;
  readonly expectedHold: HoldType | null;
  readonly note: string;
  settlement: Settlement;
}

interface PaymentDraft {
  readonly seq: number;
  readonly valueDay: number;
  readonly amount: number;
  readonly narration: string;
  readonly settles: readonly string[];
}

export interface BuiltDataset {
  readonly dataset: EvalDatasetName;
  readonly seed: number;
  readonly vendors: readonly Vendor[];
  readonly invoices: readonly Invoice[];
  readonly payments: readonly Payment[];
  readonly truth: readonly TruthRow[];
  readonly declared: Readonly<Record<Stratum, number>>;
  readonly realised: Readonly<Record<Stratum, number>>;
  readonly bulkSize: number;
  readonly decoyCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money
// ─────────────────────────────────────────────────────────────────────────────

const RUPEE = 100;
const GST_RATES = [5, 12, 18, 18, 18, 18, 12, 28] as const;

/** Realistic invoice values, in integer paise. Odd paise on purpose about a third of the time. */
function taxableValue(rng: Rng): number {
  const band = rng();
  const raw =
    band < 0.55 ? intBetween(rng, 200000, 9000000)
    : band < 0.85 ? intBetween(rng, 9000000, 60000000)
    : band < 0.97 ? intBetween(rng, 60000000, 250000000)
    : intBetween(rng, 250000000, 900000000);
  return chance(rng, 0.68) ? raw - (raw % RUPEE) : raw;
}

interface Money {
  readonly net: number;
  readonly gross: number;
  readonly tax: TaxBreakdown;
  readonly rate: number;
}

/**
 * `allocation` is the deliberate defect: `wrong_split` books an intra-state supply as IGST.
 * The sum invariant still holds — `total_paise` equals the parts — which is exactly why
 * the error survives to production in real ledgers.
 */
function buildMoney(
  rng: Rng,
  v: VendorRec,
  opts: { allocation?: 'correct' | 'wrong_split'; taxInflationPaise?: number; distSkewPaise?: number } = {}
): Money {
  const net = taxableValue(rng);
  const rate = pickOne(rng, GST_RATES);
  const gstAmount = Math.round((net * rate) / 100) + (opts.taxInflationPaise ?? 0);
  const cess = rate === 28 && chance(rng, 0.35) ? Math.round((net * 12) / 100) : 0;
  const interState = v.state !== BUYER_STATE;
  const bookAsIgst = opts.allocation === 'wrong_split' ? true : interState;

  const igst = bookAsIgst ? gstAmount : 0;
  const cgst = bookAsIgst ? 0 : Math.floor(gstAmount / 2);
  const sgst = bookAsIgst ? 0 : gstAmount - cgst;
  const total = gstAmount + cess;

  if (total !== igst + cgst + sgst + cess) {
    throw new Error('generator: tax parts must sum to total_paise');
  }

  return {
    net,
    rate,
    gross: net + total + (opts.distSkewPaise ?? 0),
    tax: {
      total_paise: paise(total),
      igst_paise: paise(igst),
      cgst_paise: paise(cgst),
      sgst_paise: paise(sgst),
      cess_paise: paise(cess),
    },
  };
}

/** Split `amount` into `n` positive integer parts. The last part carries the remainder. */
function splitAmount(rng: Rng, amount: number, n: number): number[] {
  const parts: number[] = [];
  let left = amount;
  for (let i = 0; i < n - 1; i += 1) {
    const share = Math.floor(left / (n - i));
    const jitter = intBetween(rng, -Math.floor(share / 8), Math.floor(share / 8));
    const part = Math.max(RUPEE, share + jitter);
    parts.push(part);
    left -= part;
  }
  parts.push(left);
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar helpers local to the dataset window
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_START = daysFromCivil(2026, 1, 5);
const WINDOW_DAYS = 170;

/** `YYYY-MM-DD` back to a day number. Pure string arithmetic, no `Date`. */
function dayOf(iso: string): number {
  const digits = (from: number, to: number): number => {
    let n = 0;
    for (let i = from; i < to; i += 1) n = n * 10 + (iso.charCodeAt(i) - 48);
    return n;
  };
  return daysFromCivil(digits(0, 4), digits(5, 7), digits(8, 10));
}

function monthEnd(day: number): number {
  const c = civilFromDays(day);
  const nextMonth = c.m === 12 ? daysFromCivil(c.y + 1, 1, 1) : daysFromCivil(c.y, c.m + 1, 1);
  return nextMonth - 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendors
// ─────────────────────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';

function syntheticGstin(rng: Rng, state: string, stem: string): string {
  const stemLetters = stem.toUpperCase().replace(/[^A-Z]/g, '');
  const l3 = (stemLetters + 'XYZ').slice(0, 3);
  const d4 = `${intBetween(rng, 0, 9)}${intBetween(rng, 0, 9)}${intBetween(rng, 0, 9)}${intBetween(rng, 0, 9)}`;
  const l1 = at(LETTERS.split(''), intBetween(rng, 0, LETTERS.length - 1));
  const entity = `${intBetween(rng, 1, 9)}`;
  const check = at(LETTERS.split(''), intBetween(rng, 0, LETTERS.length - 1));
  // 2 state + 10 PAN-shaped (always ZZ-prefixed, so it cannot be an issued registration)
  // + 1 entity + literal Z + 1 check = 15.
  return `${state}ZZ${l3}${d4}${l1}${entity}Z${check}`;
}

function buildVendors(rng: Rng, tag: string, count: number): VendorRec[] {
  const out: VendorRec[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const stem = at(VENDOR_STEMS, i % VENDOR_STEMS.length);
    let name = '';
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const trade = pickOne(rng, VENDOR_TRADES);
      const suffix = pickOne(rng, VENDOR_SUFFIXES);
      name = `${stem} ${trade} ${suffix}`;
      if (!used.has(name)) break;
    }
    used.add(name);

    const state = chance(rng, 0.35) ? at(VENDOR_STATES, 1) : at(VENDOR_STATES, 0);
    const gstin = chance(rng, 0.92) ? syntheticGstin(rng, state, stem) : null;
    const id = `VEN-${tag}-${String(i + 1).padStart(3, '0')}`;

    out.push({
      row: {
        id: vendorId(id),
        name,
        // NOT normalised. See the firewall note at the top of this file.
        normalised_name: name,
        tax_identifier: gstin,
      },
      state,
      convention: at(REFERENCE_CONVENTIONS, i % REFERENCE_CONVENTIONS.length),
      gstinRaw: gstin,
      seq: intBetween(rng, 120, 8400),
    });
  }
  return out;
}

function nextReference(v: VendorRec, rng: Rng, day: number): string {
  v.seq += intBetween(rng, 1, 4);
  const c = civilFromDays(day);
  const yy = String(c.y % 100).padStart(2, '0');
  return v.convention
    .split('{Y}').join(String(c.y))
    .split('{YY1}').join(String((c.y + 1) % 100).padStart(2, '0'))
    .split('{YY}').join(yy)
    .split('{MM}').join(String(c.m).padStart(2, '0'))
    .split('{ST}').join(v.state)
    .split('{N6}').join(String(v.seq).padStart(6, '0'))
    .split('{N5}').join(String(v.seq).padStart(5, '0'))
    .split('{N4}').join(String(v.seq).padStart(4, '0'))
    .split('{N3}').join(String(v.seq % 1000).padStart(3, '0'));
}

/** Change the final digit. Used to build the reference that ties with another invoice's. */
function shiftLastDigit(ref: string): string {
  const chars = ref.split('');
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const c = at(chars, i);
    if (c >= '0' && c <= '9') {
      chars[i] = String.fromCharCode(48 + ((c.charCodeAt(0) - 48 + 5) % 10));
      return chars.join('');
    }
  }
  return `${ref}9`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Narration
// ─────────────────────────────────────────────────────────────────────────────

const NARRATION_LENGTHS = [38, 44, 52, 60, 72, 88, 104, 118, 140] as const;

function narrationPlan(rng: Rng, i: number, mode: NarrationPlan['mode'], overrideReference: string | null): NarrationPlan {
  return {
    mode,
    template: (i * 5 + intBetween(rng, 0, 2)) % NARRATION_TEMPLATES,
    vendorStyle: (i * 3 + intBetween(rng, 0, 1)) % VENDOR_MANGLE_STYLES,
    refDrift: (i * 7 + intBetween(rng, 0, 2)) % REFERENCE_DRIFT_STYLES,
    gstinStyle: chance(rng, 0.28) ? intBetween(rng, 0, GSTIN_VARIANT_STYLES - 1) : null,
    maxLen: at(NARRATION_LENGTHS, intBetween(rng, 0, NARRATION_LENGTHS.length - 1)),
    overrideReference,
  };
}

function slotsFor(rng: Rng, v: VendorRec, plan: NarrationPlan, valueDay: number): NarrationSlots {
  return {
    payerSlot: '',
    referenceSlot: '',
    utr: `UTR${intBetween(rng, 100000000, 999999999)}`,
    gstin: v.gstinRaw !== null && plan.gstinStyle !== null ? gstinVariant(v.gstinRaw, plan.gstinStyle) : null,
    valueDateShort: shortDate(valueDay),
    maskedAccount: `XXXX${String(intBetween(rng, 1000, 9999))}`,
    noise: pickOne(rng, NOISE_FRAGMENTS),
    batchNumber: intBetween(rng, 100, 9999),
  };
}

function buildNarration(rng: Rng, row: Row, plan: NarrationPlan, valueDay: number): string {
  const v = row.vendor;
  const base = slotsFor(rng, v, plan, valueDay);
  const short = mangleVendor(v.row.name, plan.vendorStyle, rng);
  const sourceRef = plan.overrideReference ?? row.invoice.reference;
  const drifted = driftReference(sourceRef, plan.refDrift);

  if (plan.mode === 'referenceless') {
    return truncateNarration(renderReferencelessNarration({ ...base, payerSlot: short }, rng), plan.maxLen);
  }

  // FIELD DISPLACEMENT: the reference lands where a parser expects the payer, and the
  // payer's shorthand lands where it expects the reference.
  const slots: NarrationSlots =
    plan.mode === 'displaced'
      ? { ...base, payerSlot: drifted, referenceSlot: short }
      : { ...base, payerSlot: short, referenceSlot: drifted };

  return truncateNarration(renderNarration(plan.template, slots), plan.maxLen);
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoice construction
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceSpec {
  readonly vendor: VendorRec;
  readonly invoiceDay: number;
  readonly receivedDay: number;
  readonly period?: string;
  readonly money: Money;
  readonly reference?: string;
  readonly isCreditNote?: boolean;
  readonly recurrence?: Invoice['recurrence'];
}

function buildInvoice(rng: Rng, tag: string, index: number, spec: InvoiceSpec): Invoice {
  const { vendor: v, invoiceDay, receivedDay, money } = spec;
  const reference = spec.reference ?? nextReference(v, rng, invoiceDay);
  const sign = spec.isCreditNote === true ? -1 : 1;
  const dueOffset = pickOne(rng, [15, 30, 30, 45, 60, 90]);

  return {
    id: invoiceId(`INV-${tag}-${String(index + 1).padStart(4, '0')}`),
    reference,
    // NOT normalised. The generator hands the engine nothing it has to earn.
    normalised_reference: reference,
    vendor_id: v.row.id,
    vendor_name_raw: scuffVendorNameOnInvoice(v.row.name, rng),
    invoice_date: isoD(isoDate(invoiceDay)),
    received_date: isoD(isoDate(receivedDay)),
    due_date: isoD(isoDate(invoiceDay + dueOffset)),
    period: spec.period ?? isoPeriod(invoiceDay),
    gross_paise: paise(sign * money.gross),
    net_paise: paise(sign * money.net),
    tax: {
      total_paise: paise(sign * money.tax.total_paise),
      igst_paise: paise(sign * money.tax.igst_paise),
      cgst_paise: paise(sign * money.tax.cgst_paise),
      sgst_paise: paise(sign * money.tax.sgst_paise),
      cess_paise: paise(sign * money.tax.cess_paise),
    },
    currency: 'INR',
    is_credit_note: spec.isCreditNote === true,
    recurrence: spec.recurrence ?? null,
    purchase_order_reference: chance(rng, 0.58)
      ? `PO/${civilFromDays(invoiceDay).y}/${String(intBetween(rng, 1000, 9999))}`
      : null,
    created_at: ts(stampAt(receivedDay, 9 + (index % 8), (index * 13) % 60, (index * 29) % 60)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The build
// ─────────────────────────────────────────────────────────────────────────────

export function buildDataset(dataset: EvalDatasetName, seed: number, invoiceCount: number): BuiltDataset {
  const rng = mulberry32(seed);
  const tag = dataset === 'selection' ? 'S' : 'H';
  const declared = declaredFor(invoiceCount);

  const vendors = buildVendors(rng, tag, Math.max(24, Math.round(invoiceCount * 0.3)));
  const rows: Row[] = [];
  const push = (r: Row): Row => {
    rows.push(r);
    return r;
  };
  const nextIndex = (): number => rows.length;

  // ── clean ────────────────────────────────────────────────────────────────────
  // Clean means "no injected defect and exactly one correct settlement", NOT "easy".
  // Every clean row still carries truncated, case-mangled, delimiter-drifted narration.
  const cleanCount = declared.clean;
  const recurringSeries = Math.max(1, Math.floor(cleanCount / 40));
  const recurringPerSeries = 4;
  const recurringCount = Math.min(cleanCount, recurringSeries * recurringPerSeries);

  // LEGITIMATE RECURRING CHARGES. Same vendor, same amount, month after month, each with
  // its own settlement. A vendor+amount duplicate rule flags every one of them, and false
  // positives on recurring invoices are the real-world failure — so truth says clean.
  for (let s = 0; s < recurringSeries; s += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const firstDay = WINDOW_START + intBetween(rng, 0, 25);
    for (let m = 0; m < recurringPerSeries; m += 1) {
      if (rows.length >= recurringCount) break;
      const invoiceDay = addMonths(firstDay, m);
      // Series 0 posts two consecutive months in one batch, so vendor+amount+date collides
      // on the received date while the documents are legitimately different periods.
      const batched = s === 0 && (m === 1 || m === 2);
      const receivedDay = batched ? addMonths(firstDay, 2) + 1 : invoiceDay + intBetween(rng, 1, 4);
      const i = nextIndex();
      const invoice = buildInvoice(rng, tag, i, {
        vendor: v, invoiceDay, receivedDay, money, recurrence: 'monthly',
      });
      const valueDay = receivedDay + intBetween(rng, 4, 21);
      push({
        invoice, vendor: v, stratum: 'clean', variant: 'recurring_monthly',
        expectedHold: null,
        note: `legitimate recurring monthly charge, instalment ${m + 1} of ${recurringPerSeries}${batched ? '; posted in the same batch as its neighbour so vendor+amount+received date collide' : ''}`,
        settlement: { kind: 'single', amount: money.gross, valueDay, narration: narrationPlan(rng, i, 'normal', null) },
      });
    }
  }

  const normalCleanCount = cleanCount - rows.length;
  for (let n = 0; n < normalCleanCount; n += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS);
    const receivedDay = invoiceDay + intBetween(rng, 0, 9);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    const valueDay = receivedDay + intBetween(rng, 3, 38);
    // A ninth of the clean rows are displaced too: the reference still resolves, so a
    // matcher that reads both fields clears them and a positional parser does not.
    const mode: NarrationPlan['mode'] = n % 9 === 4 ? 'displaced' : 'normal';
    push({
      invoice, vendor: v, stratum: 'clean', variant: mode === 'displaced' ? 'clean_displaced' : 'clean',
      expectedHold: null,
      note: mode === 'displaced'
        ? 'clean 1:1; bank narration carries the reference token in the payer position'
        : 'clean 1:1; bank narration truncated, case-mangled and delimiter-drifted',
      settlement: { kind: 'single', amount: money.gross, valueDay, narration: narrationPlan(rng, i, mode, null) },
    });
  }

  const cleanRows = rows.slice(0, cleanCount);

  // ── duplicate ────────────────────────────────────────────────────────────────
  // The duplicate document itself is the row. It was never paid — paying it twice is the
  // loss the hold exists to prevent — so truth carries an explicit null.
  const dupCount = declared.duplicate;
  const dupAlloc = allocate([10, 10], dupCount);
  const originPoolStart = recurringCount;
  const originPoolSize = Math.max(1, cleanCount - recurringCount);
  const originalFor = (k: number, ofN: number): Row =>
    at(cleanRows, originPoolStart + Math.floor((k * originPoolSize) / Math.max(1, ofN)));

  {
    let k = 0;
    for (let d = 0; d < at(dupAlloc, 0); d += 1, k += 1) {
      const original = originalFor(k, dupCount);
      const v = original.vendor;
      const origDay = dayOf(original.invoice.invoice_date);
      const receivedDay = origDay + intBetween(rng, 3, 16);
      const i = nextIndex();
      const invoice = buildInvoice(rng, tag, i, {
        vendor: v,
        invoiceDay: origDay,
        receivedDay,
        money: {
          net: original.invoice.net_paise,
          gross: original.invoice.gross_paise,
          rate: 0,
          tax: original.invoice.tax,
        },
        reference: original.invoice.reference,
      });
      push({
        invoice, vendor: v, stratum: 'duplicate', variant: 'same_reference',
        expectedHold: 'duplicate_candidate',
        note: `re-entry of ${original.invoice.id} under the identical reference; never settled`,
        settlement: { kind: 'none' },
      });
    }

    for (let d = 0; d < at(dupAlloc, 1); d += 1, k += 1) {
      const original = originalFor(k, dupCount);
      const v = original.vendor;
      const origDay = dayOf(original.invoice.invoice_date);
      const receivedDay = origDay + intBetween(rng, 1, 14);
      const i = nextIndex();
      const invoice = buildInvoice(rng, tag, i, {
        vendor: v,
        invoiceDay: origDay,
        receivedDay,
        money: {
          net: original.invoice.net_paise,
          gross: original.invoice.gross_paise,
          rate: 0,
          tax: original.invoice.tax,
        },
      });
      push({
        invoice, vendor: v, stratum: 'duplicate', variant: 'same_vendor_amount_date',
        expectedHold: 'duplicate_candidate',
        note: `same vendor, amount and invoice date as ${original.invoice.id} under a different reference; never settled`,
        settlement: { kind: 'none' },
      });
    }
  }

  // ── tolerance ────────────────────────────────────────────────────────────────
  const tolVariants = ['rounding', 'bank_charge', 'tds_withholding', 'early_payment_discount', 'tax_split', 'tax_total', 'dist_variance'] as const;
  const tolAlloc = allocate([3, 3, 3, 2, 2, 1, 1], declared.tolerance);
  const intraStateVendors = vendors.filter((v) => v.state === BUYER_STATE);

  tolVariants.forEach((variant, vi) => {
    for (let k = 0; k < at(tolAlloc, vi); k += 1) {
      const v =
        variant === 'tax_split' && intraStateVendors.length > 0
          ? pickOne(rng, intraStateVendors)
          : pickOne(rng, vendors);

      const money =
        variant === 'tax_split' ? buildMoney(rng, v, { allocation: 'wrong_split' })
        : variant === 'tax_total' ? buildMoney(rng, v, { taxInflationPaise: intBetween(rng, 40000, 90000) })
        : variant === 'dist_variance' ? buildMoney(rng, v, { distSkewPaise: intBetween(rng, 50000, 150000) })
        : buildMoney(rng, v);

      const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS);
      const receivedDay = invoiceDay + intBetween(rng, 0, 8);
      const i = nextIndex();
      const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
      const valueDay = receivedDay + intBetween(rng, 3, 34);

      let amount = money.gross;
      let expectedHold: HoldType | null = null;
      let note = '';

      if (variant === 'rounding') {
        const off = money.gross % RUPEE;
        amount = off !== 0 ? money.gross - off : money.gross - intBetween(rng, 1, 99);
        expectedHold = null;
        note = `settled ${money.gross - amount} paise short; rounding to the rupee, inside any sane tolerance`;
      } else if (variant === 'bank_charge') {
        const charge = pickOne(rng, [23600, 29500, 59000, 118000]);
        amount = money.gross - charge;
        expectedHold = 'price_variance';
        note = `bank charge of ${charge} paise deducted at source; net credit is short of the invoice gross`;
      } else if (variant === 'tds_withholding') {
        const tdsRate = pickOne(rng, [2, 10]);
        amount = money.gross - Math.round((money.net * tdsRate) / 100);
        expectedHold = 'price_variance';
        note = `tax withheld at ${tdsRate} percent of the taxable value; remittance is net of withholding`;
      } else if (variant === 'early_payment_discount') {
        amount = money.gross - Math.round((money.gross * 2) / 100);
        expectedHold = 'price_variance';
        note = 'early payment discount of 2 percent taken by the payer without a credit note';
      } else if (variant === 'tax_split') {
        expectedHold = 'tax_variance';
        note = 'intra-state supply booked entirely as IGST; the total is right and the allocation is not';
      } else if (variant === 'tax_total') {
        expectedHold = 'tax_amount_range';
        note = 'tax charged is outside the range implied by the taxable value; the parts still sum to the total';
      } else {
        expectedHold = 'dist_variance';
        note = 'gross does not equal taxable value plus tax; the distribution does not add up';
      }

      push({
        invoice, vendor: v, stratum: 'tolerance', variant, expectedHold, note,
        settlement: { kind: 'single', amount, valueDay, narration: narrationPlan(rng, i, 'normal', null) },
      });
    }
  });

  // ── cardinality ──────────────────────────────────────────────────────────────
  // Real bulk payments are not three invoices. The bulk here settles twelve to forty, its
  // remittance advice is cut off by the bank's narration limit after four or five
  // references, and every surviving reference is drifted differently.
  const cardCount = declared.cardinality;
  const otmFull = cardCount >= 3 ? 1 : 0;
  const partialCount = cardCount >= 5 ? 2 : cardCount >= 2 ? 1 : 0;
  const bulkFromCardinality = cardCount - otmFull - partialCount;

  for (let k = 0; k < otmFull; k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS - 60);
    const receivedDay = invoiceDay + intBetween(rng, 0, 5);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money, recurrence: 'instalment' });
    const parts = splitAmount(rng, money.gross, 4);
    push({
      invoice, vendor: v, stratum: 'cardinality', variant: 'one_to_many_full',
      expectedHold: null,
      note: 'settled by four instalment remittances that sum exactly to the gross',
      settlement: {
        kind: 'split', parts, startDay: receivedDay + intBetween(rng, 4, 12), gapDays: intBetween(rng, 9, 21),
        narration: narrationPlan(rng, i, 'normal', null),
      },
    });
  }

  for (let k = 0; k < partialCount; k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS - 40);
    const receivedDay = invoiceDay + intBetween(rng, 0, 5);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    const residual = Math.round((money.gross * intBetween(rng, 8, 25)) / 100);
    const parts = splitAmount(rng, money.gross - residual, 2);
    push({
      invoice, vendor: v, stratum: 'cardinality', variant: 'partial_settlement',
      expectedHold: 'cardinality_residual',
      note: `two part remittances leave ${residual} paise unsettled against this invoice`,
      settlement: {
        kind: 'split', parts, startDay: receivedDay + intBetween(rng, 5, 14), gapDays: intBetween(rng, 11, 26),
        narration: narrationPlan(rng, i, 'normal', null),
      },
    });
  }

  const bulkGroup = `BULK-${tag}-1`;
  for (let k = 0; k < bulkFromCardinality; k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 10, WINDOW_DAYS - 45);
    const receivedDay = invoiceDay + intBetween(rng, 0, 6);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    push({
      invoice, vendor: v, stratum: 'cardinality', variant: 'many_to_one_bulk',
      expectedHold: null,
      note: 'settled inside one bulk remittance covering many invoices; its reference may not have survived the narration limit',
      settlement: { kind: 'bulk', group: bulkGroup },
    });
  }

  // ── reference ────────────────────────────────────────────────────────────────
  const refCount = declared.reference;
  const refAlloc = allocate([5, 4, 3, 3], refCount); // no_reference, displaced, foreign_reference, tied
  const settledCleanRefs = cleanRows.map((r) => r.invoice.reference);

  for (let k = 0; k < at(refAlloc, 0); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS);
    const receivedDay = invoiceDay + intBetween(rng, 0, 7);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    push({
      invoice, vendor: v, stratum: 'reference', variant: 'no_reference',
      expectedHold: 'no_reference',
      note: 'settled by a credit whose narration carries no recoverable reference of any kind',
      settlement: {
        kind: 'single', amount: money.gross, valueDay: receivedDay + intBetween(rng, 3, 30),
        narration: narrationPlan(rng, i, 'referenceless', null),
      },
    });
  }

  for (let k = 0; k < at(refAlloc, 1); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS);
    const receivedDay = invoiceDay + intBetween(rng, 0, 7);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    push({
      invoice, vendor: v, stratum: 'reference', variant: 'displaced_reference',
      expectedHold: 'no_reference',
      note: 'field displacement: the reference sits in the payer position and the payer shorthand sits in the reference position',
      settlement: {
        kind: 'single', amount: money.gross, valueDay: receivedDay + intBetween(rng, 3, 30),
        narration: { ...narrationPlan(rng, i, 'displaced', null), maxLen: at(NARRATION_LENGTHS, intBetween(rng, 0, 4)) },
      },
    });
  }

  for (let k = 0; k < at(refAlloc, 2); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const invoiceDay = WINDOW_START + intBetween(rng, 0, WINDOW_DAYS);
    const receivedDay = invoiceDay + intBetween(rng, 0, 7);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, { vendor: v, invoiceDay, receivedDay, money });
    const foreign = pickOne(rng, settledCleanRefs);
    push({
      invoice, vendor: v, stratum: 'reference', variant: 'foreign_reference',
      expectedHold: 'matching',
      note: 'the narration quotes a reference belonging to a different invoice; only the amount and the payer point here',
      settlement: {
        kind: 'single', amount: money.gross, valueDay: receivedDay + intBetween(rng, 3, 30),
        narration: narrationPlan(rng, i, 'foreign_reference', foreign),
      },
    });
  }

  // ASSIGNMENT-FIELD DRIFT — the SAP F.13 failure. Two invoices from one vendor whose
  // amounts tie to the paise and whose references differ only where the bank truncated.
  // The twin was raised AFTER the credit landed, so a date window resolves it and nothing
  // else does. Truth is an explicit null: this invoice was never settled.
  for (let k = 0; k < at(refAlloc, 3); k += 1) {
    const twinPool = Math.max(1, cleanRows.length - recurringCount);
    const twinSource = at(cleanRows, recurringCount + ((k * 7 + 3) % twinPool));
    const twinSettlement = twinSource.settlement;
    const twinValueDay =
      twinSettlement.kind === 'single' ? twinSettlement.valueDay : WINDOW_START + WINDOW_DAYS;
    const v = twinSource.vendor;
    const invoiceDay = twinValueDay + intBetween(rng, 3, 11);
    const receivedDay = invoiceDay + intBetween(rng, 0, 4);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, {
      vendor: v,
      invoiceDay,
      receivedDay,
      money: {
        net: twinSource.invoice.net_paise,
        gross: twinSource.invoice.gross_paise,
        rate: 0,
        tax: twinSource.invoice.tax,
      },
      reference: shiftLastDigit(twinSource.invoice.reference),
    });
    push({
      invoice, vendor: v, stratum: 'reference', variant: 'assignment_field_drift',
      expectedHold: 'matching',
      note: `amount ties to the paise with ${twinSource.invoice.id} from the same vendor and the references differ by one digit; this invoice was raised after that credit landed and was never settled`,
      settlement: { kind: 'none' },
    });
  }

  // ── period ───────────────────────────────────────────────────────────────────
  const perCount = declared.period;
  const perAlloc = allocate([8, 4, 3], perCount); // misclassified, prior-period posting, credit note crossing

  for (let k = 0; k < at(perAlloc, 0); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const anchor = WINDOW_START + intBetween(rng, 20, WINDOW_DAYS - 40);
    const invoiceDay = monthEnd(anchor) - intBetween(rng, 0, 2);
    const receivedDay = invoiceDay + intBetween(rng, 2, 6);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, {
      vendor: v, invoiceDay, receivedDay, money, period: isoPeriod(receivedDay),
    });
    push({
      invoice, vendor: v, stratum: 'period', variant: 'received_next_period',
      expectedHold: 'period_deferral',
      note: `dated in ${isoPeriod(invoiceDay)} and booked to ${isoPeriod(receivedDay)} because it arrived after the cut-off`,
      settlement: {
        kind: 'single', amount: money.gross, valueDay: receivedDay + intBetween(rng, 4, 26),
        narration: narrationPlan(rng, i, 'normal', null),
      },
    });
  }

  for (let k = 0; k < at(perAlloc, 1); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const anchor = WINDOW_START + intBetween(rng, 35, WINDOW_DAYS - 30);
    const invoiceDay = monthEnd(anchor) + intBetween(rng, 1, 4);
    const receivedDay = invoiceDay + intBetween(rng, 0, 3);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, {
      vendor: v, invoiceDay, receivedDay, money, period: isoPeriod(invoiceDay - 8),
    });
    push({
      invoice, vendor: v, stratum: 'period', variant: 'posted_to_prior_period',
      expectedHold: 'period_deferral',
      note: `dated in ${isoPeriod(invoiceDay)} and posted back into ${isoPeriod(invoiceDay - 8)}`,
      settlement: {
        kind: 'single', amount: money.gross, valueDay: receivedDay + intBetween(rng, 4, 26),
        narration: narrationPlan(rng, i, 'normal', null),
      },
    });
  }

  for (let k = 0; k < at(perAlloc, 2); k += 1) {
    const v = pickOne(rng, vendors);
    const money = buildMoney(rng, v);
    const anchor = WINDOW_START + intBetween(rng, 25, WINDOW_DAYS - 35);
    const invoiceDay = monthEnd(anchor) - intBetween(rng, 0, 1);
    const receivedDay = invoiceDay + intBetween(rng, 3, 9);
    const i = nextIndex();
    const invoice = buildInvoice(rng, tag, i, {
      vendor: v, invoiceDay, receivedDay, money, period: isoPeriod(invoiceDay), isCreditNote: true,
    });
    push({
      invoice, vendor: v, stratum: 'period', variant: 'credit_note_crossing',
      expectedHold: 'credit_note_crossing',
      note: `credit note raised in ${isoPeriod(invoiceDay)} and applied in ${isoPeriod(receivedDay)}; offset against future billing, never banked`,
      settlement: { kind: 'none' },
    });
  }

  // ── the bulk remittance ──────────────────────────────────────────────────────
  // Topped up from the clean block so the bulk is a realistic size in both datasets. A
  // clean invoice swept into a bulk still has exactly one correct payment, so its truth
  // and its stratum are unchanged; the note discloses the membership.
  const bulkTarget = Math.min(40, Math.max(12, Math.round(invoiceCount * 0.11)));
  const bulkMembers: Row[] = rows.filter((r) => r.settlement.kind === 'bulk' && r.settlement.group === bulkGroup);
  const topUpNeeded = Math.max(0, bulkTarget - bulkMembers.length);
  const eligibleForTopUp = cleanRows.slice(recurringCount).filter((r) => r.settlement.kind === 'single');
  // `slice(-0)` returns the whole array, which would sweep every clean invoice into the
  // bulk. Take the tail explicitly instead.
  const topUpCandidates =
    topUpNeeded > 0 ? eligibleForTopUp.slice(Math.max(0, eligibleForTopUp.length - topUpNeeded)) : [];
  for (const r of topUpCandidates) {
    r.settlement = { kind: 'bulk', group: bulkGroup };
    bulkMembers.push(r);
  }

  // ── settlement drafts ────────────────────────────────────────────────────────
  const drafts: PaymentDraft[] = [];
  let seq = 0;

  for (const row of rows) {
    const s = row.settlement;
    if (s.kind === 'single') {
      drafts.push({
        seq: (seq += 1),
        valueDay: s.valueDay,
        amount: s.amount,
        narration: buildNarration(rng, row, s.narration, s.valueDay),
        settles: [row.invoice.id],
      });
    } else if (s.kind === 'split') {
      s.parts.forEach((part, pi) => {
        const valueDay = s.startDay + pi * s.gapDays;
        const plan: NarrationPlan = { ...s.narration, refDrift: (s.narration.refDrift + pi * 3) % REFERENCE_DRIFT_STYLES };
        const base = buildNarration(rng, row, plan, valueDay);
        drafts.push({
          seq: (seq += 1),
          valueDay,
          amount: part,
          narration: truncateNarration(`${base} ${pi + 1}/${s.parts.length}`, plan.maxLen + 4),
          settles: [row.invoice.id],
        });
      });
    }
  }

  if (bulkMembers.length > 0) {
    const total = bulkMembers.reduce((acc, r) => acc + r.invoice.gross_paise, 0);
    const latest = bulkMembers.reduce((acc, r) => Math.max(acc, dayOf(r.invoice.received_date)), WINDOW_START);
    const valueDay = latest + intBetween(rng, 3, 12);
    const refs = bulkMembers.map((r, ri) => driftReference(r.invoice.reference, ri * 3 + 1));
    const utr = `UTR${intBetween(rng, 100000000, 999999999)}`;
    const narration = truncateNarration(
      renderBulkNarration(utr, bulkMembers.length, refs, pickOne(rng, NOISE_FRAGMENTS)),
      118
    );
    drafts.push({
      seq: (seq += 1),
      valueDay,
      amount: total,
      narration,
      settles: bulkMembers.map((r) => r.invoice.id),
    });
  }

  // ── decoys ───────────────────────────────────────────────────────────────────
  // Inward credits that settle nothing. Amount-only matching clears them; that is what
  // false_clears is for. Every decoy is fairly beatable: none of them carries a reference
  // that resolves to a real invoice AND the right amount AND the right payer.
  const decoyCount = Math.max(3, Math.round(invoiceCount * 0.075));
  const settledRows = rows.filter((r) => r.settlement.kind !== 'none');
  for (let d = 0; d < decoyCount; d += 1) {
    const kind = d % 4;
    const target = at(settledRows, (d * 13 + 5) % Math.max(1, settledRows.length));
    const other = pickOne(rng, vendors);
    const valueDay = WINDOW_START + intBetween(rng, 10, WINDOW_DAYS + 30);
    const short = mangleVendor(other.row.name, intBetween(rng, 0, VENDOR_MANGLE_STYLES - 1), rng);
    if (kind === 0) {
      drafts.push({
        seq: (seq += 1), valueDay, amount: target.invoice.gross_paise,
        narration: truncateNarration(
          `NEFT UTR${intBetween(rng, 100000000, 999999999)} ${short} REF ${corruptReference(target.invoice.reference, rng)}`,
          at(NARRATION_LENGTHS, intBetween(rng, 2, 6))
        ),
        settles: [],
      });
    } else if (kind === 1) {
      drafts.push({
        seq: (seq += 1), valueDay, amount: intBetween(rng, 500, 9000) * RUPEE * 100,
        narration: truncateNarration(
          `RTGS CR/${short}/${driftReference(target.invoice.reference, intBetween(rng, 0, REFERENCE_DRIFT_STYLES - 1))}/ADV`,
          at(NARRATION_LENGTHS, intBetween(rng, 2, 6))
        ),
        settles: [],
      });
    } else if (kind === 2) {
      drafts.push({
        seq: (seq += 1), valueDay, amount: intBetween(rng, 100, 2500) * RUPEE * 1000,
        narration: `TRF TO SWEEP A/C XXXX${intBetween(rng, 1000, 9999)} EOD ${shortDate(valueDay)}`,
        settles: [],
      });
    } else {
      drafts.push({
        seq: (seq += 1), valueDay, amount: intBetween(rng, 118, 5900) * RUPEE,
        narration: `NEFT RETURN CR CHRG REV UTR${intBetween(rng, 100000000, 999999999)}`,
        settles: [],
      });
    }
  }

  // ── the bank statement, in value-date order ──────────────────────────────────
  const ordered = drafts.slice().sort((a, b) => (a.valueDay !== b.valueDay ? a.valueDay - b.valueDay : a.seq - b.seq));
  const payments: Payment[] = ordered.map((d, idx) => ({
    id: paymentId(`PAY-${tag}-${String(idx + 1).padStart(4, '0')}`),
    value_date: isoD(isoDate(d.valueDay)),
    amount_paise: paise(d.amount),
    currency: 'INR',
    narration_raw: d.narration,
    // NOT normalised — see the firewall note at the top of this file.
    narration_normalised: d.narration,
    // Extraction is the engine's work. An unreconciled statement has nothing applied.
    reference_extracted: null,
    vendor_name_extracted: null,
    vendor_id: null,
    application_status: 'unidentified',
    bank_transaction_id: `${tag}26BTX${String(idx + 1).padStart(6, '0')}`,
    created_at: ts(stampAt(d.valueDay, 22, (idx * 7) % 60, (idx * 23) % 60)),
  }));

  const settledBy = new Map<string, string[]>();
  ordered.forEach((d, idx) => {
    const pid = at(payments, idx).id;
    for (const inv of d.settles) {
      const list = settledBy.get(inv);
      if (list) list.push(pid);
      else settledBy.set(inv, [pid]);
    }
  });

  const truth: TruthRow[] = rows.map((r) => {
    const ids = settledBy.get(r.invoice.id);
    return {
      invoice_id: r.invoice.id,
      // Explicit null, never an empty array: "no payment exists" and "we found none" are
      // different statements and only one of them is an answer key.
      payment_ids: ids && ids.length > 0 ? ids.map((p) => paymentId(p)) : null,
      expected_hold_type: r.expectedHold,
      stratum: r.stratum,
      dataset,
      note: `${r.variant}: ${r.note}`,
    };
  });

  const unsettled = rows.filter((r) => r.settlement.kind === 'none').length;
  const nullTruths = truth.filter((t) => t.payment_ids === null).length;
  if (unsettled !== nullTruths) {
    throw new Error(`generator[${dataset}]: ${unsettled} invoice(s) were never settled but ${nullTruths} truth row(s) carry null`);
  }

  const realised: Record<Stratum, number> = {
    clean: 0, duplicate: 0, tolerance: 0, cardinality: 0, reference: 0, period: 0,
  };
  for (const r of rows) realised[r.stratum] += 1;

  return {
    dataset,
    seed,
    vendors: vendors.map((v) => v.row),
    invoices: rows.map((r) => r.invoice),
    payments,
    truth,
    declared,
    realised,
    bulkSize: bulkMembers.length,
    decoyCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertions. A generator that quietly drifts off its declared mix is worse than none.
// ─────────────────────────────────────────────────────────────────────────────

function assertDataset(d: BuiltDataset): void {
  const fail = (m: string): never => {
    throw new Error(`generator[${d.dataset}]: ${m}`);
  };

  for (const s of STRATA) {
    if (d.realised[s] !== d.declared[s]) {
      fail(`realised mix does not match the declared mix for "${s}": declared ${d.declared[s]}, realised ${d.realised[s]}`);
    }
  }
  const declaredTotal = STRATA.reduce((a, s) => a + d.declared[s], 0);
  if (d.invoices.length !== declaredTotal) fail(`invoice count ${d.invoices.length} does not equal the declared total ${declaredTotal}`);
  if (d.truth.length !== d.invoices.length) fail('truth must carry exactly one row per invoice');

  const invoiceIds = new Set<string>();
  for (const inv of d.invoices) {
    if (invoiceIds.has(inv.id)) fail(`duplicate invoice id ${inv.id}`);
    invoiceIds.add(inv.id);
    const t = inv.tax;
    if (t.total_paise !== t.igst_paise + t.cgst_paise + t.sgst_paise + t.cess_paise) {
      fail(`tax parts do not sum to the total on ${inv.id}`);
    }
    for (const m of [inv.gross_paise, inv.net_paise, t.total_paise, t.igst_paise, t.cgst_paise, t.sgst_paise, t.cess_paise]) {
      if (!Number.isSafeInteger(m)) fail(`money is not an integer count of paise on ${inv.id}`);
    }
    if (inv.is_credit_note && inv.gross_paise >= 0) fail(`credit note ${inv.id} must not carry a positive gross`);
  }

  const paymentIds = new Set<string>();
  for (const p of d.payments) {
    if (paymentIds.has(p.id)) fail(`duplicate payment id ${p.id}`);
    paymentIds.add(p.id);
    if (!Number.isSafeInteger(p.amount_paise)) fail(`money is not an integer count of paise on ${p.id}`);
    if (p.narration_raw.length === 0) fail(`empty narration on ${p.id}`);
    if (p.narration_normalised !== p.narration_raw) fail(`the generator must not normalise narration (${p.id})`);
  }

  const seenTruth = new Set<string>();
  for (const t of d.truth) {
    if (seenTruth.has(t.invoice_id)) fail(`duplicate truth row for ${t.invoice_id}`);
    seenTruth.add(t.invoice_id);
    if (!invoiceIds.has(t.invoice_id)) fail(`truth references unknown invoice ${t.invoice_id}`);
    if (!(STRATA as readonly string[]).includes(t.stratum)) fail(`unknown stratum ${t.stratum}`);
    if (!(EVAL_DATASETS as readonly string[]).includes(t.dataset)) fail(`unknown dataset ${t.dataset}`);
    if (t.expected_hold_type !== null && !(HOLD_TYPES as readonly string[]).includes(t.expected_hold_type)) {
      fail(`unknown hold type ${t.expected_hold_type}`);
    }
    if (t.payment_ids !== null) {
      if (t.payment_ids.length === 0) fail(`empty payment set on ${t.invoice_id}; an explicit null is the way to say "no match exists"`);
      for (const p of t.payment_ids) if (!paymentIds.has(p)) fail(`truth references unknown payment ${p}`);
    }
    if (t.note.length === 0) fail(`empty note on ${t.invoice_id}`);
  }

  if (d.bulkSize < 12 || d.bulkSize > 40) fail(`the bulk remittance settles ${d.bulkSize} invoices; the brief calls for twelve to forty`);

  const nulls = d.truth.filter((t) => t.payment_ids === null).length;
  if (nulls === 0) fail('no invoice carries an explicit null payment set');
  const held = d.truth.filter((t) => t.expected_hold_type !== null).length;
  if (held === 0) fail('no invoice expects a hold');
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract validation.
//
// The generator is typed against lib/types.ts, which proves the shape at compile time.
// These schemas prove it again at run time, against the bytes actually written, using the
// enumerations exported by the contract itself — so a hold type or a stratum that lib
// does not declare cannot reach the answer key. `.strict()` rejects extra keys too: a
// field the contract does not have is as much a contract break as a field it does.
// ─────────────────────────────────────────────────────────────────────────────

const zPaise = z.number().int();
const zIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zStamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

const VendorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalised_name: z.string().min(1),
  tax_identifier: z.string().min(1).nullable(),
}).strict();

const TaxSchema = z.object({
  total_paise: zPaise,
  igst_paise: zPaise,
  cgst_paise: zPaise,
  sgst_paise: zPaise,
  cess_paise: zPaise,
}).strict();

const InvoiceSchema = z.object({
  id: z.string().min(1),
  reference: z.string().min(1),
  normalised_reference: z.string().min(1),
  vendor_id: z.string().min(1),
  vendor_name_raw: z.string().min(1),
  invoice_date: zIsoDate,
  received_date: zIsoDate,
  due_date: zIsoDate.nullable(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  gross_paise: zPaise,
  net_paise: zPaise,
  tax: TaxSchema,
  currency: z.literal('INR'),
  is_credit_note: z.boolean(),
  recurrence: z.enum(['monthly', 'quarterly', 'instalment']).nullable(),
  purchase_order_reference: z.string().min(1).nullable(),
  created_at: zStamp,
}).strict();

const PaymentSchema = z.object({
  id: z.string().min(1),
  value_date: zIsoDate,
  amount_paise: zPaise,
  currency: z.literal('INR'),
  narration_raw: z.string().min(1),
  narration_normalised: z.string().min(1),
  reference_extracted: z.string().min(1).nullable(),
  vendor_name_extracted: z.string().min(1).nullable(),
  vendor_id: z.string().min(1).nullable(),
  application_status: z.enum(APPLICATION_STATUSES),
  bank_transaction_id: z.string().min(1),
  created_at: zStamp,
}).strict();

const TruthRowSchema = z.object({
  invoice_id: z.string().min(1),
  // An explicit null says no match exists. An empty array would be ambiguous, so it is
  // not representable here either.
  payment_ids: z.array(z.string().min(1)).min(1).nullable(),
  expected_hold_type: z.enum(HOLD_TYPES).nullable(),
  stratum: z.enum(STRATA),
  dataset: z.enum(EVAL_DATASETS),
  note: z.string().min(1),
}).strict();

/** Re-reads what was written and parses it back into the contract shape. */
function validateEmitted(dir: string, d: BuiltDataset): void {
  const read = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'));

  z.array(VendorSchema).length(d.vendors.length).parse(read('vendors.json'));
  z.array(InvoiceSchema).length(d.invoices.length).parse(read('invoices.json'));
  z.array(PaymentSchema).length(d.payments.length).parse(read('payments.json'));
  const truth = z.array(TruthRowSchema).length(d.truth.length).parse(read('truth.json'));

  // Static half of the same claim: what the schema accepts is assignable to TruthRow.
  const asContract: readonly TruthRow[] = truth.map((r) => ({
    invoice_id: invoiceId(r.invoice_id),
    payment_ids: r.payment_ids === null ? null : r.payment_ids.map((x) => paymentId(x)),
    expected_hold_type: r.expected_hold_type,
    stratum: r.stratum,
    dataset: r.dataset,
    note: r.note,
  }));
  if (asContract.length !== d.truth.length) throw new Error('generator: truth round trip lost rows');
}

// ─────────────────────────────────────────────────────────────────────────────
// Emission
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, 'data');

/** Matches tools/freeze.mjs exactly, so the two agree on where the holdout lives. */
export function holdoutDir(): string {
  return process.env.HOLDFAST_HOLDOUT_DIR || join(ROOT, '..', 'holdfast-holdout');
}

function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

interface OutputFile {
  readonly name: string;
  readonly content: string;
}

function filesFor(d: BuiltDataset): OutputFile[] {
  return [
    { name: 'invoices.json', content: render(d.invoices) },
    { name: 'payments.json', content: render(d.payments) },
    { name: 'stratification.json', content: render(stratificationDoc(d)) },
    { name: 'truth.json', content: render(d.truth) },
    { name: 'vendors.json', content: render(d.vendors) },
  ];
}

function stratificationDoc(d: BuiltDataset): unknown {
  return {
    schema_version: 1,
    dataset: d.dataset,
    seed: d.seed,
    generator_version: GENERATOR_VERSION,
    invoice_count: d.invoices.length,
    payment_count: d.payments.length,
    vendor_count: d.vendors.length,
    declared: d.declared,
    realised: d.realised,
    proportions: proportions(),
    allocation_method: 'largest remainder over the selection-set counts; ties broken by the order of STRATA in lib/types.ts',
    bulk_remittance_size: d.bulkSize,
    unmatched_credits: d.decoyCount,
    invoices_with_no_correct_payment: d.truth.filter((t) => t.payment_ids === null).length,
    invoices_expecting_a_hold: d.truth.filter((t) => t.expected_hold_type !== null).length,
    conventions: [
      'Money is an integer count of paise everywhere. There is no rupee field and no float.',
      'The generator performs NO normalisation. normalised_reference, narration_normalised and normalised_name are byte-identical to their raw counterparts, and every extraction field on a statement row is null with application_status at unidentified. Recovering those values is the work being measured.',
      'Every vendor name, tax identifier and account fragment is invented. State codes 97 and 99 with a ZZ-prefixed PAN block cannot collide with an issued registration.',
      'truth.json carries an explicit null where no correct payment exists. An empty array would be ambiguous.',
    ],
  };
}

function holdoutSpecDoc(h: BuiltDataset): unknown {
  return {
    schema_version: 1,
    dataset: 'holdout',
    committed: false,
    seed: h.seed,
    selection_seed: SELECTION_SEED,
    seed_rule: 'the holdout seed is the selection seed plus one',
    invoice_count: h.invoices.length,
    payment_count: h.payments.length,
    proportions: proportions(),
    allocation_method: 'largest remainder over the selection-set counts; ties broken by the order of STRATA in lib/types.ts',
    declared_stratification: h.declared,
    realised_stratification: h.realised,
    generator: {
      entrypoint: 'scripts/generate-dataset.ts',
      runner: 'tsx',
      version: GENERATOR_VERSION,
      args: ['--dataset', 'holdout'],
      command: 'tsx scripts/generate-dataset.ts --dataset holdout --out <dir>',
      output_dir_resolution: ['$HOLDFAST_HOLDOUT_DIR', '<repo root>/../holdfast-holdout'],
      sources: GENERATOR_SOURCES.map((name) => ({
        path: `scripts/${name}`,
        sha256: sha256(readFileSync(join(ROOT, 'scripts', name), 'utf8')),
      })),
    },
    outputs: filesFor(h).map((f) => ({ name: f.name, sha256: sha256(f.content) })),
    why_not_committed: [
      'Twenty parallel agents will later search normalisation strategies against data/. Selecting the winner of that search on the same rows we then report is fitting to the test set.',
      'Gitignoring is not enough: sparse-checkout controls the working tree, not the object store, so a committed holdout stays reachable with git cat-file.',
      'Only the digests are committed, into data/MANIFEST at the freeze gate, before any sweep agent spawns. Anyone can regenerate this set from the seed and the entrypoint above and check them.',
    ],
  };
}

const GENERATOR_SOURCES = ['generate-dataset.ts', 'mangle.ts', 'prng.ts', 'vocab.ts'] as const;

function writeAll(dir: string, files: readonly OutputFile[]): void {
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f.name), f.content, 'utf8');
}

function printSummary(d: BuiltDataset, dir: string, files: readonly OutputFile[]): void {
  console.log(`\n${d.dataset} — seed ${d.seed} -> ${dir}`);
  console.log('  stratum       declared  realised');
  for (const s of STRATA) {
    const ok = d.declared[s] === d.realised[s] ? 'ok' : 'MISMATCH';
    console.log(`  ${s.padEnd(12)}  ${String(d.declared[s]).padStart(8)}  ${String(d.realised[s]).padStart(8)}  ${ok}`);
  }
  console.log(`  invoices ${d.invoices.length}   statement rows ${d.payments.length}   vendors ${d.vendors.length}`);
  console.log(`  bulk remittance settles ${d.bulkSize} invoices; ${d.decoyCount} credits settle nothing`);
  console.log(`  explicit nulls in truth: ${d.truth.filter((t) => t.payment_ids === null).length}`);
  for (const f of files) console.log(`  ${sha256(f.content).slice(0, 16)}  ${f.name}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] !== undefined ? (process.argv[i + 1] as string) : null;
}

function main(): number {
  const which = argValue('--dataset') ?? 'both';
  const outOverride = argValue('--out');
  const checkOnly = process.argv.includes('--check');

  if (which !== 'both' && which !== 'selection' && which !== 'holdout') {
    console.error(`generator: --dataset must be selection, holdout or both (got "${which}")`);
    return 1;
  }

  const jobs: Array<{ built: BuiltDataset; dir: string }> = [];

  if (which === 'both' || which === 'selection') {
    const built = buildDataset('selection', SELECTION_SEED, SELECTION_INVOICE_COUNT);
    assertDataset(built);
    jobs.push({ built, dir: which === 'selection' && outOverride ? outOverride : DATA_DIR });
  }
  if (which === 'both' || which === 'holdout') {
    const built = buildDataset('holdout', HOLDOUT_SEED, HOLDOUT_INVOICE_COUNT);
    assertDataset(built);
    jobs.push({ built, dir: which === 'holdout' && outOverride ? outOverride : holdoutDir() });
  }

  let drift = 0;
  for (const job of jobs) {
    const files = filesFor(job.built);
    if (checkOnly) {
      console.log(`\n${job.built.dataset} — checking ${job.dir}`);
      for (const f of files) {
        const path = join(job.dir, f.name);
        const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null;
        const same = onDisk === f.content;
        if (!same) drift += 1;
        console.log(`  ${same ? 'identical' : 'DRIFT    '}  ${f.name}`);
      }
    } else {
      writeAll(job.dir, files);
      validateEmitted(job.dir, job.built);
      printSummary(job.built, job.dir, files);
      console.log(`  validated against lib/types.ts: ${job.built.invoices.length} invoice(s), ${job.built.payments.length} statement row(s), ${job.built.truth.length} truth row(s)`);
    }
  }

  // The holdout spec is committed even when only the selection set is written, because it
  // is the half a judge needs in order to regenerate what we deliberately did not commit.
  if (which === 'both' || which === 'selection' || which === 'holdout') {
    const holdout = jobs.find((j) => j.built.dataset === 'holdout')?.built
      ?? buildDataset('holdout', HOLDOUT_SEED, HOLDOUT_INVOICE_COUNT);
    const spec = render(holdoutSpecDoc(holdout));
    const specPath = join(DATA_DIR, 'holdout.spec.json');
    if (checkOnly) {
      const onDisk = existsSync(specPath) ? readFileSync(specPath, 'utf8') : null;
      const same = onDisk === spec;
      if (!same) drift += 1;
      console.log(`\n  ${same ? 'identical' : 'DRIFT    '}  data/holdout.spec.json`);
    } else {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(specPath, spec, 'utf8');
      console.log(`\n  ${sha256(spec).slice(0, 16)}  data/holdout.spec.json (committed; the holdout itself is not)`);
    }
  }

  if (checkOnly) {
    if (drift > 0) {
      console.error(`\ngenerator: ${drift} file(s) differ from a fresh generation at the committed seed.`);
      return 1;
    }
    console.log('\ngenerator: regeneration is byte-identical.');
  }
  return 0;
}

process.exit(main());
