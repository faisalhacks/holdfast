# Adverse findings

Four findings that damage this submission. They are published because we commissioned
critics to find things and publishing what they found is the entire point of having run
them. None of them is paired with a mitigating clause in the same breath.

Three came from critic sessions. One came from our own normalisation sweep reading its own
metric honestly. One is a methodological error by the human running the project.

**One of the four has since been acted on rather than only disclosed.** A critic showed that
our headline coverage metric was counting invoices nobody had settled; we corrected the
definition and the number fell eighteen points. The correction is at the front of
`README.md`, and AF-1 below records only what remains true afterwards.

---

## AF-1 — Coverage still is not a settlement count, and `Rs 0` is partly structural

**The largest part of this finding has been fixed, and the fix is at the front of
`README.md` rather than here.** Critic C1 found that two hold types — `matching` and
`no_reference` — were declared `auto_releasable: true` when their conditions can never
resolve inside a run whose payment set is closed and already presented. The metric was
counting every invoice where we found nothing as "decided without a human". We changed the
definition, **holdout coverage fell eighteen points to 45.0%**, and the correctness figures
did not move at all. That story belongs at the front, because it is our own thesis
demonstrated on us.

What is recorded here is the part that is still true after the fix.

### Coverage is still not a settlement count

`coverage = decided / invoices_total`, where **decided** means an outcome was reached without
a named human having to act. That set still has two members:

- **strict auto-clears** — the engine named the settling payment set and it was right;
- **auto-released holds** — now only `period_deferral`, whose condition genuinely does
  resolve on its own: the period rolls over.

On the holdout set:

> **27 decided = 24 strict auto-clears + 3 auto-released `period_deferral` holds.**

On the selection set: **103 decided = 93 strict auto-clears + 10 auto-released holds.**

The gap is small now. It is not zero, and a `period_deferral` hold is still not a settled
invoice. **The strict figure on the holdout is 24 of 60.** It appears beside coverage in the
headline table in `README.md`, in `DEVPOST.md`, and in `eval/report.json` as
`auto_cleared_count`. It is the number to quote if you only quote one.

### How the sweep saw the same defect from the other side

Twelve agents searched normalisation strategies against the selection set. The best of them
moved coverage by a little. **Strict auto-clears barely moved at all across the whole sweep.**

That was the same defect, arriving as a symptom: under the old definition a pairing lost
became an auto-releasing `matching` hold and a pairing gained came out of an auto-releasing
`no_reference` hold, so **both already counted as decided** and coverage was largely
insensitive to matching quality. Two independent routes to one conclusion — a sweep's null
results and a critic's argument — and it is the reason the correction was believed
immediately when it came.

### `Rs 0 at risk` is partly structural

A false clear is only computed for an **auto-clear**. A hold always emits an empty payment
set. **A hold therefore cannot be a false clear by construction.**

Our zero is a real result — every invoice the engine settled, it settled correctly, and match
precision is 100% on both sets — but it is a zero over **24 decisions** on the holdout, not
over 60. A system that held everything would also report zero, and would report it for the
same mechanical reason. The figure that constrains that reading is the strict auto-clear
count, which is why it is in the headline table.

### What we would still change

Promote **strict auto-clears** to the headline outright and make coverage a supporting
figure. We have not done it in this submission: the definition has already been corrected
once under a critic's argument, and swapping the headline metric again after seeing where the
numbers landed is a different kind of move. It is stated here rather than applied.

---

## AF-2 — The reference component returns its maximum for factually wrong pairings

Reference similarity is the heaviest of the four scoring components. It is supposed to be the
signal that a bank line names a particular document.

**It is not behaving as one.** Over a thousand factually wrong invoice-payment pairings clear
the reference component's floor on **reference evidence alone**. In the critic's words:

> *only the amount stops them.*

The composite survives because the amount component disagrees with all of them. That means
the amount component is carrying far more of the decision than the declared weight table
implies, and the reference component is closer to a near-constant than to a discriminator
over the region that matters.

Two consequences we are not going to talk around:

1. **The weights do not describe the system's actual behaviour.** A reader looking at the
   weight table would conclude that reference evidence is doing most of the work. On wrong
   pairings, it is doing almost none.
2. **This is one honest change away from producing false clears.** Any normalisation
   improvement that tightens amount agreement — a partial settlement recognised, a TDS
   deduction attributed — removes the only component currently rejecting those pairings.
   Our zero false clears are, in part, being protected by a signal that has nothing to do
   with whether the payment names the invoice.

