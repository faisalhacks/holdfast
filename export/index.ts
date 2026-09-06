/**
 * W10 — export/. THE EVIDENCE-OF-REVIEW ARTIFACT.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────────────
 *
 * A reconciliation is a detective control, and a control that was performed but cannot be
 * SHOWN to have been performed is, to an auditor, a control that was not performed. What
 * gets inspected is the evidence: preparer and reviewer identity, separation between them,
 * timestamps, the exception log with its dispositions, and the level of precision the
 * review was carried out at. This directory produces exactly that, as an artifact with a
 * name, a version and a digest, rather than as a screen someone has to describe afterwards.
 *
 * We call it AUDIT-READY LOGGING. That is a claim about what the log contains and it is
 * the only claim made anywhere in this directory. Nothing here has been examined by anyone
 * outside this project, no framework is named, no opinion is asserted on our behalf, and
 * no vocabulary of that kind appears in the artifact.
 *
 * ─── The modules ─────────────────────────────────────────────────────────────────────
 *
 *   review-evidence.ts  the document: five blocks, assembled from rows the caller hands in
 *   identity.ts         preparer, reviewer, separation, and everyone else who acted
 *   precision.ts        the level of precision of the review — the endpoint's ratio reused
 *                       verbatim, plus the value-weighted one and the largest exception
 *                       that passed with no recorded decision
 *   chain.ts            every journal hash recomputed, every link re-walked
 *   serialise.ts        canonical bytes, a digest over them, and the `export_generated`
 *                       journal row that records the artifact was made
 *
 * ─── The property that makes it evidence ─────────────────────────────────────────────
 *
 * No clock, no repository, no mutation, no module state. `buildReviewEvidence` is a pure
 * function of the rows it is given and `renderReviewEvidence` sorts every key, so the same
 * run exports to the same bytes years later from an archive. An artifact that changes shape
 * between renderings cannot be quoted, and an artifact nobody can quote is a report.
 *
 * ─── Its sharpest block ──────────────────────────────────────────────────────────────
 *
 * `tolerance_change_evidence` recomputes each change's direction — a `similarity` tolerance
 * is a floor, so raising it NARROWS — and reconciles the holds the change claims to have
 * released against what `engine/rules` says it governs. A hold released under a tolerance
 * change that cannot reach it comes out as a named finding. That is the difference between
 * recording a judgement and being able to check one.
 */

export {
  ARTIFACT_NAME,
  ARTIFACT_VERSION,
  asContractExport,
  buildReviewEvidence,
  type DispositionRow,
  type ExceptionLogRow,
  type ReviewEvidenceDocument,
  type ReviewEvidenceInput,
  type ToleranceChangeEvidence,
} from './review-evidence';

export {
  REVIEW_EVENTS,
  deriveIdentities,
  type IdentityInput,
  type Participant,
  type ReviewIdentities,
} from './identity';

export {
  LARGEST_UNREVIEWED_DEFINITION,
  PRECISION_OF_REVIEW_DEFINITION,
  SECOND_PERSON_DEFINITION,
  VALUE_PRECISION_DEFINITION,
  measurePrecision,
  type PrecisionInput,
  type ReviewPrecision,
} from './precision';

export {
  canonicalJson,
  payloadHashOf,
  sha256,
  verifyChain,
  type ChainReport,
} from './chain';

export {
  renderReviewEvidence,
  reviewEvidenceJournalDraft,
  sealReviewEvidence,
  type AuditDraft,
  type SealedReviewEvidence,
} from './serialise';
