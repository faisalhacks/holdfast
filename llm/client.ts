// W09 — the transport. The only file in this repository that talks to a model.
//
// `temperature: 0`, always, not as an option. A sampled reconciliation is not reproducible,
// and a number in a report that a second run would not produce is not a measurement.
//
// The SDK is pinned at @anthropic-ai/sdk 0.32.1 by a FROZEN package.json. That version
// predates the extended-thinking and effort parameters, so they are not passed here and
// adding them would need a dependency change nobody in this build is permitted to make.
//
// DEGRADED MODE. With no credentials this module hands back null and the caller says so in
// its notes and proposes nothing. It does not invent a pairing, it does not fall back to a
// heuristic wearing a model's name, and it does not report zero as if zero were measured.
// A residual pass that did not run is ABSENT, which is a different fact from a pass that
// ran and found nothing.

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL } from './journal';

export { DEFAULT_MODEL };

/** Enough for a nomination and nothing like enough for an essay. */
export const MAX_OUTPUT_TOKENS = 512;

export interface TransportRequest {
  readonly system: string;
  readonly user: string;
}

/**
 * Text in, text out. Deliberately the narrowest surface that can be: a transport cannot
 * score, cannot see the ledger and cannot reach anything downstream of the parser.
 *
 * It is injectable so the boundary test can drive a full residual pass offline. An
 * injected transport changes what the model would have said; it changes nothing about what
 * happens to the answer afterwards, which is the entire point of the gate.
 */
export type ModelTransport = (request: TransportRequest) => Promise<string>;

export function credentialsPresent(): boolean {
  const key = process.env['ANTHROPIC_API_KEY'];
  const token = process.env['ANTHROPIC_AUTH_TOKEN'];
  return (key !== undefined && key !== '') || (token !== undefined && token !== '');
}

/** The live transport, or null when there are no credentials to make one with. */
export function createTransport(model: string = DEFAULT_MODEL): ModelTransport | null {
  if (!credentialsPresent()) return null;
  const client = new Anthropic();
  return async ({ system, user }: TransportRequest): Promise<string> => {
    const message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  };
}
