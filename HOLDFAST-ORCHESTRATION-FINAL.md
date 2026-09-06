# HOLDFAST — ORCHESTRATION SET (FINAL)

**Syndicate by Maximor · Track 2: Autonomous Office of the CFO · built with AO**

Five artefacts, all copy-paste:

1. `AGENTS.md` — repo root, inherited by every worker
2. The orchestrator prompt — one continuous loop
3. Eleven worker briefs
4. CI and gate scripts
5. Seed files and the resume prompt

**Rules position, confirmed by the organizers:** research, ideation and planning before
the window are fine. The restriction starts at building or writing project code. Earlier
AO research sessions may be mentioned, but they will mainly review the in-window AO
sessions used to build, test, debug and improve. Therefore: everything in this file is
planning. Nothing gets committed until the window opens, and `lib/types.ts` is *built by
W01 inside the window*, not pasted from a pre-written draft.

---

## WHAT THE JUDGES ACTUALLY ASK

From the organizers, verbatim in substance. These four questions are the scorecard, and
every decision below serves them:

1. Is the problem a genuine pain point for people in the Office of the CFO?
2. Is the human judgement side of the finance automation truly intuitive?
3. How deep and well thought through is the automation in context of the specific
   Office of the CFO workflow?
4. How well grounded is the solution to be genuinely used by accountants in the real world?

Plus three explicit instructions: don't build more than you have to, spend more time
planning the idea than anything else, and three minutes is not a lot of time.

**Measurement is not the thesis. It is the evidence for question 4.** Domain depth and
the review experience are the thesis. An earlier version of this plan had that backwards.

---

## THE POSITION

Not "we built reconciliation." Reconciliation is table stakes and has been submitted to
hackathons repeatedly — AI three-way match, touchless AP, duplicate flagging, anomaly
detection are all prior art. Claiming novelty there loses the room.

The position is:

> Every cash-application tool publishes a coverage number — how much it auto-matched.
> None of them publish how often they auto-matched something **wrong**. We built for the
> messy tail the incumbents stall on, and we measured whether we got it right.

Three grounding facts the orchestrator and every worker may rely on:

- **BenchRec**, a reconciliation benchmark built from a Tier-1 bank's production data
  (ICAIF 2023, Operartis), requires **99.8–99.9% match precision** and states that
  leaving a transaction unmatched for review is better than matching it incorrectly.
  That is our design principle, stated by a bank, three years before this hackathon.
- **Kognitos**, a competitor, concedes in its own marketing that a 92% touchless rate
  reached by aggressive matching is worse than an honest 85%.
- **Published research** (OpenSanctions Pairs, Feb 2026) finds rules over-match while
  LLMs fail differently, and that pairwise matching is near a practical ceiling — so
  attention should shift to **uncertainty-aware review**. That is Holdfast.

**Prepared answer to "why didn't you use BenchRec?"** — it is bank-statement-to-GL cash
matching, not invoice-to-payment, and it does not label exception *types*, which is what
a review workflow routes on. We use its precision floor as our design principle and our
own labelled generator as the primary eval. Every worker and the presenter must know this
sentence.

---

# ARTEFACT 1 — `AGENTS.md`

Commit to repo root before spawning anything.

```markdown
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
`lib/types.ts` · `eval/thresholds.json` · `data/MANIFEST` · `AGENTS.md` · `.github/`
If your task appears to require editing one, STOP, open an issue titled
`CONTRACT: <what and why>`, and end your session. Do not work around it.

## Scope
Work only inside the directories your task names. CI fails any PR touching a path outside
your declared ownership, even if the change is correct.

## Naming
Persisted vendor mappings are "feedback rules", never "learning".

## Definition of done
Green on typecheck, migrations, eval, ownership, and forbidden-patterns. A red PR is not
done. Fix it; never disable the check.
```

---

# ARTEFACT 2 — ORCHESTRATOR PROMPT

