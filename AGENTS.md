# House rules — binding on every worker

## Money
Integer minor units (paise), typed `Paise`, stored `BIGINT`. Never a float, never a
string. `parseFloat`/`Number()` on a monetary value fails CI.

## The rule of the house
The LLM proposes. Deterministic code verifies. No LLM output may set a hold release or a
cleared state, directly or transitively. Every LLM proposal re-enters the same
deterministic scorer as any other candidate and is discarded if it does not clear on its
own merits.

## The domain model is a HOLD, not a match decision
Validation applies TYPED holds. A held invoice cannot be paid. Some holds auto-release
when the underlying condition resolves; others require a named human to release them with
a reason. A hold also declares whether accounting entries may be created while it is on.
This mirrors Oracle Payables and is the reason our automation reads as real.

## Tolerance changes are decisions
In the incumbent ERP, widening a tolerance silently auto-releases a matching hold and
nothing records that a judgement was made. In Holdfast a tolerance change is recorded
like any other decision: reviewer, reason, timestamp, affected holds. This is our single
most defensible product claim. Do not weaken it.

## Permanently prohibited
- No DELETE, no `deleted_at`, no soft-delete, anywhere.
- No payment execution code. Not disabled, not flagged — absent.
- No numeric metric literals under `app/`. Metrics come from the API or are not shown.
- No claim of SOC 2, compliance readiness, certification, or "continuous learning".
- No real company names, vendors, GSTINs or bank details in any dataset.
- No claim that three-way match, touchless AP or duplicate detection is novel.

## Frozen files — you may not edit these
`lib/types.ts` (after W01) · `eval/thresholds.json` · `eval/thresholds.lock` ·
`data/MANIFEST` · `engine/holds/registry.ts` · `docs/citations.json` · `AGENTS.md` ·
`CODEOWNERS` · `package.json` · `pnpm-lock.yaml` · `tsconfig.json` · `.github/**` ·
`tools/**` · `BLOCKED.md` · `CURRENT_AIM.md` · `memory.md` · `logs/**` · `critique/**` ·
`quarantine/**`

If your task appears to require editing one, STOP, open an issue titled
`CONTRACT: <what and why>`, and end your session. Do not work around it. The orchestrator
will record it in `BLOCKED.md` and continue the wave around you — that is the correct
outcome, and it is a better result than a workaround.

`package.json` is frozen deliberately: every dependency you need is already installed and
every script you need is already declared. Run `pnpm ls` before concluding otherwise. If a
dependency is genuinely missing, open `CONTRACT: dep <name>`. Do not install it locally.

`engine/holds/registry.ts` is the single entry point the hold workers export into. You add
your hold application function to your own directory and register it there only if the
registry already names your slot. Three workers share this file's purpose and none of them
own it, which is exactly why it is frozen.

## Testing policy
Do not write unit tests for internal functions. Do not write integration suites. There is
no coverage requirement. You ship working code and green gates.

**Exactly three tests exist in this repository**, and each one backs a claim made on
camera. A claim with no mechanical backing is a claim we should not make.

1. **W09** — a test that fails if any LLM code path can reach a hold release. Backs "the
   LLM proposes, deterministic code verifies."
2. **The firewall positive test** (orchestrator-owned, `tools/selftest.mjs`) — a fixture
   importing from `scripts/` inside `engine/` must make the forbidden gate exit non-zero.
   A firewall never observed to fail is not evidence of a firewall.
3. **The ownership-matcher test** (orchestrator-owned) — parentheses are glob
   metacharacters; without this the scope check silently passes everything in a route group.

If you want a fourth, the answer is no. If you propose disabling one of the three, or any
of the five gates, to go faster — that is quarantine Q2, the same rule that catches
tolerance-widening, and for the same reason.

## Scope
Work only inside the directories your task names. CI fails any PR touching a path outside
your declared ownership, even if the change is correct. Ownership globs are declared in
`.github/ownership.json` and keyed by branch name.

## Naming
Persisted vendor mappings are "feedback rules", never "learning".

## The frontend is not ours
`app/(ui)/**` belongs to a human collaborator working outside AO. No worker owns it and no
worker may touch it. The one rule that crosses the boundary is `ui-metric-literal`: no
numeric metric literal under `app/`, theirs included. A hardcoded number in the UI is the
exact thing that makes a judge stop believing the eval.

## Definition of done
Green on typecheck, migrations, eval, ownership, and forbidden-patterns. A red PR is not
done. Fix it; never disable the check. Nothing about test suites.

Three attempts on a failing check, then the orchestrator quarantines the branch. A
quarantine note is better submission material than a fourth flailing diff.

<!-- codeowners isolation probe -->
