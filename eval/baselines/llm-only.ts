// W03 — the STRONG baseline. An LLM doing the whole job on its own.
//
// ── what this is, and what it is not ─────────────────────────────────────────
// This is a MEASUREMENT ARTEFACT. Its output is scored and written into
// eval/report.json under `baselines`, and it goes nowhere else. It is not imported by
// engine/, it applies no hold, it releases nothing, it clears nothing in the product. The
// house rule — the LLM proposes, deterministic code verifies — is not weakened by
// measuring what an LLM alone would do; it is the reason we can state the comparison
// instead of asserting it.
//
// ── why it is not handicapped ────────────────────────────────────────────────
// Published work (OpenSanctions Pairs, Feb 2026) finds an LLM beating a rule-based matcher
// on pairwise entity matching. A baseline built to lose dies under one question, so this
// one gets:
//   - the FULL bank statement in every call, not a shortlist our own matcher pre-filtered.
//     Handing it our candidates would be measuring our matcher and crediting the model.
//   - the complete typed-hold taxonomy with definitions, so it can hold and route, not
//     only match. Anything less scores it on a narrower task than ours.
//   - the amount-cap policy, stated, so it can escalate high-value rows like we do.
//   - a real budget: one call per invoice, prompt caching on the shared ledger prefix, and
//     a response cache on disk so the run is repeatable and auditable after the fact.
//
// ── why it is behind a flag, DEFAULT OFF ─────────────────────────────────────
// Twenty parallel agents run this harness during the normalisation sweep. Those runs must
// be fast and deterministic, and a sampled model is neither. This baseline runs once,
// deliberately, for the final report: `pnpm eval -- --llm-baseline`.

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { HOLD_TYPES } from '../../lib/types';
import type { ConflictCode, HoldType, PaymentId } from '../../lib/types';
import type { DatasetBundle } from '../dataset';
import type { SystemConflict, SystemOutcome } from '../schema';
import type { EvalInvoice } from '../schema';

export const LLM_DESCRIPTION =
  'LLM-only baseline: one call per invoice against the FULL bank statement, the complete ' +
  'typed-hold taxonomy and the amount-cap policy. No deterministic matcher assists it and ' +
  'no candidate shortlist is pre-computed for it. Behind --llm-baseline, default off.';

export interface LlmBudget {
  readonly model: string;
  readonly maxCalls: number;
  readonly concurrency: number;
  readonly cacheDir: string;
}

export interface LlmRunResult {
  /**
   * False when the baseline could not run at all — no ledger, or no credentials. A
   * baseline that did not run is reported as ABSENT, never as a row of zeros: a zero is a
   * measurement and this would not be one.
   */
  readonly ran: boolean;
  readonly outcomes: readonly SystemOutcome[];
  readonly notes: readonly string[];
  readonly calls: number;
  readonly cacheHits: number;
  readonly failures: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedReadTokens: number;
}

// ── the hold taxonomy, as the model is told it ───────────────────────────────
// Short, neutral definitions. Every one of these is a member of HOLD_TYPES in the contract;
// a hold the model names that is not in this list is rejected by the parser.
const HOLD_GUIDE: Readonly<Record<HoldType, string>> = {
  matching: 'no payment in the statement settles this invoice',
  price_variance: 'a settling payment exists but the unit price differs beyond tolerance',
  quantity_variance: 'a settling payment exists but the quantity differs beyond tolerance',
  tax_variance: 'the tax differs from the expected split by more than the percentage tolerance',
  tax_amount_range: 'the tax differs by more than the absolute amount tolerance',
  dist_variance: 'the accounting distribution does not add up to the invoice total',
  duplicate_candidate: 'this invoice looks like a duplicate of another invoice (same reference, or same vendor+amount+date)',
  no_reference: 'neither side carries a usable reference token',
  cardinality_residual: 'a bulk or partial settlement leaves an unsettled residual',
  period_deferral: 'the invoice belongs to a different accounting period from the one it was received in',
  credit_note_crossing: 'a credit note crosses an accounting period boundary',
};

// A conflict is machine-readable and its `clause` is a SHORT FIXED PHRASE. The model does
// not write clauses: it names a hold, and the hold determines the conflict. Generated prose
// attached to a wrong decision is how a reviewer rubber-stamps an error, and that applies
// to a baseline as much as to us.
const CONFLICT_FOR_HOLD: Readonly<Record<HoldType, { code: ConflictCode; clause: string }>> = {
  matching: { code: 'no_candidate_found', clause: 'no candidate payment found' },
  price_variance: { code: 'amount_over_tolerance', clause: 'amount outside tolerance' },
  quantity_variance: { code: 'amount_over_tolerance', clause: 'amount outside tolerance' },
  tax_variance: { code: 'tax_split_mismatch', clause: 'tax split does not reconcile' },
  tax_amount_range: { code: 'tax_total_mismatch', clause: 'tax total outside range' },
  dist_variance: { code: 'amount_over_tolerance', clause: 'distribution does not reconcile' },
  duplicate_candidate: { code: 'duplicate_vendor_amount_date', clause: 'duplicate candidate' },
  no_reference: { code: 'reference_absent', clause: 'no reference on either side' },
  cardinality_residual: { code: 'residual_unsettled', clause: 'residual unsettled' },
  period_deferral: { code: 'period_mismatch', clause: 'period mismatch' },
  credit_note_crossing: { code: 'credit_note_crosses_period', clause: 'credit note crosses period' },
};

