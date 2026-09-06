// HOLDFAST — W02 generator. The hostility layer.
//
// This file exists to make the dataset hard on purpose. A generator whose output the
// matcher finds easy produces a headline number that measures the generator, not the
// matcher, so every transformation here is one that a real bank narration or a real
// vendor's numbering habit actually performs.
//
// NOTHING IN THIS FILE IS EVER APPLIED TO BOTH SIDES. Normalisation performed identically
// on the invoice and the statement is the first thing a critic looks for; the generator
// therefore normalises nothing at all. `Invoice.normalised_reference`,
// `Payment.narration_normalised` and `Vendor.normalised_name` are emitted byte-identical
// to their raw counterparts, because recovering the canonical form is the engine's job
// and handing it the answer would make the measurement worthless.

import { ABBREVIATIONS } from './vocab.js';
import { at, chance, intBetween, pickOne, type Rng } from './prng.js';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'a', 'e', 'i', 'o', 'u']);

function abbreviate(name: string): string {
  let out = name;
  for (const pair of ABBREVIATIONS) {
    const from = at(pair, 0);
    const to = at(pair, 1);
    out = out.split(from).join(to);
  }
  return out.toUpperCase();
}

function dropVowels(name: string): string {
  return name
    .split(' ')
    .map((w) => (w.length > 4 ? w[0] + w.slice(1).split('').filter((c) => !VOWELS.has(c)).join('') : w))
    .join(' ')
    .toUpperCase();
}

function initials(name: string): string {
  const words = name.split(' ').filter((w) => w.length > 2 && !/^(Pvt|Ltd|LLP|and)$/i.test(w));
  return words.map((w) => (w[0] ?? '').toUpperCase()).join('') + ' PL';
}

function transpose(s: string, i: number): string {
  if (i + 1 >= s.length) return s;
  const chars = s.split('');
  return s.slice(0, i) + at(chars, i + 1) + at(chars, i) + s.slice(i + 2);
}

/** Shift a single digit character by `by`, wrapping. No numeric parsing anywhere. */
function shiftDigit(c: string, by: number): string {
  return String.fromCharCode(48 + ((c.charCodeAt(0) - 48 + by) % 10));
}

export const VENDOR_MANGLE_STYLES = 11;

/**
 * "Kavarti Software Pvt Ltd" becomes "KAVARTI SW PVT", "KVRT SFTWR PVT LTD", "KSPL",
 * "kavarti software", "KAVARTISOFTWAREPVT" or a version with two letters transposed —
 * depending on which bank, which rail and which clerk. The engine sees only the output.
 */
export function mangleVendor(name: string, style: number, rng: Rng): string {
  const s = ((style % VENDOR_MANGLE_STYLES) + VENDOR_MANGLE_STYLES) % VENDOR_MANGLE_STYLES;
  switch (s) {
    case 0:
      return name.toUpperCase();
    case 1:
      return abbreviate(name);
    case 2:
      return abbreviate(name).slice(0, 14).trim();
    case 3:
      return initials(name);
    case 4:
      return dropVowels(name);
    case 5:
      return name.toUpperCase().split(' ').join('').slice(0, 16);
    case 6:
      return (name.split(' ')[0] ?? name).toUpperCase();
    case 7:
      return transpose(abbreviate(name), intBetween(rng, 1, Math.max(1, name.length - 4)));
    case 8:
      return name.toLowerCase();
    case 9:
      return abbreviate(name).split(' ').slice(0, 2).join(' ');
    default:
      return `${(name.split(' ')[0] ?? name).toUpperCase()} ${abbreviate(name).split(' ').slice(-1).join('')}`;
  }
}

export const REFERENCE_DRIFT_STYLES = 13;

/**
 * Convention drift between the two sides: prefixes added and removed, leading zeros
 * gained and lost, `/` becoming `-` becoming ` ` becoming nothing at all. `INV/2026/00417`
 * reaches the statement as `2026-417`, `AP-INV/2026/00417`, `inv 2026 00417` or
 * `INV202600417`, and all four are the same invoice.
 */
export function driftReference(ref: string, style: number): string {
  const s = ((style % REFERENCE_DRIFT_STYLES) + REFERENCE_DRIFT_STYLES) % REFERENCE_DRIFT_STYLES;
  const parts = ref.split(/[/\-. ]/).filter(Boolean);
  switch (s) {
    case 0:
      return ref;
    case 1:
      return parts.join('');
    case 2:
      return parts.join('-');
    case 3:
      return parts.join(' ');
    case 4:
      return parts.join('.');
    case 5:
      return ref.toLowerCase();
    case 6:
      return parts.map((p) => (/^\d+$/.test(p) ? p.replace(/^0+(?=\d)/, '') : p)).join('/');
    case 7:
      return parts.filter((p) => /\d/.test(p)).join('/');
    case 8:
      return `AP-${ref}`;
    case 9:
      return `INVNO ${ref}`;
    case 10:
      return ref.slice(0, Math.max(4, ref.length - 2));
    case 11:
      return parts.map((p) => (/^\d+$/.test(p) ? `0${p}` : p)).join('/');
    default:
      return parts.join('/').toUpperCase();
  }
}