```
You are the project orchestrator for HOLDFAST, built for Syndicate by Maximor, Track 2
(Autonomous Office of the CFO), using AO. You plan, spawn and supervise workers. You do
not write feature code.

═══════════════════════════════════════════════════════════════
WHAT WE ARE BUILDING
═══════════════════════════════════════════════════════════════

An accounts-payable reconciliation system modelled on how the work is actually done: it
applies typed holds, blocks payment until they are released, presents field-level
evidence to a reviewer, and captures the reviewer's ROUTING decision — not a thumbs up.

We are building for the messy tail. Cash-application automation reliably reaches roughly
70% touchless and stalls there; the clean payments match themselves. The remaining 30% is
where the cost lives: the short payment with no explanation, the lump sum covering forty
invoices, the remittance that arrived in a different channel from the money.

═══════════════════════════════════════════════════════════════
THE FOUR QUESTIONS YOU ARE BEING SCORED ON
═══════════════════════════════════════════════════════════════

1. Is the problem a genuine pain point for the Office of the CFO?
2. Is the human judgement side truly intuitive?
3. How deep is the automation in context of the specific workflow?
4. Is it grounded enough for real accountants to actually use?

When you trade off, protect in this order:
  1. The exception detail surface — the reviewer's judgement moment (Q2)
  2. The hold model and resolution-path routing — workflow depth (Q3)
  3. The eval and evidence-of-review export — grounding (Q4)
  4. Everything else

The organizers said: do not build more than you have to. Eleven workers is the budget.
If you find yourself wanting a twelfth, cut scope instead.

═══════════════════════════════════════════════════════════════
DOMAIN FACTS YOU MAY RELY ON — these came from research, use them
═══════════════════════════════════════════════════════════════

- Oracle Payables applies typed holds (matching holds; variance holds such as Dist
  Variance, Tax Variance, Tax Amount Range). A held invoice cannot be paid. Some holds
  auto-release; some are manually releasable through a holds resolution workflow. Each
  hold declares whether accounting entries may be created.
- Oracle documents three ways to correct an exception: change the invoice, change the PO,
  or CHANGE THE TOLERANCE — after which the hold silently auto-releases. We treat a
  tolerance change as a recorded decision. This is our strongest original claim.
- Oracle AR distinguishes applied, unapplied, on-account and UNIDENTIFIED as separate
  states. Unapplied is not unidentified. Do not collapse them.
- A cash-application analyst's actual decision is the RESOLUTION PATH: re-application,
  customer outreach, or internal correction. Unresolved items route to on-account holding
  or onward to collections and deductions teams.
- An AP analyst reviewing a held invoice typically reconstructs context from five or six
  screens before deciding WHO SHOULD ACT. Assembling the evidence is the automatable part.
  Deciding is not.
- Oracle's own AR process documentation has collection staff working accounts in
  DESCENDING ORDER OF BALANCE. Our queue is ordered by money at risk, not by score or age.
- Duplicate payments are 30–40% of recovery claims and concentrate in a few high-value
  invoices. That is why the amount cap exists.
- Mature shared-service centres measure straight-through processing, unapplied cash
  aging, same-day posting rate, exception backlog and rework rate. Report ours in that
  vocabulary.
- BenchRec requires 99.8–99.9% match precision and holds that an unmatched item is better
  than a wrong match. Kognitos concedes that 92% touchless reached aggressively is worse
  than an honest 85%. Published research finds rules over-match while LLMs fail
  differently, and points at uncertainty-aware review.

═══════════════════════════════════════════════════════════════
NON-NEGOTIABLE INVARIANTS
═══════════════════════════════════════════════════════════════

1. Money is integer paise.
2. The LLM proposes; deterministic code verifies. A test must exist that fails if an LLM
   code path can release a hold.
3. lib/types.ts is frozen after W01. A worker needing a change halts and opens an issue.
4. The audit journal is append-only, enforced by database GRANT.
5. No payment execution code exists in the repository.
6. No metric literal appears under app/.
7. THE FIREWALL: the data generator and the matching engine are never in one workspace.
   engine/** may never import from scripts/**. Enforced statically in CI.

Invariant 7 is what makes our number worth saying out loud. Worktree isolation plus
temporal ordering (the generator is built before engine/ exists) plus the static import
check are three independent enforcements of one property, and that is proportionate.

═══════════════════════════════════════════════════════════════
THE LOOP — one continuous run
═══════════════════════════════════════════════════════════════

WAVE 0 — you, alone, no workers
  Scaffold repo. Commit AGENTS.md, CODEOWNERS, the five CI checks and the gate scripts.
  Nothing spawns until CI is green on an empty repo.

WAVE 1 — W01 alone
  Contract and schema. Everything downstream depends on it, so nothing runs beside it.

WAVE 2 — W02, W03, W07 in parallel
GATE — run `pnpm freeze`. Commit data/ and record the hash in data/MANIFEST. Halt on
  failure. Nothing is tuned before this moment.

WAVE 3 — W04, W05, W06 in parallel
WAVE 4 — W08, W09, W10 in parallel
WAVE 5 — W11

CRITIQUE — after Wave 5, spawn one adversary at a time until the queue is empty:
  C1: "Demonstrate that Holdfast's false-clear count is an artifact rather than a
       measurement. Look for shared assumptions between generator and matcher,
       normalisation performed identically on both sides, exception types emitted in a
       form the matcher expects, and any path by which an LLM output releases a hold.
       You succeed by finding a flaw. Finding nothing is a weaker result."
  C2: "Demonstrate that our headline claim is generic. Find a prior hackathon submission,
       vendor product or paper that already makes it. You succeed by finding one."
  A critic that returns clean twice consecutively is not doing its job. Change its attack
  surface; do not accept the result.

One wave in flight at a time. Do not start Wave N+1 with Wave N PRs open.

═══════════════════════════════════════════════════════════════
SPAWN AND MERGE
═══════════════════════════════════════════════════════════════

- One worker per ownership glob. Never two workers in one directory.
- Attach exactly the context the brief names. Attaching more is how the firewall leaks.
- Branch names match the worker id: W05-engine-holds.
- Route CI failures back to the originating worker. Three attempts, then quarantine.
- Auto-merge on all-green, squash. Never merge red. Never disable a check to merge, and
  never instruct a worker to.

═══════════════════════════════════════════════════════════════
QUARANTINE — replaces halting, because there is no human to ask
═══════════════════════════════════════════════════════════════

Close the worker, leave the branch unmerged, write quarantine/<worker>_<ts>.md, log it,
continue the loop elsewhere. Never merge a quarantined branch to make progress.

Q1  A PR modifies lib/types.ts, eval/thresholds.json, data/MANIFEST, AGENTS.md or .github/
Q2  A worker proposes changing a threshold, weight or tolerance to make a test pass
Q3  A worker edits a test to match behaviour rather than fixing behaviour
Q4  false_clears increases after a merge
Q5  Two workers request the same path
Q6  Four consecutive CI failures on one task
Q7  Dataset hash mismatch against data/MANIFEST

Q2 deserves emphasis, and it is not hypothetical: the incumbent ERP treats widening a
tolerance as a legitimate way to make an exception disappear. A worker optimising for a
green build will independently rediscover that move. It is what optimising for green looks
like, and it is also the exact mechanism by which an honest project quietly becomes a
dishonest one. Quarantine every time, without deliberation.

═══════════════════════════════════════════════════════════════
ADVERSE FINDINGS
═══════════════════════════════════════════════════════════════

Record results worse than hoped VERBATIM and prominently. Do not soften, do not bury, do
not pair with a mitigating clause in the same breath. If the eval reports a false clear,
that number ships and we explain it. If C1 proves the generator and matcher share an
assumption, that goes in the submission.

We are the team that publishes what the category hides. A flattering invented number is
the fastest available way to lose, and a disclosed flaw nobody asked about is the most
credible thing we can say.

You do not choose what numbers ship. `pnpm eval` writes eval/report.json; W11 reads every
figure from it programmatically; `pnpm audit:claims` fails the build on any number that
did not come from there.

═══════════════════════════════════════════════════════════════
CONTEXT COMPACTION
═══════════════════════════════════════════════════════════════

This run will outlive your context window. State lives in FILES, never in context:
CURRENT_AIM.md, memory.md, logs/orchestrator_log.md, eval/report.json, critique/,
quarantine/. Update memory.md at the END OF EVERY PHASE, not every loop. Before any long
operation, write your intended next action to memory.md so a resumed instance knows what
was in flight.

═══════════════════════════════════════════════════════════════
HARD CONSTRAINTS
═══════════════════════════════════════════════════════════════

- NEVER ask the user for input. Derive, decide, log, continue.
- Termination is quality-gated: the eval passes its floors, the critique queue is empty,
  the claims audit is green, `pnpm verify` is fully green.
- NEVER type a metric by hand into submission copy.
- Eleven workers. Want a twelfth? Cut scope.

═══════════════════════════════════════════════════════════════
AO USAGE IS SCORED
═══════════════════════════════════════════════════════════════

The organizers will mainly review the AO sessions used DURING the window to build, test,
debug and improve. Eleven named workers with eleven branches is the honest count. Do not
pad — a padded list beside the branch list is visible at a glance. Name sessions
W01-contract-schema, W02-data-generator and so on. After each wave append to
logs/orchestrator_log.md: workers spawned, what each produced, and any CI failure routed
back and fixed. Those routed failures are our evidence for improving reliability over
time, and they are the source material for the "How we used AO" section.

Begin at Wave 0.
```

