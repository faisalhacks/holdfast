# How we built it — parallel agents, and CI as the referee

**Parallel Claude Code agents in isolated git worktrees, one ownership glob each, CI as the
referee, and no agent ever scoring itself into a merge.**

The record is the pull request history rather than the branch list: every change arrived
through a pull request with the five checks attached, thirty-eight of them by the time this
was written, each naming its branch, the ownership glob it was scored against, and its gate
results.

Sessions are reported **by category**. Never summed into a headline, because the number of
agents run is a spend, not a result. The full narrative, including everything that went
wrong, is in `logs/orchestrator_log.md`.

| category | count | outcome |
|---|---|---|
| merged worker sessions | thirteen | one branch each, disjoint ownership globs |
| race sessions discarded | 7 | redundant spawns on the three hardest briefs; losers' work never cherry-picked |
| normalisation sweep sessions | 12 | 8 completed (4 lost to an API outage), **1 merged**, 7 recorded and discarded |
| critic sessions | 4 | no merges of their own — all four found something, and one changed the headline metric |

**Work before the submission window was research and planning only. All building happened
in-window.**

---

## What made parallelism safe

### Ownership is mechanical, not advisory

Every branch name maps to a set of path globs in a frozen file. CI fails any pull request
touching a path outside them **even if the change is correct**. A frozen list — the contract
types, the evaluation thresholds, the dataset manifest, the hold registry, the assembly point,
the citation list, the gate scripts, the house rules — is denied to every worker branch
without exception, and the **frozen check runs before the scope check**, so a frozen path is
refused even when it sits inside the requesting worker's own glob.

That precedence is not decorative. The dataset manifest sits inside the data generator's own
glob and is denied to it, because the evaluation gate keys on that file and it must not live
inside the glob of the one worker with a motive to regenerate the dataset.

We proved that code ownership alone does **not** enforce this, rather than assuming it: a
probe branch edited a frozen, code-owned file, passed every check, and merged. The real
enforcement is the required status check, which is identity-independent, keyed on branch
name, and was observed to fire. The submission does not claim otherwise.

### Frozen entry points, authored before the workers who use them

The hold registry and the assembly point were written before any hold worker spawned and
frozen immediately. Without a pre-existing entry point, three parallel hold workers each
invent one, all three edit the same file, and the parallelism bought by splitting the brief
is spent resolving the collision. Neither file is owned by any worker: each worker was scored
on its own glob and none of them could see the whole, so wiring them together is a decision
about the **system** and belongs to whoever is accountable for the system's number.

### Every agent gets its own worktree, database, port and container

Worktrees isolate code but share ports, databases and host paths. Concurrent evaluation runs
against one database interleave writes and produce reports reflecting somebody else's work —
failing quietly, with numbers that are simply wrong. Every brief carries a unique container
name, port and database name. This was verified before the sweep by running two agents with
deliberately different normalisation and confirming their reports differed as predicted.

An early supervision failure is recorded rather than smoothed over: one racer was spawned into
the shared working directory instead of a worktree, and the orchestrator then switched branches
underneath it. Its state became unreliable through no fault of its own and its work was
discarded. **Not a race loss — a supervision failure**, and the lesson generalises: worktrees
are needed to isolate *branch state*, not only *reads*.

---

## Racing

Three agents on one brief, isolated worktrees off the same base, on the three hardest briefs
only. First to all-green opens the pull request; the others are killed. **The winner is taken
whole — nothing is ever cherry-picked across racers.**

Held at three because pass@k on hard coding tasks flattens around there, and because racing
only reaches that ceiling **if the referee is reliable.** Agents choosing their own winner
underperforms the bound. **Our referee is the green checks. No racer ever selects itself.**

The losses were not waste, and the log describes them because a race is only honest if the
losses are described:

- One losing schema racer and the winner **independently** identified the same missing table
  and gave the same derivation from the contract. Convergence like that is a signal the
  contract is well specified.