/** A reference that resembles a real one and belongs to nothing. Bait for amount-only matching. */
export function corruptReference(ref: string, rng: Rng): string {
  const chars = ref.split('');
  const digitPositions: number[] = [];
  chars.forEach((c, i) => {
    if (/\d/.test(c)) digitPositions.push(i);
  });
  if (digitPositions.length === 0) return `${ref}X`;
  const p = at(digitPositions, intBetween(rng, 0, digitPositions.length - 1));
  chars[p] = shiftDigit(at(chars, p), 3);
  return chars.join('');
}

export const GSTIN_VARIANT_STYLES = 6;

/** Spaces, hyphens, case, and the one-character-off variant that looks identical at a glance. */
export function gstinVariant(gstin: string, style: number): string {
  const s = ((style % GSTIN_VARIANT_STYLES) + GSTIN_VARIANT_STYLES) % GSTIN_VARIANT_STYLES;
  switch (s) {
    case 0:
      return gstin;
    case 1:
      return `${gstin.slice(0, 2)} ${gstin.slice(2, 7)} ${gstin.slice(7, 12)} ${gstin.slice(12)}`;
    case 2:
      return `${gstin.slice(0, 2)}-${gstin.slice(2, 12)}-${gstin.slice(12)}`;
    case 3:
      return gstin.toLowerCase();
    case 4: {
      const chars = gstin.split('');
      const last = at(chars, chars.length - 1);
      chars[chars.length - 1] = /\d/.test(last)
        ? shiftDigit(last, 1)
        : String.fromCharCode(((last.charCodeAt(0) - 65 + 1) % 26) + 65);
      return chars.join('');
    }
    default:
      return gstin
        .split('')
        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
        .join('');
  }
}

/**
 * The bank narration field is finite and the bank does not care what falls off the end.
 * A remittance advice listing twenty-two invoice numbers arrives with four of them.
 */
export function truncateNarration(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

export const NARRATION_TEMPLATES = 12;

export interface NarrationSlots {
  /** Whatever occupies the position a parser expects the payer to be in. */
  readonly payerSlot: string;
  /** Whatever occupies the position a parser expects the reference to be in. */
  readonly referenceSlot: string;
  readonly utr: string;
  readonly gstin: string | null;
  readonly valueDateShort: string;
  readonly maskedAccount: string;
  readonly noise: string;
  readonly batchNumber: number;
}

/**
 * FIELD DISPLACEMENT lives here. The caller decides what goes into `payerSlot` and
 * `referenceSlot`; passing the reference as the payer and the vendor shorthand as the
 * reference produces the displaced row, which is the dirtiest and most common real
 * failure in bank narration and the one an entity-resolution benchmark calls "dirty".
 */
export function renderNarration(style: number, slots: NarrationSlots): string {
  const s = ((style % NARRATION_TEMPLATES) + NARRATION_TEMPLATES) % NARRATION_TEMPLATES;
  const { payerSlot: a, referenceSlot: b, utr, gstin, valueDateShort, maskedAccount, noise } = slots;
  switch (s) {
    case 0:
      return `NEFT ${utr} ${a} ${b}`;
    case 1:
      return `RTGS CR/${utr}/${a}/${b}`;
    case 2:
      return `IMPS/${b}/${a}/${noise}`;
    case 3:
      return `UPI/${b}/${a}/COLLECT`;
    case 4:
      return `ACH DR ${a} REM ADV ${b}`;
    case 5:
      return `PAYMENT AGAINST INVOICE NO ${b} - ${a}`;
    case 6:
      return `TRF ${a} GSTIN ${gstin ?? 'NA'} REF ${b}`;
    case 7:
      return `NEFT-${utr}-${a}-INV-${b}-A/C ${maskedAccount}`;
    case 8:
      return `INWARD CLG ${a} ${b} VALUE DT ${valueDateShort}`;
    case 9:
      return `${a}/${b}/${noise}`;
    case 10:
      return `${utr} ${noise} ${a} BILL ${b} DT ${valueDateShort}`;
    default:
      return `CR ${a} ${noise} ${b} ${maskedAccount}`;
  }
}

/** A narration with no recoverable reference at all. The `no_reference` case. */
export function renderReferencelessNarration(slots: NarrationSlots, rng: Rng): string {
  const forms = [
    `NEFT CR SUNDRY CREDITORS BATCH ${slots.batchNumber}`,
    `RTGS INWARD CLEARING ${slots.utr}`,
    `ACH DR VENDOR PAYOUT RUN ${slots.batchNumber} ${slots.valueDateShort}`,
    `IMPS CR ${slots.payerSlot} NO ADVICE`,
    `MISC CR A/C ${slots.maskedAccount} ${slots.noise}`,
  ];
  return pickOne(rng, forms);
}

/** Remittance advice for a bulk settlement, before the bank cuts it off mid-token. */
export function renderBulkNarration(
  utr: string,
  count: number,
  refs: readonly string[],
  noise: string
): string {
  return `BULK REM ${utr} ${count} INV ${refs.join(',')} ${noise}`;
}

/** Occasional keyboard damage on the invoice side too. The clean side is not clean either. */
export function scuffVendorNameOnInvoice(name: string, rng: Rng): string {
  if (chance(rng, 0.72)) return name;
  const forms = [
    `${name}.`,
    name.split(' ').join('  '),
    name.split('Pvt Ltd').join('Pvt. Ltd.'),
    ` ${name}`,
    name.split('and').join('&'),
    name.toUpperCase(),
  ];
  return pickOne(rng, forms);
}
