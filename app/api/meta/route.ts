// GET /api/meta — one call that tells a client everything it needs before its first
// screen: which repository answered and whether it is ready, every enumeration the
// contract defines (so no dropdown is hardcoded), the hold policy table, the routing
// suggestions, the money encoding, and the full operation catalogue with the destructive
// operations annotated.

import type { NextRequest } from 'next/server';
import {
  APPLICATION_STATUSES,
  AUDIT_EVENTS,
  CARDINALITY_KINDS,
  CONFLICT_CODES,
  CONFLICT_SEVERITIES,
  DECISION_ACTIONS,
  DELTA_CAUSES,
  EVAL_DATASETS,
  FEEDBACK_RULE_KINDS,
  HOLD_TYPES,
  LLM_CALL_SITES,
  OWNER_ROLES,
  PROPOSAL_SOURCES,
  RESOLUTION_PATHS,
  RUN_KINDS,
  RUN_STATUSES,
  SIDES,
  STRATA,
} from '@/lib/types';
import { ABSENT_BY_DESIGN, OPERATIONS } from '../_lib/catalogue';
import { APPROVAL_HEADER, IDEMPOTENCY_HEADER, guard, ok } from '../_lib/http';
import { EXPECTED_COLUMNS, EXPECTED_TABLES } from '../_lib/pg-schema';
import { configuredMode, repository, repositoryLabel } from '../_lib/repo';
import { ROUTING_RULES, TOLERANCE_GOVERNS } from '../_lib/routing';
import { MONEY_CONTRACT } from '../_lib/wire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const repo = await repository();
    const status = await repo.status();
    const policies = await repo.holdPolicies();

    return ok(label, {
      repository: {
        mode: configuredMode(),
        ...status,
        switch: 'set HOLDFAST_REPO=pg with DATABASE_URL to read Postgres instead',
        postgres_expectations: {
          tables: EXPECTED_TABLES,
          columns: EXPECTED_COLUMNS,
        },
      },
      money: MONEY_CONTRACT,
      headers: {
        idempotency: IDEMPOTENCY_HEADER,
        human_approval: APPROVAL_HEADER,
      },
      enums: {
        hold_types: HOLD_TYPES,
        application_statuses: APPLICATION_STATUSES,
        resolution_paths: RESOLUTION_PATHS,
        owner_roles: OWNER_ROLES,
        decision_actions: DECISION_ACTIONS,
        conflict_severities: CONFLICT_SEVERITIES,
        conflict_codes: CONFLICT_CODES,
        sides: SIDES,
        strata: STRATA,
        proposal_sources: PROPOSAL_SOURCES,
        llm_call_sites: LLM_CALL_SITES,
        run_kinds: RUN_KINDS,
        run_statuses: RUN_STATUSES,
        eval_datasets: EVAL_DATASETS,
        cardinality_kinds: CARDINALITY_KINDS,
        delta_causes: DELTA_CAUSES,
        feedback_rule_kinds: FEEDBACK_RULE_KINDS,
        audit_events: AUDIT_EVENTS,
      },
      hold_policies: policies,
      routing: {
        rules: ROUTING_RULES,
        tolerance_governs: TOLERANCE_GOVERNS,
        note: 'Routing is a suggestion derived from hold policy. The reviewer chooses and the choice is what is recorded.',
      },
      operations: OPERATIONS,
      absent_by_design: ABSENT_BY_DESIGN,
    });
  });
}