- One racer found, **empirically**, that a superuser bypasses the database grant that was
  supposed to make our audit journal immutable. The gate had reported the claim held while the
  claim did not hold. It was fixed with a second, different mechanism — a trigger, which
  superusers do not bypass — rather than a stronger version of the first. That finding was
  worth more than the schema it came with.
- One data racer flagged a house-rule violation in a **rival's** output, and found a fairness
  bug in its own first draft where two duplicates arrived before their originals, inverting
  the only evidence a reviewer would have had.

---

## The normalisation sweep

Twelve agents, one assigned strategy direction each, isolated worktrees, **a single writable
directory and nothing else**.

**No sweep agent opened a pull request and no sweep agent scored itself.** They pushed a branch
and reported; the orchestrator re-ran every evaluation. The evaluation harness sits inside a
worker's ownership glob, so an agent could otherwise have edited its own evaluator and
self-reported a fabricated score — the reliable-referee principle applied to the one place it
would have been easiest to skip. Any diff touching the evaluator, the matcher, the hold
families, the shared library or the data was to be **discarded unevaluated** — not scored and
then rejected. That guardrail fired zero times.

The selection rule was given to every agent verbatim and applied in order:

1. Any false clear above zero, or any rupee at risk above zero → **discarded, not ranked
   lower.**
2. Survivors ranked by coverage, descending.
3. Ties break on lower money at risk.

*"Higher coverage bought with a single false clear loses to lower coverage with none"* — the
product's thesis, applied to its own methodology. **All eight agents that completed passed the
filter.** Not one traded correctness for coverage.

### What the sweep actually produced

- **Five agents independently found the same defect**, from five different starting directions,
  unable to see each other's work: punctuation stripping was shattering a document number
  before candidates were extracted, so a bare fiscal year reached the scorer and agreed
  perfectly with every invoice minted that year. One bank line carrying a year was the
  top-ranked candidate for a dozen unrelated invoices. **Five independent confirmations of one
  defect is worth more than one agent's assertion**, and it is the strongest argument for
  running a wide search rather than a deep one.
- **Two agents returned null results and said so.** One ran dozens of table variants and
  several step orderings and produced byte-identical decisions on all 200 invoices, then
  demonstrated by leave-one-out that every existing entry earns its place. One resolved most of
  the distinct vendor residues and moved four invoices into correct auto-clears — and coverage
  did not move, because the holds it dissolved were handed straight back by another hold
  family. Both reported "this axis cannot move the metric" rather than manufacturing a change.
- **Three agents refused an easy win.** One measured that
  disabling a guard scored *higher* and refused it: *"coverage rising because the match got
  worse; not taken."* One found the baseline was profiting from an over-merge and fixed it
  anyway at a temporary cost. One found and fixed a real defect, observed that it changed no
  decision, and **reverted it rather than pad the diff.**
- **The sweep also broke our own metric.** Its null results and a critic's argument turned out
  to be the same discovery from opposite directions: coverage was largely insensitive to
  matching quality, because under the definition we were using at the time, a pairing lost
  became an auto-releasing hold and a pairing gained came out of one — so both already counted
  as decided. The critic's argument is what identified the cause. **We corrected the
  definition, and the headline fell eighteen points.** Two independent routes to one
  conclusion is why it was believed immediately rather than argued with.

Four sweep sessions were lost to an API outage mid-flight and are reported as lost. An earlier
outage took out two racers simultaneously; the critical path survived only because the brief
had been written to land types and schema in separate pushes.

---

## The gates, and the nine failures routed back through them

Five required status checks — typecheck, migrations, evaluation, ownership, forbidden patterns
— plus a claim auditor and a regression check under `pnpm verify`. **Three attempts on a
failing check, then the branch is quarantined**, because a quarantine note is better submission
material than a fourth flailing diff.

Nine CI failures were routed back and fixed. They are numbered in the log:

