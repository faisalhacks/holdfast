// GET /api/audit — the append-only journal.
//
// Filter by run, case, event or entity. The response carries the chain re-verified over
// the slice returned: every payload hash recomputed from the entry's own contents, every
// prev_hash checked against the entry before it, and any missing sequence number named.
//
// The journal is append-only by GRANT in the migrations, not by convention. This route
// only reads it, and there is no route anywhere in this API that alters it.

import type { NextRequest } from 'next/server';
import { AUDIT_EVENTS } from '@/lib/types';
import type { AuditEvent, CaseId, RunId } from '@/lib/types';
import { enumParam, guard, intParam, ok } from '../_lib/http';
import { verifyChain } from '../_lib/journal';
import { repository, repositoryLabel } from '../_lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const url = new URL(request.url);
    const afterRaw = url.searchParams.get('after_sequence');

    const query = {
      run_id: url.searchParams.get('run_id') as RunId | null,
      case_id: url.searchParams.get('case_id') as CaseId | null,
      event: enumParam<AuditEvent>(url, 'event', AUDIT_EVENTS),
      entity_id: url.searchParams.get('entity_id'),
      after_sequence: afterRaw === null ? null : intParam(url, 'after_sequence', 0, 1000000000),
      limit: intParam(url, 'limit', 100, 1000),
    };

    const repo = await repository();
    const entries = await repo.listAuditEntries(query);

    const actors = new Map<string, number>();
    for (const entry of entries) {
      const key =
        entry.actor.kind === 'human'
          ? `human:${entry.actor.reviewer}`
          : entry.actor.kind === 'model'
            ? `model:${entry.actor.model_id}@${entry.actor.call_site}`
            : `system:${entry.actor.component}`;
      actors.set(key, (actors.get(key) ?? 0) + 1);
    }

    return ok(label, {
      filter: query,
      entries,
      returned: entries.length,
      chain: verifyChain(entries),
      actors: [...actors.entries()].map(([actor, entry_count]) => ({ actor, entry_count })),
      note: 'a model actor can only ever appear on a proposal event; it can never appear on a release or a clear',
    });
  });
}