const responseSchema = z.object({
  payment_ids: z.array(z.string()).nullable(),
  hold_type: z.enum(HOLD_TYPES).nullable(),
  requires_human: z.boolean(),
});

function ledgerLines(bundle: DatasetBundle): string {
  return bundle.payments
    .map((p) =>
      [
        p.id,
        p.value_date ?? '',
        String(p.amount_paise),
        p.reference_extracted ?? '',
        p.vendor_name_extracted ?? '',
        p.narration_raw.replace(/\s+/g, ' ').trim(),
      ].join(' | ')
    )
    .join('\n');
}

function systemPrompt(bundle: DatasetBundle, amountCapPaise: number): string {
  return [
    'You are reconciling an accounts-payable ledger against a bank statement for an Indian',
    'entity. All money is an INTEGER COUNT OF PAISE. Rs 1,234.50 is 123450. Never treat an',
    'amount as a decimal and never round one.',
    '',
    'For each invoice you are given, decide ONE of:',
    '  - the exact set of statement lines that settle it, or',
    '  - that it must be HELD, with a typed hold, or',
    '  - that no decision can be reached and a person must look at it.',
    '',
    'The settling set must be EXACT. A set that is nearly right is scored as wrong, and a',
    'wrong cleared payment is worse than an unmatched one. One payment may settle many',
    'invoices and one invoice may be settled by many payments: real bulk settlements cover',
    'twelve to forty invoices, and a partial settlement leaves a residual. If you propose a',
    'set, its amounts must actually account for the invoice total; check the arithmetic.',
    '',
    'The statement is dirty in the ways bank narration is really dirty: vendor names are',
    'truncated and case-mangled, reference tokens are buried in free text or land in the',
    'wrong field entirely, invoice-number conventions drift between the two sides, and',
    'amounts differ from the invoice by bank charges, early-payment discount, TDS',
    'withholding or rounding.',
    '',
    'TYPED HOLDS. A held invoice cannot be paid. Choose the most specific applicable type:',
    ...HOLD_TYPES.map((t) => `  ${t}: ${HOLD_GUIDE[t]}`),
    '',
    `POLICY: any invoice above ${amountCapPaise} paise must be reviewed by a person`,
    'regardless of how confident the match looks. Set requires_human to true for those.',
    '',
    'Answer with a single JSON object and nothing else:',
    '{"payment_ids": ["PAY-..."] | null, "hold_type": "<one of the types above>" | null,',
    ' "requires_human": true | false}',
    '',
    'payment_ids is null when no set settles the invoice. hold_type is null when you are',
    'clearing the invoice. requires_human is false only when the decision needs no person:',
    'a clean settlement, or a hold whose condition will resolve by itself.',
    '',
    'THE BANK STATEMENT (id | value_date | amount_paise | reference | vendor | narration):',
    ledgerLines(bundle),
  ].join('\n');
}

function invoicePrompt(invoice: EvalInvoice): string {
  return [
    'INVOICE',
    `  id:        ${invoice.id}`,
    `  reference: ${invoice.reference}`,
    `  vendor:    ${invoice.vendor_name_raw}`,
    `  date:      ${invoice.invoice_date ?? 'unknown'}`,
    `  period:    ${invoice.period ?? 'unknown'}`,
    `  gross:     ${invoice.gross_paise} paise`,
    `  credit_note: ${invoice.is_credit_note}`,
    '',
    'Decide. JSON only.',
  ].join('\n');
}

