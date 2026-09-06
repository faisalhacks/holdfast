# ORCHESTRATOR LOG

Append-only. One entry per phase. This is the source material for the submission's
"How we used AO" section, so it records what actually happened, including what failed.

---

## WAVE 0 — scaffold and gates (orchestrator alone, no workers)

**Environment.** Node 24.12.0, npm 11.6.2, git 2.47.1, Docker 28.5.1, gh 2.99.0.
`corepack enable` failed with EPERM against the nvm shim directory; installed
`pnpm@9.15.4` globally via npm instead and pinned it in `packageManager`. No `psql` on
PATH — the migrations gate runs against a Postgres service container in CI and a Docker
container locally.

**Repository initialised.** `git init -b main`. Pre-existing untracked planning documents
(`HOLDFAST-ORCHESTRATION-FINAL.md`, `HOLDFAST-HANDOFF.md`) retained as the contract of
record.

**Decisions taken (derived, not asked):**

- **D1 — Gate scripts live in `tools/`, not `scripts/`.** `scripts/**` is W02's ownership
  glob. Putting `freeze` and `audit:claims` there would hand the data-generator worker
  ownership of the honesty machinery. `tools/**` is orchestrator-owned and frozen.
- **D2 — `package.json` is pre-declared and frozen.** Every worker would otherwise need to
  add dependencies and scripts, breaking the ownership check for all of them
  simultaneously. The complete dependency set and every script are declared at Wave 0.
- **D3 — Frozen files are enforced mechanically, not by CODEOWNERS.**
  `tools/check-ownership.mjs` fails any worker branch touching a frozen path. CODEOWNERS
  is retained as belt-and-braces but requires a real GitHub handle to activate; the
  contract does not depend on it.
