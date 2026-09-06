// W09 — what the model is told, and what it is asked for.
//
// It is asked for one thing: which statement lines, if any, might settle this invoice. It
// is told plainly that it is nominating a row for judgement and that a deterministic scorer
// re-scores whatever it names — because a model told it is deciding writes like a decider,
// and fluent prose attached to a wrong pairing is exactly how a reviewer rubber-stamps an
// error.
//
// It is given the FULL statement, not a shortlist our own matcher pre-filtered. Handing it
// our candidates would make the nomination a restatement of the matcher's opinion, and the
// residual rows are precisely the rows the matcher had no opinion about.
//
// Money is shown as an integer count of paise, because that is what money IS in this
// system. It is shown so the model can read it; it is never asked for one back.

import type { Invoice, Payment } from '@/lib/types';
import { CITABLE_FIELDS, MAX_PROPOSED_PAYMENTS } from './schema';

/** Appended to the user turn on the single retry. Nothing else about the request changes. */
export const RETRY_REMINDER = [
  '',
  'Your previous answer could not be parsed. Reply with the JSON object and NOTHING else:',
  'no prose, no code fence, no extra keys.',
].join('\n');

function statementLine(payment: Payment): string {
  return [
    payment.id,
    payment.value_date,
    String(payment.amount_paise),
    payment.reference_extracted ?? '',
    payment.vendor_name_extracted ?? '',
    payment.narration_raw.replace(/\s+/g, ' ').trim(),
  ].join(' | ');
}

export function residualSystemPrompt(statement: readonly Payment[]): string {
  return [
    'You are helping reconcile an accounts-payable ledger against a bank statement for an',
    'Indian entity. Every amount is an INTEGER COUNT OF PAISE: Rs 1,234.50 is 123450.',
    '',
    'YOUR ROLE. A deterministic matcher has already scored every invoice against every',
    'statement line and could not resolve the invoice you are about to be shown. You',
    'NOMINATE: you name the statement lines that might settle it, and you say which fields',
    'you read. You decide nothing. Every set you name is re-scored by the same deterministic',
    'scorer that judged every other pairing, on the same four fields and the same weights,',
    'and it is dropped if it does not stand on that evidence. Nothing you say applies a hold,',
    'lifts one, or settles an invoice.',
    '',
    'So do not argue, do not rank, do not hedge, and do not state how sure you are: none of',
    'it is read. Name the lines or name none.',
    '',
    'WHAT THE DATA LOOKS LIKE. Bank narration is dirty in specific ways: vendor names are',
    'truncated and case-mangled, reference tokens sit inside free text or land in the wrong',
    'field entirely, invoice-number conventions drift between the two sides (INV/2024/0042',
    'against INV-24-42), and amounts differ from the invoice by bank charges, an',
    'early-payment discount, TDS withholding or rounding. One payment can settle many',
    'invoices and one invoice can be settled by many payments.',
    '',
    'RULES.',
    `  - Name at most ${MAX_PROPOSED_PAYMENTS} statement lines, by their exact id.`,
    '  - Only ids that appear in the statement below. An id that is not there is discarded',
    '    and the invoice is left for a person.',
    '  - If nothing in the statement plausibly settles the invoice, answer with an empty',
    '    list. That is a useful answer and it is preferred over a guess.',
    '',
    'ANSWER FORMAT. A single JSON object, nothing before or after it, no extra keys:',
    '{"payment_ids": ["PAY-..."], "cites": ["reference", "amount"]}',
    '',
    `  payment_ids  the lines you nominate, or [] for none`,
    `  cites        the fields you actually read, from: ${CITABLE_FIELDS.join(', ')}`,
    '',
    'Do not return an amount, a score, a hold type, or any other field. An answer carrying',
    'one is rejected by the parser and the invoice goes to a person instead.',
    '',
    'THE BANK STATEMENT (id | value_date | amount_paise | reference | vendor | narration):',
    statement.map(statementLine).join('\n'),
  ].join('\n');
}

export function residualUserPrompt(invoice: Invoice): string {
  return [
    'UNRESOLVED INVOICE',
    `  id:          ${invoice.id}`,
    `  reference:   ${invoice.reference}`,
    `  vendor:      ${invoice.vendor_name_raw}`,
    `  invoice_date:${invoice.invoice_date}`,
    `  received:    ${invoice.received_date}`,
    `  period:      ${invoice.period}`,
    `  gross:       ${invoice.gross_paise} paise`,
    `  po_ref:      ${invoice.purchase_order_reference ?? ''}`,
    `  credit_note: ${invoice.is_credit_note}`,
    '',
    'Nominate. JSON only.',
  ].join('\n');
}
