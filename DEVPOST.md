# HOLDFAST — Devpost submission

**Track 2 — Autonomous Office of the CFO.**
Built with parallel Claude Code agents in isolated git worktrees, one ownership glob each,
CI as the referee, and no agent ever scoring itself into a merge.

## Elevator pitch

AP reconciliation that publishes how often it was wrong. On a held-out set of 60 invoices,
the naive baseline every vendor demo is built on cleared 39 invoices and got 30 of them
right. Holdfast cleared 24 and got 24 right.

Then a critic we hired found that our own headline metric was counting invoices nobody had
settled. We changed the definition, coverage fell eighteen points, and we shipped the lower
number.

---

## The result, first

| | coverage | strict auto-clear | false clears | rupees at risk | match precision |
|---|---|---|---|---|---|
| **Holdfast — holdout (60)** | 45.0% | **24 of 60** | **0** | **Rs 0** | 100% |
| naive baseline — holdout | 65.0% | 39 of 60 | **9** | **Rs 23,01,540.23** | 76.9% |
| **Holdfast — selection (200)** | 51.5% | **93 of 200** | **0** | **Rs 0** | 100% |
| naive baseline — selection | 80.0% | 160 of 200 | **34** | **Rs 2,05,16,608.51** | 78.8% |

The baseline **beats us on coverage on both sets** — by twenty points on the holdout — and
would have shown the better number on a slide. It exposed Rs 23,01,540.23 on 60 invoices
doing it. A coverage figure alone cannot distinguish those two systems; the false-clear count
and the money can.

The holdout was generated at a seed frozen before any search agent ran, written outside the
repository, and never committed — only its digests are in git, and CI rebuilds it from the
frozen seed on every pull request and compares them. Every number above is read
programmatically out of `eval/report.json` by a build gate that fails on any figure typed by
hand. **Read the adverse findings below before quoting any of it.**

---

## The number we are proudest of is the one that went down

Our whole argument is that a coverage number alone cannot tell a working system from a
careless one. **Our own coverage number could not.**

We had declared two hold types — `matching` ("no payment matched within tolerance") and
`no_reference` ("no usable reference token was found on the payment side") — as
**auto-releasable**. An auto-release means the condition resolves on its own: for `matching`,
when a payment arrives. But **the payment set a run sees is closed and already presented.**
Nothing further arrives, so the condition can never resolve and a named person has to look.
No later event supplies a reference token that is not there, either.

It was wrong on our own Oracle framing and it was not cosmetic: **it counted every invoice
where we found nothing as "decided without a human"**, the exact opposite of what happened.

A critic briefed to attack our metrics found it. We changed the definition in
`engine/holds/registry.ts`. `period_deferral` stays auto-releasable — the period genuinely
does roll over on its own.

**Coverage fell eighteen points on the holdout, to 45.0% — 27 of 60 decided. False clears,
rupees at risk and match precision did not move at all**, because they never depended on the
definition that was wrong. The flattering number was fragile; the correctness numbers were
not. That is the thesis demonstrated on ourselves rather than asserted about other people.

---

## 1. Is the problem a genuine pain point for the Office of the CFO?

Matching is not the hard part. **Matching wrongly, invisibly, is.**

Ardent Partners puts average touchless invoice processing at 32.6% and best-in-class at
49.2%. The Hackett Group puts median AP auto-match near 70%; SAP's own cash-application
figures plateau at 60-70%; vendor claims reach 95%. Kognitos concedes the shape of it in its
own copy: 92% reached by aggressive matching is worse than an honest 85%. Duplicate-payment
loss estimates span 0.05% to 5% of AP spend — a hundred-fold range, every figure of it
self-reported by a firm selling recovery. **The variance is the argument.**

Accuracy *is* published, and we will not pretend otherwise: Medius publishes a First Time
Right rate, Vic.ai publishes accuracy figures, and CMS's CERT programme re-reviews tens of
thousands of production claims a year and publishes an audited improper-payment rate. The
narrow claim that survives a search is this one:

