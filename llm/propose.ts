// W09 — CALL SITE ONE OF ONE: residual proposals.
//
// Amendment 01 cut the ingestion-normalisation call site. This is the only place in
// HOLDFAST where a model is asked anything, and what it is asked for is deliberately
// impoverished: for an invoice the deterministic layer could not resolve, which statement
// lines might settle it, and which fields it read to say so.
//
// WHAT LEAVES THIS FILE. A `CandidateProposal` — invoice id, payment ids, and the
// provenance `model_proposal`. That type is W04b's and it carries "ids and a provenance and
// NOTHING ELSE" by design: there is no score field to fill in, no hold, no amount, no
// certainty. A nomination that arrived with a score would be asking to be believed.
//
// This file imports nothing from `engine/` but a TYPE. It cannot score, it cannot see the
// ledger view the scorer works on, and it has no reference to `reverify` — the gate is a
// different module and the call site cannot call it, let alone route around it.
//
// FOUR WAYS A ROW ENDS UP UNRESOLVED, all of them recorded and none of them repaired:
//   1. no credentials, so the pass did not run at all
//   2. the transport failed twice
//   3. the answer would not parse twice — one retry, exactly as briefed, then stop
//   4. the answer named a statement line that does not exist
// A hallucinated id discards the whole nomination rather than the offending element: a set
// with a line removed is a different claim from the one that was made, and repairing it
// here would be this file quietly deciding.

import type { Invoice, InvoiceId, IsoTimestamp, Payment, PaymentId } from '@/lib/types';
import type { CandidateProposal } from '@/engine/match';
import { contentHash, createContentCache, type ContentCache } from './cache';
import {
  DEFAULT_MODEL,
  createTransport,
  credentialsPresent,
  type ModelTransport,
} from './client';
import {
  assertModelActorOnlyProposes,
  modelActor,
  proposalReceived,
  type ProposalJournalEntry,
} from './journal';
import { residualSystemPrompt, residualUserPrompt, RETRY_REMINDER } from './prompt';
import { parseResidualResponse, RESIDUAL_SCHEMA_VERSION, type CitableField } from './schema';

/** Supplied, never read from a clock — two passes over one frozen input must not differ. */
const EPOCH = '1970-01-01T00:00:00.000Z' as IsoTimestamp;

export interface ProposeOptions {
  readonly model?: string;
  /** Stamped on the journal rows. Supplied by the caller, like `MatchContext.now`. */
  readonly now?: IsoTimestamp;
  /** Durable cache directory. Absent keeps the content cache in memory for the pass. */
  readonly cacheDir?: string | null;
  /** Hard ceiling on live calls. Rows past it are unresolved and say so. */
  readonly maxCalls?: number;
  /** Injected transport, for offline exercise of the pass. See `client.ts`. */
  readonly transport?: ModelTransport;
}

/** Which fields a nomination says it read. Provenance for a reviewer, not an input to a score. */
export interface ProposalCitation {
  readonly invoice_id: InvoiceId;
  readonly payment_ids: readonly PaymentId[];
  readonly cites: readonly CitableField[];
}

export interface ResidualProposalBatch {
  /** False when the pass did not run. Absent is a different fact from "found nothing". */
  readonly ran: boolean;
  readonly model_id: string;
  /** Nominations. NOT candidates: nothing here has been scored. */
  readonly nominations: readonly CandidateProposal[];
  readonly citations: readonly ProposalCitation[];
  /** Rows that leave this pass without a nomination. They stay with a person. */
  readonly unresolved: readonly InvoiceId[];
  readonly journal: readonly ProposalJournalEntry[];
  readonly notes: readonly string[];
  readonly calls: number;
  readonly cache_hits: number;
  readonly parse_failures: number;
}

function emptyBatch(modelId: string, unresolved: readonly Invoice[], note: string): ResidualProposalBatch {
  return {
    ran: false,
    model_id: modelId,
    nominations: [],
    citations: [],
    unresolved: unresolved.map((i) => i.id),
    journal: [],
    notes: [note],
    calls: 0,
    cache_hits: 0,
    parse_failures: 0,
  };
}

/**
 * ENTRY POINT 1 OF 2. Asks the model to nominate pairings for unresolved rows.
 *
 * The result is a bag of nominations and a record of how each row got where it got. It is
 * not usable as a match by anything: pass it to `admitProposals`, which re-scores every
 * nomination with `engine/match` and returns only what stands on its own merits.
 */