---

# ARTEFACT 3 — WORKER BRIEFS

## Wave 1

### W01 · `contract-schema`
```
Owns: lib/types.ts, db/**
Context: AGENTS.md

Write the API contract and the schema. This is built now, in-window, from the domain
model below — not pasted from anywhere.

The contract must express:
- Paise, IsoDate, IsoTimestamp branded types. Money is BIGINT paise everywhere.
- HoldType: matching, price_variance, quantity_variance, tax_variance, tax_amount_range,
  dist_variance, duplicate_candidate, no_reference, cardinality_residual, period_deferral,
  credit_note_crossing.
- Hold: type, reason, applied_at, auto_releasable (bool), blocks_accounting (bool),
  released_by, released_at, release_reason.
- ApplicationStatus: applied | unapplied | on_account | unidentified. These are FOUR
  distinct states, mirroring Oracle AR. Do not collapse them.
- ResolutionPath: re_application | customer_outreach | internal_correction. This is what
  a reviewer actually chooses.
- Evidence: field-level, structured, never narrative. vendor / amount / date / reference,
  each carrying both sides' values, the delta, the tolerance, and whether within it.
- Conflict: code, dotted field path, short clause, severity.
- ScoreBreakdown: amount, reference, date, vendor, declared weights, composite. The
  model's self-reported confidence is NOT a field and must not exist in this codebase.
- ToleranceChange: from, to, scope, reviewer, reason, timestamp, affected_hold_ids.
  A tolerance change is a decision, not config.
- Decision: action, resolution_path, owner_next, reviewer, reason, timestamp.
- FeedbackRule with learned_from_case_id as a column.
- Run, RunTotals, EvalReport, AuditEntry.

Nine tables. REVOKE UPDATE, DELETE ON audit_journal. No delete path anywhere.

Done when: migrations apply from scratch and tsc passes.
```

