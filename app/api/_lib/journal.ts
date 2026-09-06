// The append-only journal: sealing an entry, and proving a range of entries hangs together.
//
// `sequence` is monotonic so a gap is visible, and `prev_hash` chains each row to the one
// before it so a substituted row is visible too. Both implementations seal through this
// function, so the chain means the same thing whichever repository answered.

import type { AuditEntry, AuditEntryId, IsoTimestamp, Sha256 } from '@/lib/types';
import type { AuditDraft } from './repository';
import { canonicalJson, newId, nowTimestamp, sha256 } from './ids';

export function payloadHash(
  draft: AuditDraft,
  sequence: number,
  prevHash: Sha256 | null,
): Sha256 {
  return sha256(
    canonicalJson({
      sequence,
      occurred_at: draft.occurred_at,
      actor: draft.actor,
      event: draft.event,
      entity: draft.entity,
      run_id: draft.run_id,
      case_id: draft.case_id,
      detail: draft.detail,
      prev_hash: prevHash,
    }),
  );
}

export function sealEntry(
  draft: AuditDraft,
  sequence: number,
  prevHash: Sha256 | null,
  recordedAt?: IsoTimestamp,
): AuditEntry {
  return {
    id: newId<AuditEntryId>('aud'),
    sequence,
    occurred_at: draft.occurred_at,
    recorded_at: recordedAt ?? nowTimestamp(),
    actor: draft.actor,
    event: draft.event,
    entity: draft.entity,
    run_id: draft.run_id,
    case_id: draft.case_id,
    detail: draft.detail,
    payload_hash: payloadHash(draft, sequence, prevHash),
    prev_hash: prevHash,
  };
}

export interface ChainReport {
  readonly first_sequence: number | null;
  readonly last_sequence: number | null;
  readonly entries_examined: number;
  /** Sequence numbers absent from the span. Expected whenever the query filtered. */
  readonly missing_sequences: readonly number[];
  /** Entries whose payload hash does not reproduce from their own contents. */
  readonly unverifiable_entries: readonly AuditEntryId[];
  /** Entries whose prev_hash does not name the payload hash of the entry before them. */
  readonly broken_links: readonly AuditEntryId[];
  /**
   * True when every hash reproduced and every adjacent pair linked. This is the integrity
   * claim, and it holds on a filtered slice as readily as on the whole journal.
   */
  readonly intact: boolean;
  /**
   * True when the slice covers an unbroken run of sequence numbers. A filtered read is
   * routinely NOT contiguous and that is not a finding — which is why it is reported
   * separately from `intact` rather than folded into it.
   */
  readonly contiguous: boolean;
  readonly note: string;
}

const CHAIN_NOTE =
  'Hashes recomputed and links re-walked over the entries this query returned. `intact` is the integrity claim; `contiguous` says whether the slice covers an unbroken sequence span, which a filtered read usually does not.';

/**
 * Recomputes every payload hash and re-walks the links. This is what makes the journal a
 * claim the API can back rather than an assertion in a README.
 */
export function verifyChain(entries: readonly AuditEntry[]): ChainReport {
  if (entries.length === 0) {
    return {
      first_sequence: null,
      last_sequence: null,
      entries_examined: 0,
      missing_sequences: [],
      unverifiable_entries: [],
      broken_links: [],
      intact: true,
      contiguous: true,
      note: CHAIN_NOTE,
    };
  }

  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('ordered journal slice lost its endpoints');
  }

  const seen = new Set(ordered.map((e) => e.sequence));
  const missing: number[] = [];
  for (let s = first.sequence; s <= last.sequence; s += 1) {
    if (!seen.has(s)) missing.push(s);
  }

  const unverifiable: AuditEntryId[] = [];
  const broken: AuditEntryId[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const entry = ordered[i];
    if (entry === undefined) continue;
    const recomputed = payloadHash(
      {
        occurred_at: entry.occurred_at,
        actor: entry.actor,
        event: entry.event,
        entity: entry.entity,
        run_id: entry.run_id,
        case_id: entry.case_id,
        detail: entry.detail,
      },
      entry.sequence,
      entry.prev_hash,
    );
    if (recomputed !== entry.payload_hash) unverifiable.push(entry.id);

    if (i > 0) {
      const previous = ordered[i - 1];
      if (previous === undefined) continue;
      const contiguous = entry.sequence === previous.sequence + 1;
      if (contiguous && entry.prev_hash !== previous.payload_hash) broken.push(entry.id);
    }
  }

  return {
    first_sequence: first.sequence,
    last_sequence: last.sequence,
    entries_examined: ordered.length,
    missing_sequences: missing,
    unverifiable_entries: unverifiable,
    broken_links: broken,
    intact: unverifiable.length === 0 && broken.length === 0,
    contiguous: missing.length === 0,
    note: CHAIN_NOTE,
  };
}
