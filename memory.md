# MEMORY

Handover note to a stranger. Update at the end of every phase.
If this file and the repository disagree, the REPOSITORY is correct. Fix this file first.

## Aim
A1 — typed holds, coverage >= 70%. Not started. Gates built and green.

## Settled, do not re-litigate
- Judged on four questions: genuine pain point, intuitive human judgement, workflow depth,
  real-world grounding. Measurement is EVIDENCE for grounding, not the thesis.
- Position: build for the messy 30% the incumbents stall on; publish the correctness
  number the category omits.
- Domain model is typed HOLDS, not auto_clear/review/escalate.
- Reviewer action is RESOLUTION PATH + OWNER NEXT, not approve/reject.
- Tolerance changes are recorded decisions. Strongest original claim.
- Queue ordered by money at risk, descending.
- Engine is a CLI writing Postgres. No queue, no worker deploy.
- Money is integer paise, BIGINT, never float.
- Do not claim novelty for three-way match, touchless AP or duplicate detection.
- THE FIREWALL holds: generator and matcher never share a workspace, `engine/**` never
  imports from `scripts/**`, `engine/` never reads `truth.json`.

## Settled by AMENDMENT 01 (supersedes the original doc)
- **Frontend is ceded** to a human collaborator outside AO. W07, W08 cancelled; W10's UI
  portion cancelled. `app/(ui)/**` is NOT in the ownership map. The `ui-metric-literal`
  forbidden rule still applies to their commits.
- **Twelve workers**: W01, W02, W03, W04a, W04b, W05a, W05b, W05c, W06, W09, W10, W11.
- W02 and W06 are explicitly NOT split. W04 and W05 are.
- **No worker-authored test suites.** Exactly three tests in the repo (see log).
- **Cut from scope**: feedback rules, rerun-diff, W09's ingestion-normalisation call site.
- **Q4′** replaces Q4: quarantine when false_clears rises AND coverage does not; or
  rupees_at_risk breaches the floor; or false_clears/decided worsens beyond the delta.
- Retry count is **three**, then quarantine.
- Critique is time-boxed to **T-4h**; unresolved findings ship as adverse findings.
- A `CONTRACT:` issue writes `BLOCKED.md` and the wave continues around it.

## Orchestrator decisions taken at Wave 0 (rationale in logs/orchestrator_log.md)
- D1 gate scripts live in `tools/`, not `scripts/` (W02 owns `scripts/**`).
- D2 `package.json` pre-declared and frozen; no worker adds a dependency.
- D3 frozen files enforced by `tools/check-ownership.mjs`, not by CODEOWNERS.
- D5 `audit:claims` has three buckets: measured, cited, structural.

## Frozen paths (a worker touching one is quarantine Q1)
`lib/types.ts` (after W01) · `eval/thresholds.json` · `eval/thresholds.lock` ·
`data/MANIFEST` · `engine/holds/registry.ts` · `docs/citations.json` · `AGENTS.md` ·
`CODEOWNERS` · `package.json` · `pnpm-lock.yaml` · `tsconfig.json` · `.github/**` ·
`tools/**` · `BLOCKED.md` · `CURRENT_AIM.md` · `memory.md` · `logs/**` · `critique/**` ·
`quarantine/**`

## GATE-DEBT (fix forward, do not block on these)
- **CODEOWNERS does not block.** Proven by experiment: PR #2, a non-worker branch editing
  AGENTS.md (a frozen, code-owned path), passed all five checks and MERGED. With
  `required_approving_review_count: 0`, `require_code_owner_reviews: true` has no effect.
  Raising the count to 1 would require a human approval on all twelve worker PRs and kill
  the autonomous build; the author also cannot self-approve, so frozen-file PRs would
  deadlock. DECISION: leave the count at 0 and treat the `ownership` required status check
  as the real enforcement — it is identity-independent, keyed on branch name, and was
  observed to block PR #1 with QUARANTINE Q1. CODEOWNERS is advisory only. Say this
  plainly in the submission; do not claim CODEOWNERS protects anything.