> **No cash-application vendor publishes a false-clear rate for its own auto-matched items.**

## 2. Is the human-judgement side truly intuitive?

The workflow never asks a reviewer to approve or reject, because the reviewer is usually not
the person who can fix the exception. It asks **who should act next.** A decision requires an
action, a named reviewer, a reason and an owner — a role plus a party — along one of three
resolution paths.

The queue orders by money at risk. Every exception carries typed holds with a clause, a
severity, conflict codes, and whether it lifts on its own. Nothing consequential happens
without a preview: releasing a hold without the human-approval header returns Precondition
Required and tells you which holds lift, which stay open, whether the invoice becomes
payable, how much money stops being held, and whether you are about to lift a hold that
would never have lifted by itself.

**A tolerance change is recorded as a decision on the specific hold it released** — the one
narrow claim that survived our own prior-art search. Three outcomes, not two: `released`,
`requires_named_release`, and `withheld` with five typed reasons. Direction is derived, never
declared — and a similarity tolerance is a *floor*, so raising it registers as narrowed. A
reconciliation function then answers the audit question the feature exists for: which holds
were released **without** governance.

The reviewer UI was built by a human collaborator outside this agent build and is not ours to
claim. The
API above is what we built, and one mechanical rule crosses that boundary: no numeric metric
literal may appear anywhere under the app directory, theirs included.

## 3. How deep is the automation?

**normalise → match → holds → decide.** Holds are applied after matching but are not a match
outcome — duplicate detection runs over invoices and never looks at a payment. Nothing
downstream can clear an invoice any family held.

- **Eleven typed holds, seventeen conflict codes.** Each hold declares whether it
  auto-releases, whether accounting entries may still be created while it is on, a default
  severity and a clause.
- **Matching** is four weighted components declared as data, validated to sum to one, with an
  accept threshold that is derived — the reference weight plus the amount weight, i.e. the
  score of a pairing whose reference matches and whose settled sum equals gross to the paise.
- **Cardinality** is exact meet-in-the-middle subset-sum over integer paise, anchored so that
  amount evidence never nominates a settling set. Bounded search over one invoice's window
  returns dozens of arithmetically perfect and semantically wrong solutions, so **on a tie we
  report the settling set empty and raise a conflict.** Applying a payment means naming it,
  and two sets that both fit to the paise name none.
- **Duplicates** treat a recurrence flag as necessary but not sufficient — suppression also
  needs an observable series across distinct periods and references on a regular cadence.
  Duplicate recall is 100% on both sets and a duplicate hold never auto-releases.
- **The model proposes; deterministic code verifies.** The proposal schema admits exactly two
  fields: payment ids and a citation enum. There is no field anywhere in this codebase for a
  model's stated certainty. Every nomination re-enters the same scorer as any deterministic
  candidate and is dropped unless it clears the accept threshold on its own merits. The
  database confines a model actor to exactly two journal events, and a standing check proves
  at compile time and at runtime that nothing reachable from the boundary can express a
  release, a clear or a hold.
- **Nine tables, append-only, enforced twice** — the grant is revoked *and* a trigger refuses
  removal, because a superuser bypasses the grant but not the rule. We found that by testing
  the claim rather than the mechanism. There is no payment execution code: not disabled, not
  flagged — absent.
- **Depth is reported per hold type and per stratum**, not in aggregate, which is how you can
  read out of our own report that duplicate recall is 100% and selection-set
  `cardinality_residual` recall is 0.0%.

## 4. How well grounded is it for real accountants?

Money is integer paise, branded and stored as `BIGINT`; there is no rupee field and no float
in any money path, and a build gate fails the repository on a float parse or a numeric cast
of a monetary field. The hold model — typed codes, auto-release, an accounting block — is
**ported from Oracle Payables, not invented.** Application status keeps four distinct states
rather than collapsing them. The policy constants — the amount above which a human reviews
regardless of score, and the settlement window a search may look inside — were frozen before
any data existed, put hard ceilings on what we can reach, and were not moved once the data
arrived. We make no assurance-programme, attestation or certification-scheme claims of any
kind.

