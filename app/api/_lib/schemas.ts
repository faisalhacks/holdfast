// Request validation.
//
// Money arriving on a request is an integer count of paise and is rejected if it is not:
// `.int().safe()` refuses a float, a string and anything outside the range a JSON number
// can carry exactly. Nothing in this file parses a monetary value out of text.

import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  HOLD_TYPES,
  OWNER_ROLES,
  RESOLUTION_PATHS,
  RUN_KINDS,
} from '@/lib/types';

const paise = z.number().int().safe();
const ratio = z.number().min(0).max(1);
const nonEmpty = z.string().trim().min(1);
/** A reason is mandatory everywhere a human acts, and it has to say something. */
const reason = z.string().trim().min(8, 'a reason must say why, not just that');

export const toleranceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exact') }),
  z.object({ kind: z.literal('absolute_paise'), value: paise }),
  z.object({ kind: z.literal('percentage'), value: ratio }),
  z.object({ kind: z.literal('days'), value: z.number().int().min(0) }),
  z.object({ kind: z.literal('similarity'), value: ratio }),
]);

export const toleranceScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('vendor'), vendor_id: nonEmpty }),
  z.object({ kind: z.literal('hold_type'), hold_type: z.enum(HOLD_TYPES) }),
  z.object({ kind: z.literal('invoice'), invoice_id: nonEmpty }),
]);

export const ownerNextSchema = z.object({
  role: z.enum(OWNER_ROLES),
  party: z.string().trim().min(1).nullable().default(null),
});

export const createRunSchema = z.object({
  kind: z.enum(RUN_KINDS),
  idempotency_key: nonEmpty.optional(),
  parent_run_id: nonEmpty.nullable().optional(),
  requested_by: nonEmpty,
  reason: reason,
  dataset_hash: nonEmpty.optional(),
  thresholds_hash: nonEmpty.optional(),
  engine_version: nonEmpty.optional(),
  scorer_version: nonEmpty.optional(),
  feedback_rule_ids: z.array(nonEmpty).optional(),
});
export type CreateRunBody = z.infer<typeof createRunSchema>;

/**
 * The actions this route accepts. `change_tolerance` is recorded at
 * POST /api/tolerance-changes and `apply_hold` belongs to the engine, so neither is
 * accepted here — the handler answers 422 naming the right route rather than half-doing it.
 */
export const DECISION_ACTIONS_ACCEPTED = [
  'release_hold',
  'route',
  'escalate',
  'record_application_status',
] as const;

export const recordDecisionSchema = z.object({
  action: z.enum(DECISION_ACTIONS_ACCEPTED),
  reviewer: nonEmpty,
  reason: reason,
  resolution_path: z.enum(RESOLUTION_PATHS).nullable().default(null),
  owner_next: ownerNextSchema,
  hold_ids: z.array(nonEmpty).default([]),
  application_status: z.enum(APPLICATION_STATUSES).optional(),
  payment_id: nonEmpty.nullable().optional(),
});
export type RecordDecisionBody = z.infer<typeof recordDecisionSchema>;

export const toleranceChangeSchema = z.object({
  from: toleranceSchema,
  to: toleranceSchema,
  scope: toleranceScopeSchema,
  reviewer: nonEmpty,
  reason: reason,
  /**
   * The case the reviewer was working when they made the judgement. A tolerance change is
   * a decision, and a decision in this contract always names a case and an invoice — so
   * the run is taken from the case rather than asked for twice.
   */
  case_id: nonEmpty,
  owner_next: ownerNextSchema,
  /**
   * When true the change releases the holds it governs, and that is the destructive part:
   * it requires the approval header. When false the change is still recorded, and the
   * response still lists the holds it would have released.
   */
  release_affected_holds: z.boolean().default(false),
});
export type ToleranceChangeBody = z.infer<typeof toleranceChangeSchema>;

export const feedbackRuleBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('vendor_alias'),
    raw_value: nonEmpty,
    canonical_vendor_id: nonEmpty,
  }),
  z.object({
    kind: z.literal('reference_pattern'),
    pattern: nonEmpty,
    canonical_form: nonEmpty,
  }),
  z.object({
    kind: z.literal('duplicate_exemption'),
    vendor_id: nonEmpty,
    recurrence: z.enum(['monthly', 'quarterly', 'instalment']),
  }),
  z.object({
    kind: z.literal('delta_attribution'),
    vendor_id: nonEmpty.nullable(),
    cause: z.enum([
      'bank_charge',
      'early_payment_discount',
      'tds_withholding',
      'rounding',
      'partial_settlement',
      'unattributed',
    ]),
    bound: toleranceSchema,
  }),
]);

export const createFeedbackRuleSchema = z.object({
  body: feedbackRuleBodySchema,
  learned_from_case_id: nonEmpty,
  created_by: nonEmpty,
  reason: reason,
});
export type CreateFeedbackRuleBody = z.infer<typeof createFeedbackRuleSchema>;

export const deactivateFeedbackRuleSchema = z.object({
  reviewer: nonEmpty,
  reason: reason,
});
export type DeactivateFeedbackRuleBody = z.infer<typeof deactivateFeedbackRuleSchema>;

/** Turns a zod failure into the `details` a 400 carries, one entry per bad field. */
export function issues(error: z.ZodError): readonly { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '<body>',
    message: issue.message,
  }));
}