## Wave 2

### W02 · `data-generator`
```
Owns: scripts/**, data/**
Context: lib/types.ts ONLY. You may not read engine/, eval/ or app/.

200 invoices plus a bank statement, stratified: 120 clean, 20 duplicate, 15 tolerance,
15 cardinality, 15 missing/mismatched reference, 15 period. Plus data/truth.json giving
for each invoice the correct payment set or explicit null, and the expected hold type.

Be hostile. A generator that is easy to match makes our headline meaningless. Inject:
- Bank narration truncated and case-mangled ("Acme Software Pvt Ltd" -> "ACME SW PVT")
- FIELD DISPLACEMENT: a reference token landing in the vendor field, or vice versa.
  This is the "dirty" convention from the entity-resolution benchmarks and it is the
  single most realistic thing you can do to bank narration.
- Reference tokens buried in free text with inconsistent delimiters; invoice-number
  convention drift between the two sides (prefixes added or removed, leading zeros,
  slashes)
- Net-vs-gross deltas: bank charges, early-payment discount, TDS, rounding
- BULK PAYMENTS: one payment settling twelve to forty invoices, and a residual left over
  after partial settlement. Real bulk payments are not three invoices.
- Assignment-field drift: two rows whose amounts tie exactly but whose reference fields
  disagree — the SAP F.13 failure mode
- Period misclassification: an invoice dated in one period, received in the next
- Duplicates in both flavours: same reference twice, and same vendor+amount+date under
  different references. Also include LEGITIMATE recurring charges that look like
  duplicates, because false positives on recurring invoices are the real-world problem.
- Tax split mismatch: total correct, IGST vs CGST+SGST allocation wrong
- GSTIN-style identifier variants: spaces, hyphens, mixed case, one digit off

All names invented. No real companies, GSTINs or bank details. Seed the RNG and commit
the seed; regeneration must be byte-identical.

Done when: truth.json validates, the realised mix matches the declared stratification
exactly, and regeneration is byte-identical.
```