**The floors were set before any data existed, and we do not meet them.** Stage-2 enforcement
lives on the unmerged branch `orchestrator/floors-live` at `f6c21e0`, deliberately not merged
so it can be demonstrated without turning `main` red. Run the regression check with that file
present and it says:

```
regression: stage 2 — eval/floors.live present, floors ENFORCED
regression: coverage 0.515, false_clears 0, decided 103, rupees_at_risk 0 paise, rate 0.0000

regression: FAIL — 1 condition(s)

  coverage 0.515 is below the floor 0.7

Do not widen a floor to clear this. That is quarantine Q2 — the same move the
incumbent ERP calls "change the tolerance", and we refuse it for the same reason.
```

**One condition fails and it is coverage. Every correctness floor passes.** Three
per-hold-type recall floors also go unmet, reported as observed on every run. We did not
reach the coverage floor and we are not moving it.

**Why not BenchRec?** It is bank-statement-to-general-ledger cash matching, not
invoice-to-payment settlement, and it does not label exception *types* — which is exactly what
a review workflow routes on. We use it as a design principle instead: it records a Tier-1
bank's production requirement at 99.8-99.9% match precision, a bank stating three years
before this hackathon that leaving a transaction unmatched for review beats matching it
incorrectly. We do not claim to meet that bar. We adopt its ordering — precision first,
coverage second — floor ourselves at 0.98, and measure 100% on both sets, with the caveat in
AF-1 below.

---

## Adverse findings — all four, unsoftened

**AF-1 — Coverage still is not a settlement count, and `Rs 0` is partly structural.** The
largest part of this finding is fixed and is the section above. What remains: coverage is
`decided / total`, and on the holdout **27 decided = 24 strict auto-clears + 3 auto-released
`period_deferral` holds** — a small gap, not a zero one. **The strict figure is 24 of 60**,
and it is the number to quote if you only quote one. And `Rs 0 at risk` is partly structural:
a false clear is only computed for an auto-clear, and a hold always emits an empty payment
set, so **a hold cannot be a false clear by construction.** Our zero is real, but it is a zero
over 24 decisions on the holdout, not over 60 — a system that held everything would report
the same zero for the same mechanical reason.

**AF-2 — The reference component returns its maximum for factually wrong pairings.** Over a
thousand wrong pairings clear the reference component's floor on reference evidence alone. In
the critic's words: *only the amount stops them.* A reference similarity that saturates on
wrong pairs is not a signal, it is a near-constant — and it is one honest normalisation change
away from becoming false clears.

**AF-3 — The orchestrator aimed the normalisation sweep using holdout truth labels.** Before
spawning the sweep, the human running the project probed holdout truth, published the
per-label breakdown, and used it to choose the search direction. The critic's verdict:
**"the twelve agents are clean; the experimenter is not."** Every mechanical protection held.
The one that failed is the one nobody built a gate for. **The holdout number is therefore not
a number produced by a search that never saw it; it is a number produced by a search a human
aimed using it.**

**AF-4 — Four of five novelty claims are prior art.** Typed holds with auto-release and an
accounting block: **Oracle** ships it, and SAP has blocking reasons with automatic release —
**we port a data model, we did not invent one.** Ordering exceptions by money at risk:
**Trintech.** Resolution path plus owner: **Stampli** — *"a category, an owner, and a clock."*
Three-way match, touchless AP and duplicate detection are table stakes. We also retract three
sentences we had been saying that are simply false: that nobody publishes how often they got
it wrong, that no audited error rate exists, and that nothing records that a judgement was
made when a tolerance changes.

