// The wire projection.
//
// Response bodies are the objects of `lib/types.ts` with exactly one transformation
// applied, everywhere, by one function: money is re-encoded under the rule in ./money.ts.
//
// Two field names differ from the contract, and only these two, so that the rule "a money
// field's name ends in `_paise`" holds without exception on the wire:
//
//   contract                                      wire
//   evidence.amount.invoice_value                 evidence.amount.invoice_value_paise
//   evidence.amount.payment_value                 evidence.amount.payment_value_paise
//   evidence.amount.delta                         evidence.amount.delta_paise
//   tolerance { kind: 'absolute_paise', value }   tolerance { kind: 'absolute_paise', value_paise }
//
// `evidence.vendor.delta` and `evidence.reference.delta` are ratios and
// `evidence.date.delta` is a day count, so they keep their contract names. Everything
// else — every id, enum, ratio, timestamp, boolean — is passed through untouched.

import { moneyField } from './money';

const PAISE_SUFFIX = '_paise';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Renames the two contract members whose money fields are not `_paise`-suffixed, before
 * the generic pass sees them. Returns the same reference when nothing applies.
 */
function normaliseMoneyNames(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj['kind'] === 'absolute_paise' && 'value' in obj) {
    const { value, ...rest } = obj;
    return { ...rest, value_paise: value };
  }
  if (obj['field'] === 'amount' && 'invoice_value' in obj) {
    const { invoice_value, payment_value, delta, ...rest } = obj;
    return {
      ...rest,
      invoice_value_paise: invoice_value,
      payment_value_paise: payment_value,
      delta_paise: delta,
    };
  }
  return obj;
}

/**
 * The single serialisation entry point. Every route body passes through this, so no route
 * can forget the money rule and no route can invent a second one.
 */
export function encode(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) return value.map(encode);
  if (!isPlainObject(value)) return null;

  const source = normaliseMoneyNames(value);
  const out: Record<string, Json> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === undefined) continue;
    if (key.endsWith(PAISE_SUFFIX)) {
      if (raw === null) {
        out[key] = null;
      } else if (typeof raw === 'number' || typeof raw === 'bigint') {
        for (const [k, v] of Object.entries(moneyField(key, raw))) out[k] = v;
      } else {
        out[key] = encode(raw);
      }
      continue;
    }
    out[key] = encode(raw);
  }
  return out;
}

/** Published alongside every response so a client never has to guess the encoding. */
export const MONEY_CONTRACT = {
  unit: 'paise',
  description:
    'Integer minor units of INR. Rs 1,234.50 is 123450. Never a float, never a decimal string.',
  field_naming: 'Every monetary field name ends in _paise.',
  wide_values:
    'When an exact value falls outside the IEEE-754 safe-integer range the _paise field is absent and a sibling <field>_paise_string carries the exact decimal digits. Read the number when present, otherwise the string.',
  contract_renames: {
    'evidence.amount.invoice_value': 'invoice_value_paise',
    'evidence.amount.payment_value': 'payment_value_paise',
    'evidence.amount.delta': 'delta_paise',
    'tolerance.value (kind=absolute_paise)': 'value_paise',
  },
} as const;