/** First balanced JSON object in the text. Models add prose; the parser does not care. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const delay = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

interface CachedCall {
  readonly text: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number;
}

export function credentialsPresent(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  const token = process.env['ANTHROPIC_AUTH_TOKEN'];
  return (key !== undefined && key !== '') || (token !== undefined && token !== '');
}

export async function runLlmOnly(bundle: DatasetBundle, budget: LlmBudget, amountCapPaise: number): Promise<LlmRunResult> {
  const notes: string[] = [];
  const outcomes: SystemOutcome[] = [];

  if (bundle.invoices.length === 0) {
    return { ran: false, outcomes, notes: [`llm_only: nothing to decide on the ${bundle.name} set — the ledger is empty`], calls: 0, cacheHits: 0, failures: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0 };
  }
  if (!credentialsPresent()) {
    return {
      ran: false,
      outcomes,
      notes: ['llm_only: --llm-baseline was requested but no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is set. The baseline did not run and NO figures are reported for it — a baseline that did not run is absent from the report, not a row of zeros.'],
      calls: 0, cacheHits: 0, failures: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0,
    };
  }

  const client = new Anthropic();
  const system = systemPrompt(bundle, amountCapPaise);
  mkdirSync(budget.cacheDir, { recursive: true });

  const queue = bundle.invoices.slice(0, Math.max(0, budget.maxCalls));
  if (queue.length < bundle.invoices.length) {
    notes.push(
      `llm_only: budget capped at ${budget.maxCalls} call(s); ${bundle.invoices.length - queue.length} ` +
        'invoice(s) were left undecided and count as requiring a human'
    );
  }

  const results = new Map<string, SystemOutcome>();
  let calls = 0;
  let cacheHits = 0;
  let failures = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedReadTokens = 0;
  let cursor = 0;
  const firstErrors: string[] = [];

  const decide = async (invoice: EvalInvoice): Promise<void> => {
    const user = invoicePrompt(invoice);
    const key = createHash('sha256').update(`${budget.model}|${system}|${user}`).digest('hex');
    const cachePath = join(budget.cacheDir, `${key}.json`);

    let call: CachedCall | null = null;
    if (existsSync(cachePath)) {
      try {
        call = JSON.parse(readFileSync(cachePath, 'utf8')) as CachedCall;
        cacheHits += 1;
      } catch {
        call = null;
      }
    }

    if (!call) {
      for (let attempt = 0; attempt < 3 && !call; attempt += 1) {
        try {
          const message = await client.beta.promptCaching.messages.create({
            model: budget.model,
            max_tokens: 1024,
            temperature: 0,
            // The ledger is identical across every call in the run, so it is a cached
            // prefix. This is what makes "one call per invoice" an affordable budget
            // rather than a gesture.
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: user }],
          });
          const text = message.content
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('');
          call = {
            text,
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
          };
          calls += 1;
          writeFileSync(cachePath, `${JSON.stringify(call, null, 2)}\n`, 'utf8');
        } catch (err) {
          const detail = (err as Error).message;
          if (attempt === 2) {
            failures += 1;
            if (firstErrors.length < 3) firstErrors.push(detail.slice(0, 160));
          } else {
            await delay(1500 * (attempt + 1));
          }
        }
      }
    }

    if (!call) return;
    inputTokens += call.input_tokens;
    outputTokens += call.output_tokens;
    cachedReadTokens += call.cache_read_input_tokens;

    const parsed = responseSchema.safeParse(extractJson(call.text));
    if (!parsed.success) {
      failures += 1;
      return;
    }
    const value = parsed.data;
    const paymentIds = (value.payment_ids ?? []) as unknown as PaymentId[];
    const holdType = value.hold_type;

    let action: SystemOutcome['action'];
    if (paymentIds.length > 0 && !value.requires_human) action = 'auto_clear';
    else if (holdType !== null) action = 'hold';
    else action = 'unmatched';

    const conflicts: SystemConflict[] =
      action === 'hold' && holdType !== null
        ? [
            {
              code: CONFLICT_FOR_HOLD[holdType].code,
              field_path: 'invoice' as unknown as SystemConflict['field_path'],
              clause: CONFLICT_FOR_HOLD[holdType].clause,
              severity: 'blocking',
            },
          ]
        : [];

    results.set(String(invoice.id), {
      invoice_id: invoice.id,
      action,
      payment_ids: action === 'auto_clear' ? paymentIds : [],
      hold_type: action === 'hold' ? holdType : null,
      requires_human: value.requires_human,
      conflicts,
    });
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const invoice = queue[index];
      if (!invoice) return;
      await decide(invoice);
    }
  };

  const lanes = Math.max(1, Math.min(budget.concurrency, queue.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));

  for (const invoice of bundle.invoices) {
    const decided = results.get(String(invoice.id));
    outcomes.push(
      decided ?? {
        invoice_id: invoice.id,
        action: 'unmatched',
        payment_ids: [],
        hold_type: null,
        requires_human: true,
        conflicts: [],
      }
    );
  }

  if (failures > 0) {
    notes.push(
      `llm_only: ${failures} invoice(s) produced no usable answer (API error or unparseable JSON) ` +
        'and are counted as requiring a human, which is the honest scoring and not a repair'
    );
    for (const e of firstErrors) notes.push(`llm_only: ${e}`);
  }
  notes.push(
    `llm_only: ${calls} live call(s), ${cacheHits} served from eval/.cache, model ${budget.model}, ` +
      `${inputTokens} input tokens of which ${cachedReadTokens} read from the prompt cache, ` +
      `${outputTokens} output tokens`
  );

  return { ran: true, outcomes, notes, calls, cacheHits, failures, inputTokens, outputTokens, cachedReadTokens };
}
