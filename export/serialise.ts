/**
 * W10 — turning the evidence document into an artifact, and recording that it was made.
 *
 * TWO EXPORTS OF ONE RUN MUST BE THE SAME BYTES
 *
 * Evidence that changes shape between renderings is not evidence. `renderReviewEvidence`
 * serialises through the journal's own canonical form — keys sorted at every level — so the
 * artifact is byte-identical whenever the underlying rows are, whatever order a repository
 * or a JSON serialiser happened to produce them in. `sealReviewEvidence` then hashes those
 * exact bytes, so the digest is a reference an auditor can quote and re-derive.
 *
 * The digest covers the document and not itself: a seal is a statement about a payload, and
 * a payload that contains its own digest cannot have one.
 *
 * GENERATING AN EXPORT IS ITSELF AN ACT, AND IT GETS LOGGED
 *
 * `AUDIT_EVENTS` in the frozen contract carries `export_generated` for exactly this reason.
 * `reviewEvidenceJournalDraft` builds the entry; appending it belongs to whoever owns the
 * journal, because appending is a write and this layer does not write. The draft is
 * structurally the API's `AuditDraft` and is declared here from contract types rather than
 * imported, so the export layer does not depend on the HTTP layer to describe a row.
 *
 * The actor is passed in. A person or a named system component generated this artifact and
 * the record should say which; defaulting it here would put this module's name on every
 * export ever produced.
 */

import type {
  Actor,
  AuditEvent,
  CaseId,
  EntityRef,
  IsoTimestamp,
  RunId,
  Sha256,
} from '@/lib/types';
import { canonicalJson, sha256 } from './chain';
import type { ReviewEvidenceDocument } from './review-evidence';

/** Structurally the API's `AuditDraft`: one journal row before it is sealed and sequenced. */
export interface AuditDraft {
  readonly occurred_at: IsoTimestamp;
  readonly actor: Actor;
  readonly event: AuditEvent;
  readonly entity: EntityRef;
  readonly run_id: RunId | null;
  readonly case_id: CaseId | null;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

/** The document as canonical JSON. Deterministic for a given set of rows. */
export function renderReviewEvidence(document: ReviewEvidenceDocument): string {
  return canonicalJson(document);
}

export interface SealedReviewEvidence {
  readonly artifact: string;
  readonly artifact_version: number;
  readonly run_id: RunId;
  readonly generated_at: IsoTimestamp;
  /** The canonical bytes. What the digest is over. */
  readonly document: string;
  readonly digest: Sha256;
  readonly byte_length: number;
  readonly note: string;
}

const SEAL_NOTE =
  'SHA-256 over the canonical JSON rendering of the document, keys sorted at every level. Re-render the same rows and the digest reproduces; that reproducibility is what makes the artifact quotable.';

export function sealReviewEvidence(document: ReviewEvidenceDocument): SealedReviewEvidence {
  const rendered = renderReviewEvidence(document);
  return {
    artifact: document.artifact,
    artifact_version: document.artifact_version,
    run_id: document.run_id,
    generated_at: document.generated_at,
    document: rendered,
    digest: sha256(rendered),
    byte_length: Buffer.byteLength(rendered, 'utf8'),
    note: SEAL_NOTE,
  };
}

/**
 * The `export_generated` journal row for this artifact.
 *
 * `detail` carries the figures a reader would want without reopening the artifact, and the
 * digest that ties the row to the exact bytes. Every value is a scalar, because the
 * contract's `detail` is a flat record and a narrative paragraph in a journal row is how a
 * journal stops being queryable.
 */
export function reviewEvidenceJournalDraft(
  document: ReviewEvidenceDocument,
  actor: Actor,
  sealed?: SealedReviewEvidence,
): AuditDraft {
  const seal = sealed ?? sealReviewEvidence(document);
  return {
    occurred_at: document.generated_at,
    actor,
    event: 'export_generated',
    entity: { entity: 'run', id: document.run_id },
    run_id: document.run_id,
    case_id: null,
    detail: {
      artifact: document.artifact,
      artifact_version: document.artifact_version,
      digest: String(seal.digest),
      byte_length: seal.byte_length,
      preparer: document.preparer === null ? null : String(document.preparer),
      reviewer: document.reviewer === null ? null : String(document.reviewer),
      separation_of_duties: document.separation_of_duties,
      exception_count: document.exception_count,
      precision_of_review: document.precision_of_review,
      value_precision_of_review: document.precision.value_precision_of_review,
      largest_unreviewed_case_paise: document.precision.largest_unreviewed_case_paise,
      tolerance_changes: document.tolerance_changes.length,
      widened_tolerance_count: document.widened_tolerance_count,
      tolerance_changes_reconcile: document.tolerance_changes_reconcile,
      journal_chain_intact: document.chain.intact,
    },
  };
}
