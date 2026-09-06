// GET /api/cases/{caseId} — everything about one case, in one call.
//
// This is the call the product is built around. A reviewer working an exception in the
// incumbent system reconstructs the picture from five or six screens: the invoice, the
// vendor master, the bank statement, the hold list, the prior corrections and the audit
// trail. Here it arrives assembled, with the arithmetic itemised and the journal slice
// re-verified, so the reviewer spends their attention on the judgement rather than on
// the gathering.

import type { NextRequest } from 'next/server';
import type { CaseId } from '@/lib/types';
import { buildDossier } from '../../_lib/dossier';
import { guard, notFound, ok } from '../../_lib/http';
import { repository, repositoryLabel } from '../../_lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  readonly params: { readonly caseId: string };
}

export async function GET(_request: NextRequest, context: Context) {
  const label = repositoryLabel();
  return guard(label, async () => {
    const caseId = context.params.caseId as CaseId;
    const repo = await repository();
    const bundle = await repo.getCaseBundle(caseId);
    if (bundle === null) throw notFound(`case "${caseId}" is not in this repository`);
    return ok(label, buildDossier(bundle), {
      meta: {
        assembled_from: [
          'exception case',
          'invoice',
          'vendor',
          'holds',
          'match candidates',
          'payments',
          'decisions',
          'tolerance changes',
          'feedback rules',
          'audit journal',
        ],
      },
    });
  });
}
