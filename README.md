# HOLDFAST

**AP reconciliation that reports how often it was wrong.**
Built for the Syndicate by Maximor hackathon, Track 2 — Autonomous Office of the CFO.
Built with AO.

Holdfast reconciles supplier invoices against a bank statement and, for every invoice it
cannot settle beyond argument, applies a **typed hold** — a named condition that stops
payment, declares whether accounting entries may still be created, and says whether it
lifts on its own or needs a named person to lift it. It is an accounts-payable exception
workflow, not a match flag.

The category publishes a match rate. We publish a match rate **and** the number of
invoices we cleared that we should not have, and the rupees those wrong clears exposed.

---

## The measured result

Reported from a **holdout set of 60 invoices** generated at a seed frozen before any
search agent ran, written outside the repository, and never committed. Selection figures
are shown beside it and are never substituted for it.

| | coverage | strict auto-clear | false clears | rupees at risk | match precision |
|---|---|---|---|---|---|
| **Holdfast — holdout** | 63.3% | **24 of 60** | **0** | **Rs 0** | 100% |
| naive baseline — holdout | 65.0% | 39 of 60 | **9** | **Rs 23,01,540.23** | 76.9% |
| **Holdfast — selection (200)** | 74.0% | **93 of 200** | **0** | **Rs 0** | 100% |
| naive baseline — selection | 80.0% | 160 of 200 | **34** | **Rs 2,05,16,608.51** | 78.8% |

**The line that carries the whole project: on the holdout, the naive baseline cleared 39
invoices and got 30 of them right.** It beats us on the number the category publishes and
loses catastrophically on the number it does not. A coverage figure alone cannot tell
those two systems apart. The false-clear count and the money can, which is why both are in
the report and why the report is generated, never typed.

Every number in this repository's prose is read programmatically out of `eval/report.json`
or carries a named external source in `docs/citations.json`. `pnpm audit:claims` extracts
every numeric token from `README.md`, `DEVPOST.md` and `docs/**` and fails the build on
anything with no provenance. We could not have hand-typed a metric into this file if we
had wanted to.