- **Stage 2 eval trigger not yet exercised.** `eval/floors.live` does not exist and cannot
  until Wave 3 completes. The code path is written and the stage-1 path is live from the
  Wave 2 freeze. Verify stage 2 the moment floors.live lands.

## Settled by AMENDMENT 02 (additive to 01)
- **W02 also generates a holdout**: 60 invoices + bank statement, seed+1, `data/holdout/`,
  own truth.json, frozen into data/MANIFEST. Selection on the 200; HEADLINE REPORTED FROM
  THE HOLDOUT. No sweep agent may ever read it — enforced by sparse-checkout, not words.
- **Race W01, W02, W05c only** (3 agents each, isolated worktrees). Winner taken whole;
  never cherry-pick across racers. Losers deleted, not quarantined.
- **Wave 3.5 normalisation sweep**: 12 breadth + 8 depth agents. SKIP IT ENTIRELY if
  stage-1 eval already has selection.coverage >= 0.70 inside the false-clear floor.
- **Sweep selection is lexicographic**: filter out anything whose false_clears exceeds the
  Wave 3 baseline or whose rupees_at_risk breaches the floor (DISCARD, do not rank), then
  rank survivors by coverage, tie-break on lower rupees_at_risk. Never select on max
  coverage. If nothing survives, the data model is wrong — do not relax the filter.