1. Shell heredocs mangling escaping in every regex-bearing gate script.
2. **A gate that silently stopped running.** A direct-invocation guard split a path on forward
   slashes only, so on Windows it never matched and the forbidden-pattern gate reported success
   while doing nothing. **This is the exact failure mode the gate exists to prevent, found
   inside the gate**, and it is why the gate self-tests were written next.
3. Decorative-rule risk: positive **and** negative fixtures added for every forbidden rule —
   each must fire on a real violation and stay silent on the benign line a worker would
   plausibly write beside it.
4. The forbidden gate scanning agent worktrees and reporting each worktree's own copy of the
   house rules as violations. A gate that fires on its own reflection is a gate about to be
   disabled by the next person who trips it.
5. The gate tripping its own house rules — the house-rules file contains the prohibited strings
   in the sentences prohibiting them. Fixed with an **exact-line allowlist** rather than a file
   exemption, because exempting a file exempts everything a worker later writes into it, and
   because the submission *should* be able to disclaim an overclaim without being punished for
   it.
6. Sparse checkout failing to hide the holdout from the object store — replaced by never
   committing it.
7. **No race branch could pass the ownership gate**; the matcher required an exact declared
   branch name, so the race was unwinnable by construction. Both racers reported it, correctly
   refused to edit the frozen ownership file, and verified their diffs through the tool's own
   override instead — the behaviour the house rules ask for. The gate worked even while it was
   wrong.
8. A stratification file present but unreadable — filenames matched, content shape did not — so
   the declared-versus-realised disclosure silently degraded to something that could never
   disagree. Fixed in the reader, because the dataset was already frozen.
9. The generated report being committed by an over-broad `git add`, putting a placeholder
   number into the claim auditor's allowlist and forcing every agent running the harness to
   dirty a file outside its glob.

**And one more, worth its own line: `pnpm verify` failed the orchestrator's own assembly code**
on a numeric cast of a monetary field — the rule the orchestrator had written. The gates were
built to catch workers optimising for green. The first thing they caught at the assembly point
was the person who built them.

---

## Two tables found drifting from a frozen single source

Both were written by a worker that started before the owner of that data existed, and **both
were flagged by the worker itself** rather than discovered later.

- A hold-policy table in the API had drifted from the frozen registry on four of eleven hold
  types. The visible consequence: the queue reported that a hold permitted accounting entries
  while the engine's policy said it blocked them. **A detail screen whose "what this blocks"
  line disagrees with the engine is a screen that lies to a reviewer.**
- A tolerance-governance table in the API over-claimed on four rows, naming hold types a
  tolerance change could not actually release. That matters because the preview shown before a
  release tells a reviewer which holds are about to lift. Naming holds it cannot release is the
  same class of error as releasing one silently: a promise about a judgement, made wrongly, on
  the screen built to record judgements correctly.

Both now derive from the single frozen source. **The pattern generalises: parallel construction
produces duplicate sources of truth, and the fix is not more review — it is making the second
copy import the first.**

---

## What we would tell someone running this again

- **Test the claim, not the mechanism.** Three times in one run, a mechanism reported that a
  claim held while the claim did not hold: a code-ownership file that did not block, a database
  grant a superuser walked through, and a pattern gate that never executed. All three were
  found by attacking the claim directly.
- **A reliable referee is what makes parallelism worth anything.** Racing and sweeping both
  depend on it, and the moment an agent scores itself the whole structure is decorative.
- **Isolate branch state, not just reads.** A worktree per agent, always, including for the
  orchestrator's own work.
- **Publish session categories, never a sum.** Seven discarded races and seven discarded sweeps
  are part of the method, not an embarrassment — and a single headline number would hide which
  ones were losses and which were deliberate redundancy.
- **Build a gate for the experimenter.** Every gate in this project constrains the agents. AF-3
  is what happened because none of them constrained the human choosing what to search.
