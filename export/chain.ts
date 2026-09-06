/**
 * W10 — the journal chain, re-walked at export time.
 *
 * An evidence-of-review artifact that simply reprints the journal asks the reader to trust
 * the exporter. This module recomputes every entry's payload hash from the entry's own
 * contents and re-walks the `prev_hash` links, so the artifact carries a statement about
 * its own integrity that the reader can check independently.
 *
 * THE CANONICAL FORM IS THE JOURNAL'S, NOT THIS FILE'S
 *
 * `AuditEntry.payload_hash` is a SHA-256 over a canonical JSON rendering — keys sorted at
 * every level — of exactly nine fields: sequence, occurred_at, actor, event, entity,
 * run_id, case_id, detail and prev_hash. That form is defined by the audit-journal contract
 * and sealed by `app/api/_lib/journal.ts`. It is reproduced here rather than imported
 * because the export layer must not depend on the HTTP layer to describe a stored row.
 *
 * If the two ever drift, this module says so out loud: every entry lands in
 * `unverifiable_entries` and `intact` goes false. A silent agreement would be worse than a
 * loud disagreement, which is the whole argument for recomputing rather than reprinting.
 *
 * INTACT IS NOT CONTIGUOUS
 *
 * A filtered read — one run out of many — is routinely missing sequence numbers, and that
 * is not a finding. `intact` is the integrity claim and holds on a slice; `contiguous`
 * says whether the slice covers an unbroken span. Folding the second into the first would
 * make every honest export look broken, which is how a check stops being read.
 */

import { createHash } from 'node:crypto';
import type { AuditEntry, AuditEntryId, Sha256 } from '@/lib/types';

/** Canonical JSON: keys sorted at every level, so a digest is stable across serialisers. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function sha256(input: string): Sha256 {
  return createHash('sha256').update(input, 'utf8').digest('hex') as Sha256;
}

/** The nine sealed fields, in the journal's canonical form. */
export function payloadHashOf(entry: AuditEntry): Sha256 {
  return sha256(
    canonicalJson({
      sequence: entry.sequence,
      occurred_at: entry.occurred_at,
      actor: entry.actor,
      event: entry.event,
      entity: entry.entity,
      run_id: entry.run_id,
      case_id: entry.case_id,
      detail: entry.detail,
      prev_hash: entry.prev_hash,
    }),
  );
}

export interface ChainReport {
  readonly first_sequence: number | null;
  readonly last_sequence: number | null;
  readonly entries_examined: number;
  /** Sequence numbers absent from the span. Expected whenever the read was filtered. */
  readonly missing_sequences: readonly number[];
  /** Entries whose payload hash does not reproduce from their own contents. */
  readonly unverifiable_entries: readonly AuditEntryId[];
  /** Entries whose prev_hash does not name the payload hash of the entry before them. */
  readonly broken_links: readonly AuditEntryId[];
  /** Every hash reproduced and every adjacent pair linked. The integrity claim. */
  readonly intact: boolean;
  /** The slice covers an unbroken run of sequence numbers. Reported separately on purpose. */
  readonly contiguous: boolean;
  readonly note: string;
}

const CHAIN_NOTE =
  'Hashes recomputed from each entry and links re-walked over the entries in this export. `intact` is the integrity claim and holds on a filtered slice; `contiguous` says whether the slice covers an unbroken sequence span, which a filtered read usually does not.';

const EMPTY: ChainReport = Object.freeze({
  first_sequence: null,
  last_sequence: null,
  entries_examined: 0,
  missing_sequences: [],
  unverifiable_entries: [],
  broken_links: [],
  intact: true,
  contiguous: true,
  note: CHAIN_NOTE,
});

export function verifyChain(entries: readonly AuditEntry[]): ChainReport {
  if (entries.length === 0) return EMPTY;

  const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return EMPTY;

  const seen = new Set(ordered.map((entry) => entry.sequence));
  const missing: number[] = [];
  for (let s = first.sequence; s <= last.sequence; s += 1) {
    if (!seen.has(s)) missing.push(s);
  }

  const unverifiable: AuditEntryId[] = [];
  const broken: AuditEntryId[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    const entry = ordered[i];
    if (entry === undefined) continue;
    if (payloadHashOf(entry) !== entry.payload_hash) unverifiable.push(entry.id);
    if (i === 0) continue;
    const previous = ordered[i - 1];
    if (previous === undefined) continue;
    // Only adjacent rows are expected to link. A gap in a filtered slice is not a break.
    if (entry.sequence !== previous.sequence + 1) continue;
    if (entry.prev_hash !== previous.payload_hash) broken.push(entry.id);
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
