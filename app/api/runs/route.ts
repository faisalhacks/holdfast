// GET  /api/runs   — runs, newest first, each with its totals
// POST /api/runs   — opens a run, idempotent on the key
//
// Run creation is idempotent because a reviewer double-clicking "start a rerun" must not
// produce two runs over the same frozen input. The key is carried in the Idempotency-Key
// header (or `idempotency_key` in the body); repeating it returns the run it already
// created, with X-Idempotent-Replay: true. Repeating it with DIFFERENT arguments is a
// conflict, not a silent overwrite.
//
// This route records a run row. It does not execute anything: the engine picks the row up
// and moves it out of `pending`. Nothing in this codebase moves money.

import type { NextRequest } from 'next/server';
import type { FeedbackRuleId, ReviewerId, RunId, Sha256 } from '@/lib/types';
import { OPERATIONS } from '../_lib/catalogue';
import {
  ApiError,
  IDEMPOTENCY_HEADER,
  REPLAY_HEADER,
  badRequest,
  guard,
  intParam,
  ok,
  readJson,
  unprocessable,
} from '../_lib/http';
import { newId, nowTimestamp } from '../_lib/ids';
import { repository, repositoryLabel } from '../_lib/repo';
import { createRunSchema, issues } from '../_lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const url = new URL(request.url);
    const limit = intParam(url, 'limit', 20, 100);
    const repo = await repository();
    const runs = await repo.listRuns(limit);
    return ok(label, {
      runs,
      count: runs.length,
    });
  });
}

export async function POST(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const parsed = createRunSchema.safeParse(await readJson(request));
    if (!parsed.success) throw badRequest('invalid run request', issues(parsed.error));
    const body = parsed.data;

    const key = request.headers.get(IDEMPOTENCY_HEADER)?.trim() || body.idempotency_key;
    if (!key) {
      throw new ApiError(
        400,
        'idempotency_key_required',
        `run creation requires an idempotency key: send the ${IDEMPOTENCY_HEADER} header or idempotency_key in the body`,
        { header: IDEMPOTENCY_HEADER },
      );
    }

    const repo = await repository();
    const existing = await repo.getRunByIdempotencyKey(key);

    if (existing !== null) {
      const mismatched: string[] = [];
      if (existing.kind !== body.kind) mismatched.push('kind');
      if ((body.parent_run_id ?? null) !== null && existing.parent_run_id !== body.parent_run_id) {
        mismatched.push('parent_run_id');
      }
      if (body.dataset_hash !== undefined && String(existing.dataset_hash) !== body.dataset_hash) {
        mismatched.push('dataset_hash');
      }
      if (mismatched.length > 0) {
        throw new ApiError(
          409,
          'idempotency_key_conflict',
          'this idempotency key already names a run created with different arguments',
          { key, run_id: existing.id, differing_fields: mismatched },
        );
      }
      return ok(
        label,
        { run: existing, replayed: true },
        { headers: { [REPLAY_HEADER]: 'true' } },
      );
    }

    // Hashes and versions belong to the frozen dataset and the engine, not to whoever
    // opened the run, so they are inherited from the most recent run when not supplied.
    const previous = await repo.latestRun();
    const datasetHash = body.dataset_hash ?? (previous?.dataset_hash as string | undefined);
    const thresholdsHash = body.thresholds_hash ?? (previous?.thresholds_hash as string | undefined);
    const engineVersion = body.engine_version ?? previous?.engine_version;
    const scorerVersion = body.scorer_version ?? previous?.scorer_version;

    if (!datasetHash || !thresholdsHash || !engineVersion || !scorerVersion) {
      throw unprocessable(
        'there is no earlier run to inherit from, so dataset_hash, thresholds_hash, engine_version and scorer_version must all be supplied',
        {
          missing: [
            datasetHash ? null : 'dataset_hash',
            thresholdsHash ? null : 'thresholds_hash',
            engineVersion ? null : 'engine_version',
            scorerVersion ? null : 'scorer_version',
          ].filter((f) => f !== null),
        },
      );
    }

    if (body.kind === 'rerun' && !body.parent_run_id) {
      throw unprocessable(
        'a rerun is a diff against a base run and must name parent_run_id; it never mutates the run it is compared with',
      );
    }

    const startedAt = nowTimestamp();
    const run = await repo.insertRun({
      id: newId<RunId>('run'),
      kind: body.kind,
      idempotency_key: key,
      parent_run_id: (body.parent_run_id ?? null) as RunId | null,
      dataset_hash: datasetHash as Sha256,
      thresholds_hash: thresholdsHash as Sha256,
      engine_version: engineVersion,
      scorer_version: scorerVersion,
      feedback_rule_ids: (body.feedback_rule_ids ?? []) as FeedbackRuleId[],
      started_at: startedAt,
    });

    await repo.appendAuditEntries([
      {
        occurred_at: startedAt,
        actor: { kind: 'human', reviewer: body.requested_by as ReviewerId },
        event: 'run_started',
        entity: { entity: 'run', id: run.id },
        run_id: run.id,
        case_id: null,
        detail: {
          kind: run.kind,
          status: run.status,
          idempotency_key: key,
          parent_run_id: run.parent_run_id === null ? null : String(run.parent_run_id),
          reason: body.reason,
        },
      },
    ]);

    return ok(
      label,
      {
        run,
        replayed: false,
        next: OPERATIONS.filter((op) => op.path.startsWith('/api/runs/{runId}')).map(
          (op) => `${op.method} ${op.path.replace('{runId}', String(run.id))}`,
        ),
        note: 'the row is recorded as pending; the engine transitions it. This API executes nothing.',
      },
      { status: 201 },
    );
  });
}
