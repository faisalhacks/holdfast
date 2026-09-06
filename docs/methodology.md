# Methodology

How the number was produced, and every reason a reader has to doubt it.

---

## The dataset

**Synthetic, adversarially generated, frozen at a named commit, with the stratification mix
disclosed.** No real company names, vendors, tax registrations or bank details appear
anywhere. The synthetic tax identifiers deliberately use state codes that cannot be issued,
so they preserve the shape a normaliser has to handle without colliding with a real
registration.

```
selection   200 invoices, 173 statement lines, 60 vendors
            root 457aeafbd8633387ca4fd102bef3582f2014ca3b02a8536e3ca737fd6a7184ef
holdout      60 invoices,  51 statement lines
            root b410dcf1ea5388b4d286bab86d3e623f92e11cdedf1c2f55a093cfff14e8e568
            seed 20260907 = selection seed + 1; never committed, digests only

frozen at commit 71d4dbaef972129b4694711cf4b314df7a14067e
generator        scripts/generate-dataset.ts  (sha256 in data/holdout.spec.json)
policy           eval/thresholds.json
                 amount_cap_paise 50000000 · date_window_days 45 · max_subset_size 40
```

### Declared and realised stratification, published side by side

| stratum | selection declared | selection realised | holdout declared | holdout realised |
|---|---|---|---|---|
| clean | 120 | 120 | 36 | 36 |
| duplicate | 20 | 20 | 6 | 6 |
| tolerance | 15 | 15 | 5 | 5 |
| cardinality | 15 | 15 | 5 | 5 |
| reference | 15 | 15 | 4 | 4 |
| period | 15 | 15 | 4 | 4 |

The holdout mix is the selection mix allocated by largest remainder over the same declared
proportions, which are recorded in `data/holdout.spec.json` and hashed into the frozen
manifest.

Both columns are published because they can disagree. A generator that reports only what it
realised can never contradict itself, and a disclosure that cannot fail is not a disclosure.
An early integration failure in this project was exactly that: a stratification file whose
shape did not match what the harness expected, silently degrading the declared column into a
copy of the realised one. It was fixed in the reader, because the dataset was already frozen.

### The generator normalises nothing

Normalised reference, normalised narration and normalised vendor name are emitted
**byte-identical** to their raw counterparts, and every extraction field on a statement row is
null with application status `unidentified`. Recovering those values is the work being
measured. Filling them would hand the matcher the answer on both sides at once.

That property was produced independently on both sides of the firewall: the winning data
generator refused to populate them, and the normalisation worker independently refused to
*read* those columns. Two workers, opposite sides of the wall, closing the same hole without
being told to.

### What makes it adversarial

Duplicates arrive with a different reference against the same vendor, amount and date. Bulk
remittances settle many invoices at once behind a narration truncated mid-list. Payments
arrive net of tax deducted at source, which looks identical to a partial settlement from a
single field. Credit notes cross a settlement. Invoice and receipt dates fall in different
periods. References are displaced into vendor fields, shattered by delimiters, folded,
abbreviated, or absent. One statement line sits in-window against four different invoices at
an identical amount.

---

## The holdout, and why it is not in the repository

The headline is reported from a set of 60 invoices generated at a seed frozen **before any
search agent existed**, written outside the repository, and never committed. Only its five
per-file digests are in git, inside the frozen manifest.

Gitignoring would not have been enough. The original plan was sparse checkout, and it was
wrong: sparse checkout controls the working tree, not the object store, and any agent could
have walked past it with `git cat-file`. Treating that as unreachable would have repeated a
mistake we had already made once in this build, when a code-ownership file turned out to
report protection it did not provide.

Not committing it is also *stronger* than committing it, because the seed and the generator
hash are frozen in advance. **Anyone can regenerate the holdout byte-identically and check
our digests.** Nobody has to trust that a dozen agents did not peek.

### The reproducibility claim is a check that runs on every pull request

This started as a cost. The submission could not pass CI at first, because a CI runner is in
exactly the position of a sweep agent by design — the holdout is not in the repository and
not a git object, so a runner produced a report with no holdout figures and the claims
auditor correctly rejected every holdout number in the prose. The right response was to
escalate it rather than quote selection figures as though they were the headline.

**It was fixed by regenerating the holdout in CI rather than checking it out.** Every pull
request now rebuilds the holdout on a clean machine from the committed generator at the
frozen seed, and the manifest gate compares the five rebuilt digests against the frozen ones:

```
manifest: holdout REPRODUCED — 5 file(s) at b410dcf1ea53,
          regenerated from seed 20260907 and byte-identical to the frozen digests
```

So "the holdout is reproducible from a frozen seed" stopped being a sentence in a manifest
and became a check that fails the build if it ever stops being true. It also means the
headline set is measured on a fresh machine every time, not only on ours. **The cost became
the evidence.**

**Read AF-3 in `docs/adverse-findings.md` before concluding that the isolation was
sufficient.** The agents were isolated. The human who chose what they searched for was not.

---

## The firewall

Only the evaluation harness may read the answer key. Build gates ban any reference to it from
the engine, the model boundary or the app, and ban any import from the generator into any of
them. The gate has been observed to fire on a real violation — one of exactly three tests in
this repository exists to make it fail on a fixture, because a firewall never observed to fail
is not evidence of a firewall.

The harness validates a **seven-field projection** of an invoice — what it needs to score —
and hands the engine the unnarrowed rows separately. The thing that judges the engine is
therefore not shaped by the engine's internals. That design cost us a real integration
failure at the assembly point, where the projection was passed to the engine and the engine
threw. The harness reported the throw honestly rather than recording a zero as a measurement.
**That was the cost we chose to pay**; the alternative is a harness shaped by the system it
grades, which is the arrangement that turns a headline number into an artifact.