It is not fixed. It is the first thing we would fix.

---

## AF-3 — The orchestrator aimed the normalisation sweep using holdout truth labels

### What happened

Before spawning the twelve sweep agents, the human running this project ran a probe against
**holdout truth labels** to decide whether a search was worth the spend, published the
per-label breakdown in the orchestration log, and then wrote that the sweep was "aimed, not
speculative."

The critic's verdict, quoted exactly:

> **"The twelve agents are clean; the experimenter is not."**

It is correct. Holdout truth determined **that** a sweep ran and **what it targeted**. The
largest bucket in that probe was larger on the holdout than on the selection set, so the aim
was partly holdout-specific structure.

### Every mechanical protection worked. The one that failed had no gate

- Each agent ran in an isolated worktree with a single writable directory and nothing else.
- The holdout is not in the repository and is not a git object, so no agent could read the
  rows — a protection that survives `git cat-file`, which sparse checkout would not have.
- Every agent's report shows the holdout as absent.
- The two datasets are disjoint on invoice ids, vendor ids and vendor names.
- The holdout seed was frozen hours before the sweep was spawned.
- No agent's self-reported number was ever entered into selection; the orchestrator re-ran
  every evaluation itself.

**The protection that failed is the one nobody built a gate for: the person choosing what to
search.**

### Two further leakage paths, both real

- **The holdout score is in every sweep worktree's git log.** A merge commit subject on the
  shared ancestor states the coverage figures for both sets. "No agent is told where the
  holdout lives" was true of the rows and false of the score.
- **Holdout structure is reachable in the object store.** Blobs of a report file that was
  tracked and then untracked remain readable and carry holdout expected counts at per-hold-
  type granularity — finer than the committed stratification specification. That is exactly
  the object-store threat model the holdout specification was written to describe, arriving
  through the report rather than through the dataset.

Neither path was demonstrably used, and the isolation that did hold was **incidental to path
layout**: one environment variable removes it.

### The consequence, stated plainly

**The holdout number is not a number produced by a search that never saw the holdout. It is a
number produced by a search a human aimed using it.** That is a weaker claim than the one we
set out to make. It is the true one.

---

## AF-4 — Four of five novelty claims are prior art

A critic ran roughly a dozen searches against the claims this project had been making. Four
of five did not survive.

| claim | prior art |
|---|---|
| **Typed holds** with auto-release and an accounting block | **Oracle Payables** ships this: hold codes, an accounting-hold reason that prevents Payables creating entries, and a postable flag. **SAP** has blocking reasons with automatic release. **We port a data model; we did not invent one.** |
| **Ordering exceptions by money at risk** | **Trintech** — risk-based reconciliation rates accounts by materiality and alerts on rating change. |
| **Resolution path plus owner-next** | **Stampli**: *"give every exception three things: a category, an owner, and a clock."* |
| **Three-way match, touchless AP, duplicate detection** | Table stakes. Submitted to hackathons repeatedly. |

We had always said the hold model mirrors Oracle. The correction is to never phrase it in a
way that implies otherwise, anywhere.

### Three sentences we retract, because they are false

- **"Nobody publishes how often they got it wrong."** Medius publishes a First Time Right
  rate. Vic.ai publishes accuracy figures over hundreds of millions of invoices. Billtrust
  argues publicly that match rate is a gameable metric.
- **"No audited error rate exists."** CMS's CERT programme re-reviews tens of thousands of
  production claims a year and publishes a statistically valid improper-payment rate. AP
  recovery audit publishes wrongly-paid spend as a fraction of total spend.
- **"Nothing records that a judgement was made when a tolerance changes."** SAP logs the
  configuration change through change documents.

### The two claims that survived

1. **No cash-application vendor publishes a false-clear rate for its own auto-matched
   items.** Accuracy is published. The rate at which the automation confidently settled the
   wrong document is not.
2. **A tolerance change recorded as a decision on the specific hold it released** — the
   narrow form only. The incumbent records the *configuration* change. What is recorded here
   is the change bound to the individual hold whose release it caused: reviewer, reason,
   derived direction, affected holds, and a reconciliation that names any hold released
   **without** governance.

Those two are the only claims this submission makes. Everything else it does, it does because
it is correct, not because it is new.