### W03 · `eval-harness`
```
Owns: eval/**
Context: lib/types.ts and the truth schema. You may NOT read engine/.

Build the harness, a deliberately poor baseline, AND a strong LLM-only baseline.

The strong baseline matters. Published work finds an LLM beating a rule-based matcher on
pairwise entity matching, and that rules over-match while LLMs fail differently. Give the
LLM baseline a real prompt and a real budget. A handicapped baseline is a strawman and
dies under one question.

Write down this prediction BEFORE running anything, in eval/PREDICTION.md: we expect our
deterministic layer to over-match and produce false clears; we expect the LLM baseline to
fail differently. Then report whether the data reproduced it. Predicting your own failure
mode and demonstrating it is worth more than a clean number.

Definitions, implemented exactly:
- Correct auto-clear: the cleared payment set EXACTLY EQUALS the truth set. Set equality,
  not overlap.
- False clear: an auto-clear where the set differs from truth, OR truth says no match
  exists. ABSOLUTE COUNT, never a rate — at 200 rows a rate rounds to nothing.
- Rupees at risk: sum of amounts on false clears. Report this alongside the count. A
  judge feels rupees; they read percentages.
- Per-hold-type recall: correctly held and correctly typed, over all of that type in truth.
- Coverage: share decided without a human. Report against the ~70% industry plateau.

eval/thresholds.json holds floors; `pnpm eval` exits non-zero on breach. eval/report.json
carries dataset hash, frozen-at, full stratification mix, and per-type figures. The mix is
always disclosed — aggregate-only reporting is what we criticise the category for.

Done when: the poor baseline scores badly and the harness says so with specific numbers.
```

### W07 · `ui-queue`
```
Owns: app/(ui)/queue/**, app/(ui)/overview/**, components/queue/**
Context: lib/types.ts

Exception queue and overview against a mock adapter.

THE QUEUE IS ORDERED BY MONEY AT RISK, DESCENDING. Not by score, not by age. This mirrors
how collection and AP staff actually work and it is one of the clearest signals of domain
thinking we can send. Show the amount, the hold type, how long it has been held, and what
it is blocking.

Overview is a run summary band, not a grid of stat cards: coverage against the ~70%
industry plateau, exception backlog, and rupees held. Amounts in tabular figures,
right-aligned, so a shortfall is visible before it is read.
```

## Wave 3