---

## Floors, set before any data existed

The evaluation floors were written into a frozen file at the very start of the build, before
a single row of data existed. A floor set in advance is a promise; a floor set afterwards is
a rationalisation.

| floor | value | status on the selection set |
|---|---|---|
| coverage | 0.70 | **NOT met — 51.5%** |
| false clears (absolute count, never a rate) | 3 | met — 0 |
| match precision | 0.98 | met — 100% |
| rupees at risk | derived from the two above | met — Rs 0 |
| every held invoice emits at least one conflict | yes | met |
| per hold type recall | 0.70 | **three types NOT met** |

**Every correctness floor passes. The coverage floor does not.** The three unmet per-hold-type
floors are reported as observed on every run rather than moved: `matching` at 50.0%,
`no_reference` at 44.4%, and selection-set `cardinality_residual` at 0.0%.

### Stage-2 enforcement is real, and it fails us

Floor enforcement is two-stage by design: stage 1 records the floors so that every merge has
trend data, and stage 2 enforces them from the moment `eval/floors.live` appears. That file
exists on the branch `orchestrator/floors-live` at `f6c21e0` and is **deliberately unmerged**,
so enforcement can be demonstrated without turning `main` red. With it present:

```
regression: stage 2 — eval/floors.live present, floors ENFORCED
regression: coverage 0.515, false_clears 0, decided 103, rupees_at_risk 0 paise, rate 0.0000

regression: FAIL — 1 condition(s)

  coverage 0.515 is below the floor 0.7

Do not widen a floor to clear this. That is quarantine Q2 — the same move the
incumbent ERP calls "change the tolerance", and we refuse it for the same reason.
```

One condition fails and it is coverage. The floor was written before any data existed and
hash-locked at the Wave 2 gate. **We did not reach it, and we are not moving it.**

Two of those were investigated by the worker that owns them, which **refused to reach its own
floor and showed its working**: of the selection rows expecting a `no_reference` hold, three
are rows the matcher auto-clears *correctly* today, so recall cannot exceed two-thirds under
any rule that does not hold invoices we matched right. It probed those rows for a
deterministic signal and found none — their reference evidence is clean. Of the rows expecting
a `matching` hold, three are already carried by a sibling hold, and taking them would require
declaring a severity the evidence does not support. It measured what that would cost two other
hold families and declined.

**Widening a threshold to make a red build green is the same move as widening a tolerance to
release a hold.** It is a named quarantine trigger in this project's house rules, and it is
the behaviour the product exists to make visible. We do not get to do it to our own
evaluation.

### A ceiling we did not remove

One bulk remittance in the selection set names invoices dated far outside the frozen date
window, so every member of it is unreachable and it puts a hard ceiling on
`cardinality_residual` recall. The worker did not widen the window. It added an
out-of-window branch that raises a hold with a `date_outside_window` conflict — notice without
matching, which can never produce a false clear — recovering part of the remittance. The rest
is lost to a truncated narration listing only some of the references.

The window's own written rationale says a payment settling an invoice from six months earlier
is an exception a human should see, not a match to find. **So the ceiling is the policy
working, and the honest report is that it costs us recall.**

---

## What the report measures

`eval/report.json` is generated on every run and is never committed — a placeholder in git
would seed the claim auditor's allowlist with a fake number. It carries, for **both** the
selection and the holdout set:

- coverage, strict auto-clears, held count, human-required count;
- **false clears** as an absolute count, and **rupees at risk** in paise;
- match precision and match recall, where a correct auto-clear requires **exact set equality**
  on the settling payment set — eleven of twelve payments scores zero;
- coverage, false clears and money at risk **per stratum**;
- recall and precision **per hold type**, with auto-released and human-released counts;
- conflicts emitted, and a count of held invoices carrying no conflict (a policy bug, and it
  is zero);
- the declared-versus-realised stratification;
- every floor, observed against threshold, with met/not-met stated on both sets.

Aggregate-only reporting is what we criticise the category for. Per-stratum and per-hold-type
reporting is what stops us doing it ourselves — and it is how a reader can find, in our own
report, that duplicate recall is 100% while selection-set `cardinality_residual` recall is
0.0%.

### The baselines

- **naive exact** — raw-string equality on the extracted reference, then exact equality on the
  amount, **first candidate wins**. No normalisation, no typed holds, no conflicts, no amount
  cap. It is in the report to demonstrate what a coverage number alone cannot distinguish, and
  it does: it beats us on coverage on both sets while exposing money on both.
- **strong LLM baseline** — implemented, behind a flag, and it **did not run for this report**
  because the machine that produced the report had no provider key. The harness records an
  absent baseline as **absent**, not as a row of zeros, and says so in its own notes. A
  handicapped baseline dies under one question, so the baseline is meant to get a frontier
  model and the full candidate set. We are not going to describe a comparison we did not run.

---

## Predictions, written before the first run

Five falsifiable predictions were committed **before** the harness ran, in their own commit,
so the ordering is checkable in the git log. Each came with an explicit statement of what
would falsify it. Three have been scored:

- **Confirmed** — the naive baseline looks acceptable on aggregate coverage, and only the
  false-clear count and the rupees expose it. It does, and they do.
- **Confirmed** — coverage would not clear the floor on the first engine run, and the gap
  would close through normalisation rather than through scoring changes. It did not clear the
  floor then and it does not clear it now, and the sweep that closed part of the gap only ever
  touched normalisation.
- **Falsified** — we predicted our deterministic layer would over-match and surface false
  clears in the duplicate and cardinality strata. **It does the opposite.** It produces zero
  false clears on both sets and under-matches instead.

The falsification ships. A project that reports only its confirmed predictions is not running
an experiment.