- **Sweep Q2 guardrail**: any sweep agent touching eval/**, engine/holds/**,
  engine/match/** or data/** is discarded UNEVALUATED. Log agent id + file. Report the
  count in the submission.
- **8 critics in parallel**, incl. critic 5 on sweep contamination.
- **Session accounting**: report categories separately (merged / raced / sweep / critics),
  never a summed headline count.

## Built and verified — on main, all green
- **Wave 0**: repo, 5 CI checks, 10 gate scripts, branch protection, gate self-tests
  (97 assertions). Pushed and green on GitHub.
- **W01 contract** (`lib/types.ts`) — racer B, 1005 lines, 116 exports. FROZEN.
- **W01 schema** (`db/**`) — racer E, 11 migrations, 9 tables. Append-only enforced TWICE.
- **W04a normalise** (`engine/normalise/**`) — 8 files, swappable step registry.
- **engine/holds/registry.ts** — orchestrator-owned, frozen, policy table + family
  interface. Wiring section filled by the orchestrator at the Wave 3 merge gate.

## Standing findings that change what we say on camera
1. **CODEOWNERS does not block.** Proven: PR #2 edited a frozen, code-owned file and
   merged. `required_approving_review_count: 0` makes `require_code_owner_reviews` inert;
   raising it to 1 deadlocks (author cannot self-approve). The REAL enforcement is the
   `ownership` required status check. Never claim CODEOWNERS protects anything.
2. **A superuser bypasses GRANT.** `role_table_grants` showed the REVOKE, the migrate gate
   went green, and `UPDATE audit_journal` still returned `UPDATE 1`. Now enforced twice:
   REVOKE plus a BEFORE UPDATE/DELETE/TRUNCATE trigger. Both mechanisms ship; say so.
3. **General lesson, seen twice**: a gate reporting that a claim holds is not the claim
   holding. Test the claim, not the mechanism.
4. **CI is ~40s wall**, not minutes. Large-migration-suite optimisations do not apply here.
   The real serialisation was branch protection `strict: true`; now `false`, safe because
   worker globs are disjoint and the ownership gate enforces that.

## Quarantined
(none)

## Blocked on contract gap
(none)

## Eval gate — two stages
- **Stage 1** (trigger `data/MANIFEST`, live from the Wave 2 freeze): the harness must run
  to completion and write `eval/report.json`. Floors recorded, NOT enforced. This is what
  gives Q4' trend data at every Wave 3 merge.
- **Stage 2** (trigger `eval/floors.live`, orchestrator-written when Wave 3 merges
  complete): floors enforced from that commit on. Frozen, one-way, in CODEOWNERS.
  Record the commit where floors went live in logs/orchestrator_log.md — W11 states it.

## Last eval
(none — eval/report.json does not exist)

## Agent accounting (update as it changes)
- **Merged workers (3)**: W01-contract (racer B), W01-schema (racer E), W04a-normalise.
- **Race sessions discarded (4)**: W01 contract racers A (supervision failure, spawned into
  the shared workdir) and C; W01 schema racer D.
- **Killed by API outage (2)**: W01 contract racers B and C died mid-flight AFTER pushing
  types.ts. The partial gate is why the critical path survived.
- **Running (5)**: W02 x3 raced, W03 eval-harness, W06 api-routes.
- Report these categories SEPARATELY in the submission. Never sum into a headline count.

## Wave 3 briefs MUST carry these two things
1. **The engine adapter interface.** W03 cannot read `engine/`, so it loads the engine at
   runtime. `engine/run.ts` (or `$HOLDFAST_ENGINE_ENTRY`) must export `runEngine`/`run`/
   default taking `{invoices, payments, thresholds}` and returning `EngineDecision[]`:
   `{invoice_id, action: 'auto_clear'|'hold'|'unmatched', payment_ids?, hold_type?,
   requires_human?, conflicts?}`. Read `eval/engine-adapter.ts` for the authoritative
   shape. Without conformance, coverage reads 0 no matter how good the engine is.
2. **`engine/run.ts` is ORCHESTRATOR-OWNED and frozen** — it is the assembly point wiring
   normalise -> match -> holds, and no worker owns it. Written at the Wave 3 merge gate
   alongside the `engine/holds/registry.ts` wiring section.

## TERMINATION CHECKLIST — explicit items, not side effects
- [ ] Run the strong LLM baseline ONCE for real, with `ANTHROPIC_API_KEY` set. W03 shipped
      it default-off and exercised only the no-credentials path, so **its live behaviour is
      currently unmeasured**. It is the entire defence against "did you handicap the
      comparison"; a handicapped baseline dies under one question.
- [ ] Write `eval/floors.live` after the Wave 3 merges; record the commit in the log.
- [ ] Stage-2 floor enforcement is still unexercised — verify it the moment floors.live lands.
- [ ] `pnpm verify` fully green with no "skip".

## Next action
**Wave 1 is COMPLETE.** Wave 2 is in flight: W02 x3 (raced), W03, W06.

When W02 lands: pick a winner whole, merge, then run the **Wave 2 freeze gate** —
`pnpm freeze` (records the holdout's seed and sha256 from OUTSIDE the repo) and confirm
`data/holdout.spec.json` is committed. `data/MANIFEST` appearing makes the eval gate
mandatory (stage 1: harness must run and write a report; floors NOT enforced).

Then **Wave 3**: W04b-engine-match, W05a-holds-duplicate, W05b-holds-variance,
W05c-holds-cardinality (raced x3). At the Wave 3 merge gate, fill the wiring section of
`engine/holds/registry.ts` with the three family imports — that file is yours.

Hand the frontend collaborator W06's route table the moment it reports.

**Wave 3.5 sweep — do not lose these:**
- Every sweep agent gets its OWN worktree AND its own database `holdfast_sweep_<id>` and
  port. Worktrees isolate code but share ports, databases and caches.
- `data/holdout/` is NOT in the repo at all. Nothing to exclude; nothing to leak.
- **The ORCHESTRATOR runs every eval.** `eval/**` is inside W03's glob, so a sweep agent
  could edit its own evaluator and self-report. No agent self-selects, ever.
- Any candidate whose diff touches anything but `engine/normalise/**` is discarded
  UNEVALUATED and logged with its agent id. Report the count in the submission.
- Selection is lexicographic: FILTER on false_clears and rupees_at_risk first (discard,
  do not rank), then rank survivors by coverage, tie-break on lower rupees_at_risk.