> **Before you read the claims, read [the four adverse findings](#adverse-findings).**
> Two of them weaken the headline above. One of them is a methodological error by the
> human running the project. The fourth says most of what we thought was novel is prior
> art.

---

# 1. Is this a genuine pain point for the Office of the CFO?

The pain is not that matching is hard. The pain is that **matching wrongly is invisible.**

Touchless invoice processing sits far below the marketing. Ardent Partners puts the
average touchless rate at 32.6% and best-in-class at 49.2% — even the leaders hand half
the work to people. The Hackett Group puts median AP auto-match near 70%, and SAP's own
cash-application figures plateau in the 60-70% band, while vendor claims reach 95%.
Kognitos concedes the shape of the problem in its own marketing: 92% reached by aggressive
matching is worse than an honest 85%.

Duplicate-payment loss estimates run from 0.05% to 5% of AP spend. **The variance is the
argument.** Every figure in that range is self-reported by a firm selling recovery
services, and a hundred-fold spread means nobody is measuring the same thing.

Accuracy itself is not unmeasured, and we will not pretend otherwise:

- **Medius publishes a First Time Right rate.** **Vic.ai publishes accuracy figures** over
  hundreds of millions of invoices. Billtrust argues publicly that match rate is gameable.
- **Auditors publish error rates at scale.** CMS's CERT programme re-reviews tens of
  thousands of production claims a year and publishes a statistically valid
  improper-payment rate. AP recovery audit publishes wrongly-paid spend as a fraction of
  total spend.

What survives is narrower and, we think, still true:

> **No cash-application vendor publishes a false-clear rate for its own auto-matched
> items.** Accuracy is published. The rate at which the automation confidently settled the
> wrong document is not.

That is the gap this project is aimed at, and the naive baseline in the table above is
what the gap looks like when you measure it: a system that would have reported a
better-than-ours match rate on a slide while quietly exposing Rs 23,01,540.23 on 60
invoices.

---

# 2. Is the human-judgement side genuinely intuitive?

The reviewer surface is built on one refusal: **it never asks a reviewer to approve or
reject.** Approve/reject is the wrong question, because the reviewer usually is not the
person who can resolve the exception. The question the product asks is **who should act
next.**

### The queue

`GET /api/runs/{runId}/queue` returns exceptions ordered by `money_at_risk_paise` first,
then case id. Each row carries the invoice, its holds (each with a clause, a severity, its
conflict codes and whether it lifts on its own), the top match candidate with its
composite score and whether that candidate was re-verified, the age of the hold, whether
the document is payable, and a `suggested_next` routing hint. The API describes that hint
in its own words: *"a suggestion derived from hold policy. The reviewer chooses and the
choice is what is recorded."*

Ordering exceptions by money at risk is **not novel** — see §5.

### A decision is a routing act

Recording a decision requires four things: an action, a named reviewer, a reason, and
`owner_next` (a role plus a party — ap_clerk, ap_manager, controller, requisitioner,
tax_team, treasury, vendor). There are three resolution paths: `re_application`,
`customer_outreach`, `internal_correction`. Three of the seven decision actions are
refused at this endpoint with a pointer to the route that owns them, because a tolerance
change and a feedback rule are not the same kind of act as releasing a hold and must not
be recordable as one.

### Nothing consequential happens without a preview

Releasing a hold without the human-approval header returns **Precondition Required** with a
preview:
which holds lift, which stay open, whether the invoice becomes payable, the gross amount,
the money at risk, and — the one that matters — whether you are about to lift a hold that
*would not have lifted on its own*. The same pattern guards a tolerance change and a
feedback-rule stand-down.

### A tolerance change is a decision, recorded against the hold it released

This is the one place where we still claim something narrow and specific (§5). Changing a
tolerance writes a `tolerance_changes` row **and** a paired decision that names it, both
citing each other, plus two journal rows. The assessment produces three outcomes, not two:

- `released` — the change lifted this hold;
- `requires_named_release` — the tolerance governs this hold, but a person must still act;
- `withheld` — with one of five typed reasons: `already_released`,
  `outside_declared_scope`, `kind_does_not_reach_hold_type`, `change_is_not_a_widening`,
  `no_declared_band_to_move`.

The gap between the first two outcomes is the product. Direction is **derived, never
declared** — and derived correctly: a ceiling loosens as it rises, but a **similarity
tolerance is a floor**, so raising it registers as *narrowed*. Three implementations agree
on that derivation, including a generated database column. `reconcileRelease` then answers
the audit question the feature exists for: which holds were released **without**
governance.

### Evidence of review, as an artifact

`GET /api/runs/{runId}/review-evidence` produces a sealed export: preparer and reviewer
identities recovered from the journal (a model actor is never counted as either, and if
nobody is recoverable the export says `attributable: false` rather than inventing a name),
a precision-of-review figure, the exception log, per-change tolerance evidence, and a hash
chain over the journal that reports `intact` and `contiguous` separately.

The reviewer UI itself was built by a human collaborator outside AO and is not ours to
claim. Everything above is the API it drives, and the one rule that crosses that boundary
is mechanical: no numeric metric literal may appear anywhere under `app/`, theirs included.
A hardcoded number in the UI is the exact thing that makes a judge stop believing the
evaluation.

---

# 3. How deep is the automation in this specific workflow?

The pipeline is **normalise → match → holds → decide**, and the ordering is the domain
model rather than an implementation convenience. Holds are applied after matching but are
not a match outcome: duplicate detection runs over *invoices* and never looks at a payment.
Nothing downstream can clear an invoice that any family held — a hold beats a score,
always, in both directions.

### Normalisation

A registry of named, individually toggleable, pure steps — unicode folding, case folding,
punctuation stripping, delimiter segmentation, noise-token and legal-suffix stripping,
abbreviation expansion, alias mapping, identifier repair — composed into per-field profiles
and driven by data tables rather than code. Every step emits a trace row with a structured
rule name, so a reviewer can see exactly which rules touched a field. Token classification
reads structure off the raw line, so a document number is not shredded into a bare year.

### Matching

Four weighted components, declared as data and validated to sum to one:

```
// engine/match/spec.ts — WEIGHTS_V1, spec id "match.v1"
reference 0.4   amount 0.35   vendor 0.15   date 0.1
ranking: consider_min 0.25, accept_min 0.75, tie_epsilon 0.02
```

`accept_min` is **derived, not picked**: it is the reference weight plus the amount weight,
i.e. exactly the score of a pairing whose canonicalised reference matches and whose settled
sum equals the invoice gross to the paise. The LLM gate reads that constant from the spec
rather than restating it, so the two cannot drift.

### Eleven typed holds, seventeen conflict codes

Each hold type declares `auto_releasable`, `blocks_accounting`, a default severity and a
clause. `blocks_accounting: false` means the invoice cannot be paid while accrual entries
may still be created — a distinction taken from Oracle Payables, and a large part of why
the workflow reads as an AP system rather than a match flag. A family may only raise the
hold types it declares, and a hold with zero conflicts throws rather than being emitted: a
silently dropped hold is an invoice that gets paid.

### The parts we would defend on the merits

- **Cardinality.** Bulk remittances are settled by exact subset-sum over integer paise,
  meet-in-the-middle, bounded by a frozen maximum subset size. On the selection set the
  mean number of statement lines inside one invoice's window is 74, and a bounded search
  returned dozens of arithmetically perfect solutions on individual invoices without
  finishing. So amount evidence **never nominates** a settling set: a line enters the pool
  only if a reference token recovered from the raw narration names the invoice. Reference
  evidence picks the candidates; arithmetic picks among them. **On a tie, the settling set
  is reported empty and a `multiple_candidates_tied` conflict is raised** — applying a
  payment means naming it, and two sets that both fit to the paise name none.
- **Duplicates.** A recurrence flag is treated as necessary but not sufficient, because a
  control defeatable by anything wearing the badge is not a control. Suppression also
  requires an observable series: three or more documents at the same vendor and amount, in
  distinct periods, under distinct references, on a regular cadence. A duplicate inserted
  into a recurring stream breaks the cadence it would hide behind. Duplicate-candidate
  recall is 100% on both the selection and the holdout sets, and duplicate holds are never
  auto-releasable.
- **The LLM boundary.** The rule of the house is *the model proposes, deterministic code
  verifies.* The proposal schema is strict and admits exactly two fields — a list of
  payment ids and a citation enum. There is no field anywhere in this codebase for a
  model's stated certainty. Every nomination re-enters the same scorer, with the same
  weights and the same spec id, as any deterministic candidate, and is discarded unless it
  clears `accept_min` on its own merits. A model actor is confined by the database itself
  to exactly two journal events. A standing check asserts, at compile time and at runtime,
  that the model's event set is exactly those two, and walks the import graph out of the
  boundary to prove nothing reachable from it can express a release, a clear or a hold.

### The record

Nine tables, append-only, enforced twice: the grant is revoked, **and** a trigger refuses
removal — because a superuser bypasses the grant but not the rule. That was found by
testing the claim rather than the mechanism, and it is adverse finding 3 in our log.
In-place updates survive only where the domain needs them (releasing a hold, standing down
a rule), and each writes a journal row that cannot itself be amended. There is no payment
execution code in this repository: not disabled, not flagged — absent, and a build gate
fails on any function shaped like one.

### Depth is reported per hold type, not in aggregate

`eval/report.json` publishes recall and precision **per hold type** and coverage **per
stratum**, because aggregate-only reporting is the thing we criticise the category for and
we do not get to do it ourselves. That is how you can see, from our own report, that
`duplicate_candidate` recall is 100% and `cardinality_residual` recall on the selection set
is 0.0%.

---

# 4. How well grounded is this for a real accountant?

**Money.** Integer minor units — paise — everywhere, branded at the type level and stored
as `BIGINT`. There is no rupee field and no float in any money path. A build gate fails
the repository on `parseFloat` or a numeric cast of a monetary field. This is not fussiness:
a float in an AP system is a rounding bug with a plausible face.

**The hold model is Oracle's, and we say so.** Typed hold codes, auto-release on condition
resolution, and a flag governing whether accounting entries may be created while the hold
is on. We port a data model; we did not invent one (§5).

**Application status is never collapsed.** `applied`, `unapplied`, `on_account`,
`unidentified` are four distinct states, because "unidentified" and "on account" are
different problems with different owners, and collapsing them is how a real cash-application
queue becomes uninterpretable.

**The floors were set before any data existed**, in a frozen file, and are reported as
observed rather than moved when they are missed. Three per-hold-type recall floors are
**not met** on the selection set and the report says so on every run. Widening a threshold
to make a red build green is the same move as widening a tolerance to release a hold, and
it is the move this whole project exists to refuse.

**We make no assurance-programme, attestation or certification-scheme claims of any kind**,
and nothing here is a security or audit-readiness statement.

### Why not BenchRec?

BenchRec (ICAIF 2023, Operartis) is the obvious reconciliation benchmark and we did not
use it, deliberately.

- **It is the wrong reconciliation.** BenchRec is bank-statement-to-general-ledger cash
  matching. Our workflow is invoice-to-payment settlement inside accounts payable — a
  different pairing, a different cardinality problem, and a different set of failure modes
  (duplicates, TDS deductions, credit notes crossing a settlement, period deferrals).
- **It does not label exception *types*.** A benchmark that scores matched-versus-unmatched
  cannot evaluate a review workflow, because a review workflow routes on *why* something
  is held. `price_variance` goes to a requisitioner, `tax_variance` to the tax team,
  `cardinality_residual` to treasury, `no_reference` to the vendor. Without typed
  exceptions there is nothing to route and nothing to score.
- **We use it as a design principle instead.** BenchRec records a Tier-1 bank's production
  requirement at 99.8-99.9% match precision — a bank stating, three years before this
  hackathon, that leaving a transaction unmatched for review is better than matching it
  incorrectly. **We do not claim to meet that bar.** We adopt its ordering: precision
  first, coverage second. Our floor is set at 0.98 and our measured match precision is 100%
  on both sets, with the important caveat in adverse finding 1 below.

The comparable published result on *pairwise* entity matching is OpenSanctions Pairs
(February 2026): a rule-based matcher at 91.3 F1 against GPT-4o at 99.0. We take the
implication seriously — rules over-match, and pairwise matching is near a practical ceiling,
so the interesting work is uncertainty-aware review rather than another matcher.

---

<a id="adverse-findings"></a>

# 5. Adverse findings

Four findings, all of them damaging, all of them found by critics or by our own harness,
none of them softened. They are here rather than in an appendix because a disclosed flaw
nobody asked about is the most credible thing this submission has.

The full text is in [`docs/adverse-findings.md`](docs/adverse-findings.md).

## AF-1 — Our coverage number counts auto-released holds as decided

Coverage is `decided / total`, and "decided" means *an outcome was reached without a named
human*. That set includes auto-releasing holds. On the holdout:

**38 decided = 24 strict auto-clears + 14 auto-released holds.**

Most of those 14 have a real payment in truth that the engine failed to find. We are
counting "I raised a hold that will lift by itself" as coverage, and it is not the same
thing as settling the invoice. **The strict figure is 24 of 60.** Both are in the table at
the top of this file and both are in the report.

Our own normalisation sweep produced the same finding from the other direction: coverage is
largely *insensitive* to normalisation quality, because a pairing lost becomes an
auto-releasing `matching` hold and a pairing gained comes out of an auto-releasing
`no_reference` hold — so both already counted as decided. Strict auto-clears barely moved
across the entire sweep.

**And `Rs 0 at risk` is partly structural.** A false clear is only computed for an
auto-clear. A hold always emits an empty payment set. **A hold therefore cannot be a false
clear by construction.** Our zero is real — no invoice we settled was settled wrongly — but
it is a zero over 24 decisions on the holdout, not over 38, and the mechanism that produces
it is worth understanding before it is quoted.

## AF-2 — The reference component returns its maximum for factually wrong pairings

Over a thousand factually wrong invoice-payment pairings clear the reference component's
floor on **reference evidence alone**. In the critic's words: *only the amount stops them.*

The composite score survives because the amount component disagrees, and the amount
component is doing far more work than the weight table implies. A reference similarity that
saturates on wrong pairs is not a reference signal; it is a near-constant. This is a real
defect in the scoring model, it is not fixed, and it is one honest normalisation change away
from becoming false clears.

## AF-3 — The orchestrator aimed the normalisation sweep using holdout truth labels

Before spawning the sweep agents, the human running this project probed the **holdout truth
labels**, published the per-label breakdown in the orchestration log, and used it to justify
the search direction. The critic's verdict, quoted exactly:

> **"The twelve agents are clean; the experimenter is not."**

It is right. Every mechanical protection held — the agents ran in isolated worktrees with a
single writable directory, none of them could reach the holdout, and their reports all show
the holdout as absent. The protection that failed is the one nobody built a gate for: the
person choosing what to search. Two further leakage paths are real and recorded: the holdout
score appears in a commit subject in every sweep worktree's git log, and holdout structure at
a finer granularity than the committed specification is reachable in the object store through
blobs of a removed report file.

**Consequence, stated plainly: the holdout number is not a number produced by a search that
never saw the holdout. It is a number produced by a search a human aimed using it.** That is
a weaker claim than the one we set out to make and it is the true one.

## AF-4 — Four of five novelty claims are prior art

A critic ran roughly a dozen searches and broke most of what we believed. **These are not
novel and we do not claim them:**

| what we believed was ours | prior art |
|---|---|
| Typed holds with auto-release and an accounting block | **Oracle Payables** ships it: hold codes, an accounting-hold reason that prevents Payables creating entries, and a postable flag. **SAP** has blocking reasons with automatic release. |
| Ordering exceptions by money at risk | **Trintech** — risk-based reconciliation rates accounts by materiality. |
| Resolution path plus owner-next | **Stampli**: *"give every exception three things: a category, an owner, and a clock."* |
| Three-way match, touchless AP, duplicate detection | Table stakes. Submitted to hackathons repeatedly. |

Three sentences we had been saying are simply **false**, and we retract them:

- *"Nobody publishes how often they got it wrong"* — Medius and Vic.ai publish accuracy.
- *"No audited error rate exists"* — CMS CERT re-reviews production claims annually and
  publishes an improper-payment rate.
- *"Nothing records that a judgement was made when a tolerance changes"* — SAP logs the
  configuration change through change documents.

**The two claims that survived the search are the only two we make:**

1. **No cash-application vendor publishes a false-clear rate for its own auto-matched
   items.**
2. **A tolerance change recorded as a decision on the specific hold it released** — the
   narrow form. Not "nobody records tolerance changes"; the incumbent records the
   *configuration* change. What is recorded here is the change bound to the individual hold
   whose release it caused, with the reviewer, the reason, the derived direction, and a
   reconciliation naming any hold released without governance.

---

# 6. The dataset

**Synthetic, adversarially generated, frozen at a named commit, with the stratification mix
disclosed.** No real company names, vendors, tax registrations or bank details appear
anywhere; the synthetic tax identifiers use state codes that cannot be issued, so they keep
the shape a normaliser must handle without colliding with a real registration.

```
selection   200 invoices, 173 statement lines
            root 457aeafbd8633387ca4fd102bef3582f2014ca3b02a8536e3ca737fd6a7184ef
holdout      60 invoices,  51 statement lines   (never committed; digests only)
            root b410dcf1ea5388b4d286bab86d3e623f92e11cdedf1c2f55a093cfff14e8e568
frozen at commit 71d4dbaef972129b4694711cf4b314df7a14067e
holdout seed 20260907  =  selection seed + 1     policy: eval/thresholds.json
  amount_cap_paise 50000000 · date_window_days 45 · max_subset_size 40
```

Declared stratification, published beside the realised counts so the two can disagree:

| stratum | selection | holdout |
|---|---|---|
| clean | 120 | 36 |
| duplicate | 20 | 6 |
| tolerance | 15 | 5 |
| cardinality | 15 | 5 |
| reference | 15 | 4 |
| period | 15 | 4 |

**The generator normalises nothing.** Normalised reference, normalised narration and
normalised vendor name are emitted byte-identical to their raw counterparts, and every
extraction field on a statement row is null with status `unidentified`. Recovering those
values is the work being measured; filling them would hand the matcher the answer on both
sides at once.

**The holdout is not in the repository and is not a git object.** Only its digests are
committed, into the frozen manifest, before any search agent existed. Gitignoring would not
have been enough — sparse checkout controls the working tree, not the object store. Anyone
can regenerate the holdout byte-identically from the committed generator at the seed above
and check the hashes. Nobody has to take our word for the isolation. (Read AF-3 before
concluding that the isolation was sufficient.)

**A firewall separates the generator from the matcher.** Only `eval/` may read the answer
key; a build gate bans any reference to it from the engine, the model boundary or the app,
and bans any import from the generator into any of them. The harness validates a
seven-field projection of an invoice and hands the engine the unnarrowed rows, so the thing
that judges the engine is not shaped by the engine's internals. That cost us an integration
bug at the assembly point, and it was the cost we chose to pay.

**Predictions were written before the harness first ran**, in their own commit so the
ordering is checkable in the git log. One was confirmed — the naive baseline looks
acceptable on aggregate coverage and only the false-clear count and the rupees expose it.
One was **falsified**: we predicted our deterministic layer would over-match and surface
false clears. It does the opposite. It under-matches, and produces zero false clears on both
sets. That falsification ships, because a project that reports only its confirmed
predictions is not running an experiment.

**The strong LLM baseline did not run for this report.** It is implemented and sits behind a
flag; the machine that produced this report had no provider key. The harness records an
absent baseline as **absent**, not as a row of zeros, and the report says so in its own
notes. We are not going to describe a comparison we did not measure.

---

# 7. How we used AO

Sessions are reported **by category**. They are never summed into a headline number,
because "we ran N agents" is a spend, not a result.

| category | count | outcome |
|---|---|---|
| merged worker sessions | thirteen | one branch each, disjoint ownership globs |
| race sessions discarded | 7 | redundant spawns on the three hardest briefs |
| normalisation sweep sessions | 12 | 8 completed (4 lost to an API outage), **1 merged**, 7 recorded and discarded |
| critic sessions | 4 | no merges — all four found something |

**Ownership is mechanical.** Every branch name maps to a set of globs, and CI fails any pull
request touching a path outside them even if the change is correct. A frozen list — the
contract types, the thresholds, the dataset manifest, the hold registry, the assembly point,
the citation list, the gate scripts — is denied to every worker branch, and the frozen check
runs *before* the scope check, so a frozen path is refused even when it sits inside the
requesting worker's own glob.

**Racing.** Three agents on one brief in isolated worktrees; first to all-green opens the
pull request, the others are killed, and the winner is taken **whole** — nothing is ever
cherry-picked across racers. Held at three because pass@k on hard coding tasks flattens
there, and because racing only reaches that ceiling if the referee is reliable. **Our
referee is the green checks. No racer ever selects itself.** Losing racers still produced
value that is recorded in the log rather than discarded: one found a superuser bypass of the
append-only guarantee by testing it, one flagged a house-rule violation in a rival's output,
one found a fairness bug in its own first draft.

**The sweep.** Twelve agents, one assigned strategy direction each, a single writable
directory and nothing else. **No sweep agent opened a pull request and no sweep agent scored
itself** — the orchestrator re-ran every evaluation, because the evaluator sits inside a
worker's glob and an agent could otherwise grade its own homework. The selection rule was
given to every agent verbatim and applied in order: any false clear or any rupee at risk is
**discarded, not ranked lower**; survivors rank on coverage; ties break on lower money at
risk. All eight completed agents passed the filter. Five of them independently found the
same defect — punctuation stripping shattering a document number before candidates were
extracted — from five different starting directions. Two returned null results and said so
rather than manufacturing a change. Three refused an easy win: one measured that disabling a
guard scored *higher* and declined it — *"coverage rising because the match got worse; not
taken"* — one fixed a defect the baseline had been profiting from, at a temporary cost, and
one found a real defect, observed that it changed no decision, and reverted it rather than
pad the diff.

**Nine CI failures were routed back and fixed**, and they are numbered in the orchestration
log. Two of them were in the orchestrator's own code, caught by gates the orchestrator wrote:

1. Shell heredocs mangling escaping in every regex-bearing gate script.
2. **A gate that silently stopped running** — a direct-invocation guard split a path on
   forward slashes only, so on Windows it never matched and the forbidden-pattern gate
   reported success while doing nothing. This is the exact failure mode the gate exists to
   prevent, found inside the gate.
3. Decorative-rule risk: positive and negative fixtures added for every forbidden rule.
4. The forbidden gate scanning agent worktrees and reporting each worktree's own copy of the
   house rules as violations.
5. The gate tripping its own house rules, fixed with an exact-line allowlist rather than a
   file exemption, so that *disclaiming* an overclaim is not punished.
6. Sparse checkout failing to hide the holdout — replaced by never committing it.
7. No race branch could pass the ownership gate; the race was unwinnable by construction.
8. A stratification file present but unreadable, silently degrading the declared-versus-
   realised disclosure to something that could never disagree.
9. The generated report being committed by an over-broad `git add`, putting a placeholder
   number into the claim auditor's allowlist.

And one more, worth its own line: **`pnpm verify` failed the orchestrator's own assembly
code** on a numeric cast of a monetary field — the rule the orchestrator had written. The
gates were built to catch workers optimising for green; the first thing they caught at the
assembly point was the person who built them.

**Two parallel tables were found drifting from a frozen single source** — a hold-policy
table and a tolerance-governance table, both written by a worker that started before the
owner existed, both flagged by that worker rather than discovered later. One of them made a
detail screen report that a hold permitted accounting entries when the engine said it
blocked them: a screen that lies to a reviewer. The lesson generalises: parallel construction
produces duplicate sources of truth, and the fix is not more review, it is making the second
copy import the first.

**Work before the submission window was research and planning only.** All building happened
inside the window.

---

# 8. Reproduce it

```bash
pnpm install
export HOLDFAST_HOLDOUT_DIR=/path/to/holdfast-holdout   # regenerate from the frozen seed
pnpm eval          # writes eval/report.json — every number in this file comes from it
pnpm verify        # selftest, typecheck, forbidden, ownership, manifest,
                   # thresholds, migrations, eval, regression, audit:claims
pnpm audit:claims  # fails if any number in README/DEVPOST/docs has no provenance
```

Regenerate the holdout with the committed generator at the frozen seed and compare its five
digests against `data/MANIFEST` before believing the headline.

## Further reading

| document | what it holds |
|---|---|
| [`docs/adverse-findings.md`](docs/adverse-findings.md) | The four findings in full, unsoftened |
| [`docs/claims.md`](docs/claims.md) | Every claim we make, every claim we retract, and the prior art |
| [`docs/methodology.md`](docs/methodology.md) | Dataset, firewall, floors, holdout, what the report measures |
| [`docs/how-we-used-ao.md`](docs/how-we-used-ao.md) | Session accounting by category, gates, races, the sweep |
| `eval/PREDICTION.md` | Five falsifiable predictions, written before the first run |
| `logs/orchestrator_log.md` | The full run log, including everything that went wrong |
| `sweep/results.md` | All twelve sweep agents, including the losers |

## Testing policy

**Exactly three tests exist in this repository**, and each one backs a claim made on camera:
the model boundary cannot reach a hold release; the firewall gate is observed to fail on a
real violation; and the ownership matcher handles route-group parentheses, which are glob
metacharacters. There is no coverage requirement and no unit-test suite. A gate never
observed to fail is not evidence of a gate, and a test that backs no claim is not evidence
of anything.