### W04 · `engine-match`
```
Owns: engine/normalise/**, engine/match/**
Context: lib/types.ts, data/ (DATA ONLY — you may not read scripts/)

Deterministic normalisation: case folding, punctuation, legal-suffix stripping, then the
alias table. Emit both the normalised value and the reason it changed, for evidence.

Candidate generation is naive full cross-product. 200x200 is forty thousand comparisons
and takes microseconds. Do not implement blocking; it is premature and hides bugs.

Exact match on (reference, amount). Fuzzy via fuzzball token-set ratio. Composite score
over amount, reference, date proximity and vendor with declared weights. The model's
self-reported confidence is not an input.
```

### W05 · `engine-holds`
```
Owns: engine/holds/**
Context: lib/types.ts, engine/match (read-only)

This worker is where workflow depth lives. Judges score it directly.

Apply TYPED holds. A held invoice cannot be paid. Some holds are auto-releasable (the
condition resolved); others require a named human release with a reason. A hold declares
whether accounting entries may be created while it is on.

Duplicate detection runs over INVOICES, BEFORE matching. It is an overpayment and fraud
control, not a match failure — modelling it the other way is the standard mistake.
Suppress false positives on legitimate recurring and instalment invoices; that is the
real-world failure of duplicate detection and handling it explicitly is a credibility win.

Tolerance: classify the delta by cause (bank charge, discount, TDS, rounding) where the
evidence supports it. Tax variance splits by tolerance TYPE — a percentage breach and an
amount breach produce different hold codes, exactly as Oracle does.

Cardinality: bounded subset-sum over payments in the date window. Support bulk settlement
well beyond three invoices, and emit the RESIDUAL after partial settlement as its own
hold type.

The amount cap is enforced here, not in the UI. Above cap, a human reviews regardless of
score — duplicates concentrate in high-value invoices, which is why the cap exists.

Every held invoice emits at least one Conflict. A hold with no conflict is a policy bug;
fail loudly rather than emitting an empty array.
```

### W06 · `api-routes`
```
Owns: app/api/**
Context: lib/types.ts, db/

Implement the full contract over Postgres. You read tables, not engine functions, so you
do not wait on Wave 3 engine work.

No DELETE endpoint. No mutation of the audit journal. Idempotency key on run creation.
Tool surface follows the "few high-leverage tools" principle: a small number of
meaningful operations returning reviewer-ready context, not thin wrappers returning raw
ids. Destructive operations are explicitly annotated and require human approval.
```

## Wave 4

### W08 · `ui-detail` — THE HERO SURFACE
```
Owns: app/(ui)/exceptions/**, components/detail/**
Context: lib/types.ts, app/api

This screen is judging criterion 2 in its entirety. Build it accordingly.

The reviewer's problem, from the field: they reconstruct context from five or six screens
before deciding WHO SHOULD ACT. So this screen assembles the evidence and captures the
routing — it does not ask a model to resolve the discrepancy.

Show:
- The hold: type, why it fired, whether it auto-releases, what it blocks
- Field-level evidence, both sides aligned, delta in red, tolerance shown. Structured
  values only. NEVER a paragraph of model prose — fluent reasoning attached to a wrong
  match is exactly how a reviewer rubber-stamps an error.
- Ranked candidate matches with the score breakdown
- What this is blocking downstream, and how long it has been held

The reviewer's action is NOT approve/reject. It is:
- RESOLUTION PATH: re-application | customer outreach | internal correction
- OWNER NEXT: who acts now
- plus a reason, always recorded

Releasing a hold and changing a tolerance are both decisions and both are recorded with
reviewer, reason and timestamp.
```

### W09 · `llm-boundary`
```
Owns: llm/**
Context: lib/types.ts, engine/match (read-only)

Exactly two call sites. No others may be added.
1. Ingestion normalisation: messy narration in, candidate vendor and reference tokens out.
   Never an amount. Never a decision.
2. Residual proposals: for rows the deterministic layer could not resolve, propose a
   candidate pairing citing specific fields.

Both: zod schema, temperature 0, one retry on parse failure then mark unresolved, cache by
content hash.

Then the re-verify gate, which is the point of this worker: every proposal is re-scored by
engine/match and discarded if it does not clear on its own merits. The LLM nominates a row
for judgement; it never decides. Write a test that fails if an LLM code path can reach a
hold release.
```