- **D4 — Root Next.js shell** (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`) was
  assigned to W07. Superseded by Amendment 01 — the frontend is ceded.
- **D5 — `audit:claims` accepts cited external figures.** The doc's design admits only
  numbers from `eval/report.json`, which cannot pass, because the submission must carry
  BenchRec's precision floor and the Hackett/Ardent/Kognitos/OpenSanctions figures. Each
  external number must declare a source. Ratified and extended by Amendment 01 §6.

**Built:**

| Artefact | Purpose |
|---|---|
| `AGENTS.md` | House rules, inherited by every worker |
| `CODEOWNERS` | Contract paths (advisory; D3 is the enforcement) |
| `.github/ownership.json` | Branch name → owned globs, plus the frozen list |
| `.github/workflows/ci.yml` | The five checks |
| `tools/_glob.mjs` | Dependency-free glob matcher (route groups are metacharacters) |
| `tools/_hash.mjs` | Deterministic tree hashing for the dataset freeze |
| `tools/check-ownership.mjs` | Scope + frozen-file gate (Q1) |
| `tools/check-forbidden.mjs` | The grep wall — 11 rules |
| `tools/freeze.mjs` | `pnpm freeze` — the Wave 2 dataset gate |
| `tools/verify-manifest.mjs` | Dataset drift (Q7) |
| `tools/lock-thresholds.mjs` | Threshold lock |
| `tools/verify-thresholds.mjs` | Threshold tampering (Q2) |
| `tools/audit-claims.mjs` | No number ships unless measured or cited |
| `tools/migrate.mjs` | Migrations from scratch + GRANT assertion |
| `tools/verify.mjs` | `pnpm verify` — every gate, the termination condition |
| `tools/selftest.mjs` | Tests the gates before we trust them |

**CI failures routed and fixed during Wave 0** — recorded because reliability over time is
what the AO session review looks for, and a log with no failures in it is not credible:

1. **Heredoc backslash mangling.** Shell heredocs stripped one level of escaping from
   every regex in the gate scripts, producing `SyntaxError: Invalid regular expression`.
   Switched to direct file writes for all regex-bearing files.
2. **`check-forbidden.mjs` silently stopped running.** A direct-invocation guard split
   `process.argv[1]` on `/` only; on Windows the path is backslash-separated, so the guard
   never matched and `main()` never executed — the gate reported exit 0 while doing
   nothing. Replaced with `endsWith()`. This is the exact failure mode the gate exists to
   prevent, found in the gate itself, which is why the self-tests were written next.
3. **Decorative-rule risk.** Added positive and negative fixtures for all 11 forbidden
   rules: each must fire on a real violation and stay silent on the benign line a worker
   would plausibly write beside it. 57 assertions, all passing.

---

## AMENDMENT 01 — parallel restructure (received mid-Wave-0, applied before spawning)

Supersedes the wave structure and worker list in `HOLDFAST-ORCHESTRATION-FINAL.md`.
Applied in full. Changes to Wave 0 output:

1. **Frontend ceded.** `app/(ui)/**` removed from the ownership map entirely. W07 and W08
   cancelled; W10's UI portion cancelled. The `ui-metric-literal` forbidden rule stays
   live over `app/**` and applies to the collaborator's commits — the one gate that
   crosses the boundary. Non-worker branches skip the ownership check by design, so the
   collaborator is unblocked without a glob entry.
2. **Twelve workers**, restructured for width: W04 split into `normalise`/`match`, W05
   split into `duplicate`/`variance`/`cardinality`. W02 and W06 explicitly not split.
3. **`engine/holds/registry.ts` authored at Wave 0 and frozen.** Without a
   pre-existing entry point the three hold workers collide and the parallelism is lost.
4. **`docs/citations.json` authored at Wave 0 and frozen**, replacing
   `.github/claims-allowlist.json`. Three buckets: measured (`eval/report.json`), cited
   (`docs/citations.json`), structural (exempt set in the auditor). Note `docs/**` is
   W11's glob — the frozen check runs before the scope check, so W11 cannot edit its own
   citation list.
5. **`eval/thresholds.json` authored at Wave 0 and frozen**, and the eval gate now keys on
   its existence rather than on `eval/` existing. W03 owns `eval/**` and could otherwise
   have made a red eval skip by deleting the file the gate keys on. The W03 frozen
   exception for `thresholds.json` is removed. Floors are set before any data exists,
   which is the point: a floor set in advance is a promise, not a post-hoc rationalisation.
6. **Q4 replaced with Q4′.** The original fires on W04b, W05c and W09 by construction —
   `false_clears` is an absolute count that rises as coverage rises. Implemented as
   `tools/check-regression.mjs`, diffing against `eval/report.prev.json`.
7. **Retry count reconciled to three** (SPAWN AND MERGE and Q6 disagreed).
8. **Critique time-boxed to T-4h**, unresolved findings ship under adverse findings.
9. **Testing policy.** No worker-authored test suites. Exactly three tests: W09's
   LLM-cannot-release-a-hold test, the firewall positive test, and the ownership-matcher
   parenthesis test. The latter two are orchestrator-owned and live in
   `tools/selftest.mjs`. The rule fixtures added in Wave 0 are retained under the same
   principle the amendment states for the firewall — a gate never observed to fail is not
   evidence of a gate.
10. **Contract-gap policy.** A `CONTRACT:` issue writes `BLOCKED.md` at repo root and the
    wave continues around it. `BLOCKED.md` joins the frozen list.
11. **Scope cuts applied:** feedback rules, rerun-diff, and W09's ingestion-normalisation
    call site are out. W09 keeps residual proposals and the re-verify gate. W10 keeps
    tolerance-change recording and the evidence-of-review export.

---

## WAVE 0 — push, branch protection, and two adverse findings

**Pushed.** Remote `https://github.com/faisalhacks/holdfast.git`. First CI run on GitHub
was green on all five jobs, which is the first evidence that the Postgres service
container, the pnpm pin and the glob matcher work anywhere but the orchestrator's machine.

**Branch protection enabled on main:** 5 required status checks (typecheck, migrations,
eval, ownership, forbidden), strict (branch must be up to date), `enforce_admins: true`,
force pushes and deletions blocked, squash-only, auto-merge and delete-on-merge on.

### ADVERSE FINDING 1 — CODEOWNERS does not block. Recorded verbatim.

The plan assumed CODEOWNERS would protect the frozen files. It does not, and we proved it
rather than assuming it.

- **PR #1** — worker branch `W05a-holds-duplicate` editing `AGENTS.md`. The `ownership`
  job failed with `QUARANTINE Q1 ... modified frozen file(s): AGENTS.md`, and the merge
  was refused: "the base branch policy prohibits the merge." Blocked, as designed.
- **PR #1 blocked for two reasons at once**, so it did not isolate CODEOWNERS.
- **PR #2** — non-worker branch `orchestrator/codeowners-probe` editing the same frozen,
  code-owned `AGENTS.md`. All five checks passed and **the PR merged**. With
  `required_approving_review_count: 0`, `require_code_owner_reviews: true` has no effect.

**Decision.** Leave the count at 0. Raising it to 1 would demand a human approval on all
twelve worker PRs, and since the author cannot self-approve, every frozen-file PR would
deadlock permanently. The real enforcement is the `ownership` required status check: it is
identity-independent, keyed on branch name, cannot be bypassed with `enforce_admins: true`,
and was observed to fire. CODEOWNERS is advisory. The submission must not claim otherwise.

Direct push to main by the repo admin was separately attempted and rejected:
`GH006: Protected branch update failed ... Changes must be made through a pull request.`

### ADVERSE FINDING 2 — the eval gate was circular, twice.

Amendment 01 §6 keyed the eval gate to `eval/thresholds.json`, a file the same amendment
required be authored at Wave 0 — so the gate went live before a harness existed. Re-keyed
to `data/MANIFEST`. That was still wrong one wave later: at the Wave 2 freeze there is a
dataset and a harness but no engine, so hard floors would fail every Wave 3 PR for not yet
having built the thing that makes the floors reachable.

**Resolved as a two-stage gate.** Stage 1 (trigger `data/MANIFEST`): the harness must run
and write `eval/report.json`; floors recorded, not enforced — this is what gives Q4' trend
data at every Wave 3 merge instead of nothing until Wave 4. Stage 2 (trigger
`eval/floors.live`, orchestrator-written after the Wave 3 merges): floors enforced from
that commit on. The commit where floors go live gets recorded here and stated in the
submission.

### Ownership precedence, made explicit and tested

`data/MANIFEST` is frozen but also matches W02's `data/**` glob. The frozen check runs
before the scope check, so W02 is denied it — the eval trigger does not sit inside the
glob of the one worker with a motive to regenerate the dataset. `data/truth.json` is
deliberately NOT frozen: W02 must create it, and freezing it would stop its own author
writing it. It is protected instead by being hashed into `data/MANIFEST` at the freeze,
and by the `firewall-truth` rule banning any reference to it under `engine/`, `llm/`,
`app/` or `components/`. Seven assertions in `tools/selftest.mjs` cover this.

Gate self-tests now stand at **69 assertions**.
