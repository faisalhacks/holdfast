// W05d — engine/holds/matching. Payment-side reference recovery.
//
// The one question this file answers: did a reference token survive onto the bank line at
// all? That is the whole difference between the two codes this family owns. `no_reference`
// says a token is ABSENT; `matching` says a token was there and nothing built on it cleared
// the bar. Deciding that on convenience rather than on evidence would make one of the two
// codes a dumping ground for the other, and a hold type nobody can trust the meaning of is
// worse than a hold type that is never raised.
//
// THE INPUT IS `narration_raw` AND NOTHING ELSE. `Payment` also carries
// `reference_extracted`, `vendor_name_extracted` and `narration_normalised`; not one of
// them is read here. Those columns were written by whatever produced the dataset, and a
// family that consumed them would be reporting that producer's extraction as its own —
// and, worse, would declare a reference "absent" exactly when the producer chose to leave
// the column null. The recovery is done here, from the raw line, by `engine/normalise`,
// which is the same code path `engine/match/prepare.ts` puts every payment through. Both
// sides of the reconciliation therefore agree about what a reference is.

import type { Payment, PaymentId } from '@/lib/types';
import type { NormaliseConfig } from '@/engine/normalise';
import { DEFAULT_CONFIG, extractFromNarration } from '@/engine/normalise';

/** What one bank narration yielded when it was taken apart. */
export interface ReferenceRecovery {
  readonly payment_id: PaymentId;
  /** The line as received, verbatim. A reviewer is always shown this. */
  readonly narration_raw: string;
  /** Reference-shaped tokens, canonicalised through `reference.v1`. Empty is the finding. */
  readonly tokens: readonly string[];
  readonly recovered: boolean;
}

/**
 * Reference tokens recoverable from one bank line.
 *
 * `extractFromNarration` classifies the line and offers the reference-shaped tokens; a
 * token that canonicalises to the empty string is not a token, and a line whose only
 * numerals are a rail tracking number (`UTR671653761`) or a two-digit date fragment yields
 * nothing, which is exactly the case `no_reference` exists to name.
 *
 * Identifier-shaped tokens are deliberately NOT counted. A GSTIN-shaped string identifies a
 * PARTY, not a document, and treating it as a reference would let a line that names the
 * vendor twice pass as a line that names the invoice.
 */
export function recoverReference(
  payment: Payment,
  config: NormaliseConfig = DEFAULT_CONFIG,
): ReferenceRecovery {
  const extraction = extractFromNarration(payment.narration_raw, config);
  const tokens: string[] = [];
  for (const field of extraction.references) {
    const value = field.result.value;
    if (value === '') continue;
    if (tokens.includes(value)) continue;
    tokens.push(value);
  }
  return {
    payment_id: payment.id,
    narration_raw: payment.narration_raw,
    tokens,
    recovered: tokens.length > 0,
  };
}

/** True when not one of these lines carries a recoverable reference token. */
export function noneCarryReference(recoveries: readonly ReferenceRecovery[]): boolean {
  if (recoveries.length === 0) return false;
  return recoveries.every((r) => !r.recovered);
}