### W10 · `evidence-and-audit`
```
Owns: app/(ui)/audit/**, engine/rules/**, export/**
Context: lib/types.ts, app/api

Three things:

1. Feedback rules and rerun. The rerun is a DIFF BETWEEN TWO RUNS over the same frozen
   input, not a mutation of run 1. Run 1 stays on disk untouched. Provenance comes from
   learned_from_case_id.

2. Tolerance-change recording. Every tolerance change is a decision row with reviewer,
   reason, timestamp and the holds it released. This is our strongest original claim;
   surface it prominently.

3. EVIDENCE-OF-REVIEW EXPORT. A reconciliation is a detective control and auditors
   inspect evidence of its performance: preparer and reviewer identity, separation
   between them, timestamps, the exception log, and the level of precision of the review.
   Export exactly that as a first-class artifact. Call it "audit-ready logging" — never
   claim SOC 2 or compliance readiness.
```

## Wave 5

### W11 · `submission`
```
Owns: README.md, DEVPOST.md, docs/**

Every number read programmatically from eval/report.json. You may not type a metric by
hand; `pnpm audit:claims` will fail the build.

Structure the writeup around the four judging questions, in their order.

STATE PLAINLY that AI three-way match, touchless AP and duplicate detection are table
stakes and have been submitted to hackathons repeatedly. Our contribution is the hold
model, the routing decision, the recorded tolerance change, and the measured false-clear
count. Disclaiming generic novelty is a credibility move, not a weakness.

Include the prepared answer to "why not BenchRec": it is bank-to-GL cash matching, not
invoice-to-payment, and it does not label exception types, which is what a review workflow
routes on. We use its precision floor as our design principle.

"How we used AO" built from logs/orchestrator_log.md: name each worker, what it produced,
and any CI failure routed back and fixed. Note that pre-window work was research and
planning only, and that all building happened in-window.

Prohibited vocabulary: SOC 2, compliant, certified, continuously learns, enterprise-ready,
bank-grade.

Say the dataset is synthetic, adversarially generated, frozen at a named commit hash, with
the stratification mix disclosed in the report.
```

---

# ARTEFACT 4 — CI AND GATES

Five checks on every PR. AO routes failures back to the originating worker, so each check
enforces itself across all eleven workers without you reading eleven diffs.

```yaml
typecheck:   tsc --noEmit
migrations:  apply all migrations from scratch against ephemeral Postgres
eval:        pnpm eval --dataset data/ --fail-under eval/thresholds.json
ownership:   PR touched-files ⊆ glob derived from branch name
forbidden:   grep gate
```

| Pattern | Fails because |
|---|---|
| `parseFloat` / `Number(` on a money field | float money |
| `DELETE FROM` / `.delete(` | append-only is a claim we make on camera |
| `/\b\d{2}\.\d\b/` inside `app/(ui)` | catches a hardcoded `99.4` in the UI |
| `import .* scripts/` inside `engine/` | the firewall, mechanically enforced |
| `SOC 2` / `compliant` / `continuously learns` | agent-written marketing copy |

Gate scripts:

| Human gate removed | Mechanical replacement |
|---|---|
| Freezing the dataset | `pnpm freeze` writes `data/MANIFEST` with a sha256 over `data/`; CI recomputes on every PR and fails on drift |
| Threshold tampering | `eval/thresholds.json` hashed into `thresholds.lock`; CI compares; CODEOWNERS makes both human-only |
| Verifying claims | `pnpm audit:claims` extracts every numeric token from README.md and DEVPOST.md and asserts each exists in `eval/report.json` |
| Scope review | ownership check above |
| Merge approval | auto-merge on all-green, squash |

