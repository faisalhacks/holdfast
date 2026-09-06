// W09 — the shape a generated answer is allowed to have.
//
// `.strict()` is the load-bearing call. A response carrying `amount_paise`, `score`,
// `hold_type`, `release` or any other field it was not asked for FAILS THE PARSE rather
// than having the extra key quietly ignored. That is the difference between a schema and a
// filter: a filter would let the model keep offering a verdict and let us keep dropping it
// silently, and the first time somebody widened the type the verdict would flow.
//
// So the schema is the narrowest thing that can express a nomination:
//   payment_ids  — statement lines, by id. Checked against the real statement afterwards.
//   cites        — which fields the model says it read. Provenance for a reviewer.
//
// No amount. No score. No hold. No certainty of any kind — there is nowhere in the frozen
// contract to put one and there is no field for one here.

import { z } from 'zod';

/** Schema id. Part of the cache key, so a change to the shape invalidates old answers. */
export const RESIDUAL_SCHEMA_VERSION = 'residual_proposal.v1';

/**
 * The fields a nomination may cite. A closed enum, not free text: a citation is a pointer
 * at evidence a reviewer can go and read, not a sentence about it.
 */
export const CITABLE_FIELDS = ['reference', 'vendor', 'amount', 'date', 'narration'] as const;
export type CitableField = (typeof CITABLE_FIELDS)[number];

/** A bulk settlement runs to forty lines in the real data. Beyond that it is not a pairing. */
export const MAX_PROPOSED_PAYMENTS = 40;

export const ResidualProposalResponse = z
  .object({
    /** Empty means "I have nothing to nominate", which is a legitimate and useful answer. */
    payment_ids: z.array(z.string().trim().min(1)).max(MAX_PROPOSED_PAYMENTS),
    cites: z.array(z.enum(CITABLE_FIELDS)).max(CITABLE_FIELDS.length),
  })
  .strict();

export type ResidualProposalResponse = z.infer<typeof ResidualProposalResponse>;

/**
 * The first balanced JSON object in a block of text.
 *
 * Models add a sentence before the JSON. The parser does not care, and recovering the
 * object is not leniency about the SHAPE — whatever comes out of here still has to satisfy
 * the strict schema above.
 */
export function firstJsonObject(text: string): unknown {
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

/** Parses a response, or returns null. Null is what triggers the single retry. */
export function parseResidualResponse(text: string): ResidualProposalResponse | null {
  const parsed = ResidualProposalResponse.safeParse(firstJsonObject(text));
  return parsed.success ? parsed.data : null;
}