export async function proposeResiduals(
  unresolved: readonly Invoice[],
  statement: readonly Payment[],
  options: ProposeOptions = {},
): Promise<ResidualProposalBatch> {
  const modelId = options.model ?? DEFAULT_MODEL;
  const now = options.now ?? EPOCH;
  const actor = modelActor(modelId);

  if (unresolved.length === 0) {
    return emptyBatch(modelId, unresolved, 'llm: no unresolved rows were handed to the residual pass.');
  }
  if (statement.length === 0) {
    return emptyBatch(
      modelId,
      unresolved,
      'llm: the bank statement is empty, so there is nothing to nominate against. Every row is left for a person.',
    );
  }

  const transport: ModelTransport | null = options.transport ?? createTransport(modelId);
  if (transport === null) {
    return emptyBatch(
      modelId,
      unresolved,
      'llm: ANTHROPIC_API_KEY is not set, so the residual pass did NOT run. No nomination was ' +
        'produced and none was invented; every unresolved row stays unresolved and goes to a person. ' +
        'A pass that did not run is absent from the record, not a row of zeros.',
    );
  }

  const cache: ContentCache = createContentCache({ dir: options.cacheDir ?? null });
  const maxCalls = options.maxCalls ?? unresolved.length;
  const system = residualSystemPrompt(statement);

  // Ids the statement actually contains, mapped to their branded values. A nomination is
  // built from THESE records, never from the strings the model returned.
  const byId = new Map<string, Payment>();
  for (const payment of statement) byId.set(String(payment.id), payment);

  const nominations: CandidateProposal[] = [];
  const citations: ProposalCitation[] = [];
  const stillUnresolved: InvoiceId[] = [];
  const journal: ProposalJournalEntry[] = [];
  const notes: string[] = [];
  let calls = 0;
  let parseFailures = 0;
  let transportFailures = 0;
  let budgetSkipped = 0;

  /** One request. Cache first; a live call only on a miss, and only inside the budget. */
  const ask = async (user: string): Promise<string | null> => {
    const key = contentHash([modelId, RESIDUAL_SCHEMA_VERSION, system, user]);
    const cached = cache.get(key);
    if (cached !== null) return cached;
    if (calls >= maxCalls) {
      budgetSkipped += 1;
      return null;
    }
    calls += 1;
    try {
      const text = await transport({ system, user });
      cache.set(key, text);
      return text;
    } catch (err) {
      transportFailures += 1;
      const detail = err instanceof Error ? err.message : String(err);
      if (notes.length < 8) notes.push(`llm: transport error — ${detail.slice(0, 160)}`);
      return null;
    }
  };

  for (const invoice of unresolved) {
    const user = residualUserPrompt(invoice);

    // ONE RETRY ON PARSE FAILURE, THEN MARK UNRESOLVED. The retry differs only by an
    // appended reminder, so it is a different cache key and a repeat run replays both.
    const first = await ask(user);
    let answer = first === null ? null : parseResidualResponse(first);
    if (answer === null) {
      if (first !== null) parseFailures += 1;
      const second = await ask(`${user}${RETRY_REMINDER}`);
      answer = second === null ? null : parseResidualResponse(second);
      if (answer === null && second !== null) parseFailures += 1;
    }

    if (answer === null) {
      stillUnresolved.push(invoice.id);
      continue;
    }

    // Empty is a legitimate answer and the preferred one when nothing fits.
    if (answer.payment_ids.length === 0) {
      stillUnresolved.push(invoice.id);
      continue;
    }

    const seen = new Set<string>();
    const paymentIds: PaymentId[] = [];
    let fabricated: string | null = null;
    for (const raw of answer.payment_ids) {
      const id = raw.trim();
      if (seen.has(id)) continue;
      seen.add(id);
      const payment = byId.get(id);
      if (payment === undefined) {
        fabricated = id;
        break;
      }
      paymentIds.push(payment.id);
    }

    if (fabricated !== null || paymentIds.length === 0) {
      stillUnresolved.push(invoice.id);
      if (notes.length < 12 && fabricated !== null) {
        notes.push(
          `llm: ${String(invoice.id)} — the answer named "${fabricated}", which is not a line in ` +
            'this statement. The whole nomination is discarded rather than trimmed to fit.',
        );
      }
      continue;
    }

    // A nomination. Ids and a provenance, and nothing else — no cardinality either: what
    // kind of settlement this is, is derived by the scorer from the records themselves.
    nominations.push({
      invoice_id: invoice.id,
      payment_ids: paymentIds,
      proposed_by: 'model_proposal',
    });
    citations.push({ invoice_id: invoice.id, payment_ids: paymentIds, cites: answer.cites });
    journal.push(
      proposalReceived(actor, invoice.id, now, {
        call_site: actor.call_site,
        payment_count: paymentIds.length,
        cites: answer.cites.join('+'),
        reverified: false,
      }),
    );
  }

  if (transportFailures > 0) {
    notes.push(
      `llm: ${transportFailures} request(s) failed at the transport and their rows are unresolved. ` +
        'An unresolved row is counted as needing a person, which is the honest scoring and not a repair.',
    );
  }
  if (parseFailures > 0) {
    notes.push(
      `llm: ${parseFailures} answer(s) did not satisfy the strict schema. Each row got one retry ` +
        'and then stopped; no answer was coerced into shape.',
    );
  }
  if (budgetSkipped > 0) {
    notes.push(`llm: the call budget of ${maxCalls} was reached; ${budgetSkipped} request(s) were not made.`);
  }
  notes.push(
    `llm: ${nominations.length} nomination(s) from ${unresolved.length} unresolved row(s), ` +
      `${calls} live call(s), ${cache.hits()} served from the content cache, model ${modelId}, temperature 0. ` +
      'A nomination is not a match: admitProposals() re-scores every one of them and keeps only what stands.',
  );

  assertModelActorOnlyProposes(journal);

  return {
    ran: true,
    model_id: modelId,
    nominations,
    citations,
    unresolved: stillUnresolved,
    journal,
    notes,
    calls,
    cache_hits: cache.hits(),
    parse_failures: parseFailures,
  };
}

/** True when a live pass is possible. Callers use it to say "absent" rather than "zero". */
export { credentialsPresent };