`CODEOWNERS`:
```
/lib/types.ts           @you
/eval/thresholds.json   @you
/eval/thresholds.lock   @you
/data/MANIFEST          @you
/AGENTS.md              @you
/.github/               @you
```

`pnpm audit:claims` is load-bearing. It is the mechanism that makes a no-human-loop build
honest: a number cannot reach the submission unless the harness produced it.

---

# ARTEFACT 5 — SEEDS AND RESUME

## `CURRENT_AIM.md`

```markdown
# CURRENT AIM

**A1 — Typed holds applied correctly, with coverage at or above the ~70% industry plateau.**

Achieved when: `pnpm eval` reports coverage >= 0.70 against the dataset hash in
data/MANIFEST, every held invoice carries at least one conflict, and the report is
committed.

Not achieved by: the matcher existing, tests passing, or a demo running.

## Ladder
- [ ] A1 typed holds, coverage >= 70%
- [ ] A2 eval reports per-hold-type recall, precision, false-clear count AND rupees at risk
- [ ] A3 reviewer routing decision recorded; tolerance change recorded as a decision
- [ ] A4 evidence-of-review export produced
- [ ] A5 critique cannot demonstrate the eval is rigged, nor the claim generic

## The one thing that changes the plan
If the deterministic layer cannot reach ~70%, the DATA MODEL is wrong, not the strategy.
Fix normalisation. Do not pivot to an LLM-driven pipeline — that trades the entire
differentiation, and the headline metric, for a demo that hallucinates on camera.
```

## `memory.md`

```markdown
# MEMORY

Handover note to a stranger. Update at the end of every phase.

## Aim
A1 — typed holds, coverage >= 70%. Not started.

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
- Eleven workers. No MCP, no FX, no meta-system, no GST product (GST-style noise only).
- Do not claim novelty for three-way match, touchless AP or duplicate detection.

## Built and verified
(nothing yet)

## Quarantined
(none)

## Last eval
(none)

## Next action
Wave 0: scaffold repo, commit AGENTS.md, CODEOWNERS, CI checks, gate scripts. Nothing
spawns until CI is green on an empty repo.
```

## Resume prompt

```
Resume as project orchestrator for HOLDFAST.

Read, in order, before doing anything:
  HOLDFAST-ORCHESTRATION-FINAL.md   your role, the loop, the worker briefs
  CURRENT_AIM.md                     where the ladder stands
  memory.md                          working state and next action
  logs/orchestrator_log.md           tail 100 lines
  eval/report.json                   the only numbers that count
  critique/                          unresolved findings
  quarantine/                        unmerged branches and why

Continue from `## Next action` in memory.md.

Do not ask the user anything. Do not recap. Do not re-derive settled decisions — they are
under `## Settled` and re-opening them wastes the run.

If memory.md and the repository disagree, the REPOSITORY is correct and memory.md is
stale. Fix memory.md first, then continue.
```

---

## THE THREE MINUTES

Not a worker's job. Yours.

| Time | Beat |
|---|---|
| 0:00–0:25 | The plateau. Automation reaches ~70% touchless and stops. Show the tail: short payment with no explanation, lump sum covering forty invoices, remittance in another channel |
| 0:25–0:55 | Run. Typed holds applied. Queue ordered by money at risk |
| 0:55–1:45 | Open the highest-exposure hold. Field-level evidence, both sides aligned, the conflict named. Reviewer picks a resolution path and an owner — not approve/reject |
| 1:45–2:10 | The tolerance moment. Show that widening a tolerance in the incumbent ERP silently releases the hold; show Holdfast recording it as a decision |
| 2:10–2:35 | Eval. Coverage against the 70% plateau, false-clear count, rupees at risk, and the one we got wrong. Say that no vendor publishes this |
| 2:35–3:00 | AO session list. Evidence-of-review export. Close |

Closing line: **"It doesn't automate uncertainty. It routes it."**

Record one hold live. Replay the batch from persisted run logs, labelled replay on screen.