**Two claims survived**, and they are the only two we make: no cash-application vendor
publishes a false-clear rate for its own auto-matched items; and a tolerance change recorded
as a decision on the specific hold it released.

Full text: `docs/adverse-findings.md`.

---

## How we built it — parallel agents, and CI as the referee

**Parallel Claude Code agents in isolated git worktrees, one ownership glob each, CI as the
referee, and no agent ever scoring itself into a merge.** The record is the pull request
history rather than the branch list — every change arrived through a pull request with the
five checks attached, thirty-eight of them by the time this was written.

Sessions are reported **by category** and never summed into a headline, because agent count
is a spend, not a result.

- **Thirteen merged worker sessions**, one branch each, on disjoint ownership globs enforced
  by CI. A frozen list — contract types, thresholds, dataset manifest, hold registry, assembly
  point, citation list, gate scripts — is denied to every worker branch, and the frozen check
  runs before the scope check.
- **7 race sessions discarded.** Three agents on one brief, isolated worktrees; first to
  all-green opens the pull request, the rest are killed, and the winner is taken **whole**.
  No racer ever selects itself — the referee is the green checks. Losing racers still found
  real things, including a superuser bypass of our append-only guarantee, discovered by
  testing the claim rather than the mechanism.
- **12 normalisation sweep sessions**: 8 completed (4 lost to an API outage), **1 merged**, 7
  recorded and discarded. No sweep agent opened a pull request and no sweep agent scored
  itself; the orchestrator re-ran every evaluation. The selection rule was given verbatim and
  applied in order — any false clear or any rupee at risk is **discarded, not ranked lower**.
  All eight that finished passed that filter. Five independently found the same defect from
  five different starting directions. Two returned null results and said so. Three refused an
  easy win, one of them measuring a *higher* score and declining it: *"coverage rising because
  the match got worse; not taken."*
- **4 critic sessions, no merges of their own, all four found something** — and one of them
  changed the headline metric, which is the section at the top of this page. Two of the four adverse findings
  above came from them.
- **Nine CI failures were routed back and fixed**, numbered in the log — including two in the
  orchestrator's own code. One was a gate that had **silently stopped running**: a path guard
  split on forward slashes only, so on Windows it never matched and the gate reported success
  while doing nothing. That is the exact failure mode the gate exists to prevent, found inside
  the gate. Separately, `pnpm verify` failed the orchestrator's own assembly code on a numeric
  cast of a monetary field — the rule the orchestrator had written.

Work before the submission window was research and planning only. All building happened
in-window.

## What we learned

**A gate that reports a claim holds is not the same as the claim holding.** It happened three
times in one run: our code-ownership file reported protection it did not provide, a database
grant reported immutability a superuser walked straight through, and a pattern gate reported
success while never executing. All three were caught by testing the claim rather than the
mechanism, and that is now the only way we believe a gate.

**Parallel construction produces duplicate sources of truth.** Two tables were found drifting
from a frozen single source — one of them made a detail screen tell a reviewer that a hold
permitted accounting entries when the engine said it blocked them. A screen that lies to a
reviewer is the whole failure this product exists to prevent, arriving inside the product. The
fix is not more review; it is making the second copy import the first.

**The measurement is the product.** The most valuable artifacts in this repository are the
falsified prediction, the sweep's null results, and the four findings above.

## What's next

Fix AF-2 — the reference component needs to stop saturating before any further coverage work,
because coverage bought on top of it is coverage bought on a near-constant. Earn the coverage
floor back honestly, now that the definition is right: the correction removed a way of
appearing to reach it, and none of that headroom was ever real. Promote strict auto-clears to
the headline outright and make coverage a supporting figure, finishing what AF-1 started. Run
the strong LLM baseline, which is implemented but did not run for this report: the machine had
no provider key, and the harness records an absent baseline as **absent** rather than as a row
of zeros. And build the gate nobody built: something that constrains what the experimenter is
allowed to look at before choosing what to search.
