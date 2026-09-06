# PREDICTION

Written **before** the harness was run for the first time, and committed in its own commit
so the timestamp is checkable in `git log`. Nothing in this file may be edited after the
first run except the RESULT section at the bottom, which is append-only.

Predicting our own failure mode and then demonstrating it is worth more than a clean
number. If the predictions below turn out wrong, that gets written down too — an
unfalsifiable prediction is not a prediction.

---

## P1 — The deterministic layer will over-match, and the over-matching will show up as
## false clears, not as low coverage.

Rule-based matchers fail *confidently*. A composite score over amount, reference, date and
vendor has no way to represent "these two rows look identical and that is exactly why I am
suspicious". The strata where we expect it:

- **duplicate** — same vendor, same amount, same date, two different references. Both
  invoices score identically against the single payment that settled one of them. A scorer
  picks one. Half the time it picks the wrong one, and the reviewer never sees either.
- **cardinality** — bounded subset-sum over a 45-day window with up to 40 payments has
  many spurious solutions. Subsets that sum to the invoice total but are not the settling
  set are arithmetically perfect and semantically wrong.
- **tolerance** — a net-of-TDS payment and a partial settlement look the same from one
  field. Attributing the delta to the wrong cause clears a row that should have been held.

Concretely: we expect the false clears to concentrate in `duplicate` and `cardinality`,
and we expect per-stratum coverage on `clean` to be high enough that the aggregate number
looks respectable while those two strata carry the errors. That is the exact effect
aggregate-only reporting hides, and it is why `stratification` is in the report.

## P2 — The LLM-only baseline will fail differently, not less.

Published work (OpenSanctions Pairs, Feb 2026) finds an LLM beating a rule-based matcher
on *pairwise entity matching*. We expect that result to reproduce on the narrow slice it
was measured on — vendor-name resolution across mangled bank narration, where
`ACME SW PVT` and `Acme Software Pvt Ltd` are obviously the same firm to a reader and are
a token-set-ratio coin flip to us. We expect the LLM baseline to beat the deterministic
layer on the `reference` stratum specifically.

We expect it to fail on:

- **Arithmetic** — cardinality is a subset-sum problem. A language model reading forty
  candidate payments will produce a set that *reads* correct and does not sum to the
  invoice total. It will not check, and nothing in the loop forces it to.
- **Set equality** — our definition of a correct auto-clear is exact set equality. A
  near-miss set (eleven of twelve payments) scores zero and is counted as a false clear.
  This is the single most likely reason the LLM baseline's rupees-at-risk figure is worse
  than its accuracy impression.
- **Abstention** — it will be reluctant to answer "no match exists" when truth says so.
  A model asked to find a match tends to find one.

So: we predict the LLM baseline shows **higher coverage and worse false clears** than the
deterministic layer, and that its errors are distributed across strata rather than
concentrated. Rules over-match in a pattern; models over-match everywhere.

## P3 — The naive baseline will look better than it is on the aggregate.

Exact-match on raw reference and exact-match on amount will clear the `clean` stratum
almost entirely. If we published coverage alone it would not look catastrophic. Its
false-clear count and its rupees-at-risk are where it dies — it takes the first candidate
on an exact amount tie, which is precisely the SAP F.13 assignment-field failure. It
emits no typed holds at all, so every per-hold-type recall is 0 and
`conflicts_per_held_invoice` is 0.

This is the argument for the report shape: a single coverage number cannot separate the
naive baseline from a working system. The false-clear count and the rupees can.

## P4 — Coverage will not clear 0.70 on the first engine run.

The floor was set at Wave 0 against the industry plateau, before any data existed. We
expect the first end-to-end run to land under it, and we expect the gap to close through
normalisation rather than through scoring changes. If it closes through scoring changes,
that is evidence of tuning to the selection set and it should be treated as such.

## P5 — Selection and holdout will disagree, and the holdout will be worse.

The headline is reported from the holdout for exactly this reason. Search and tuning
happen against `data/`; the holdout is generated at a different seed and never committed.
We predict `holdout.coverage < selection.coverage`. If they agree closely, either the
generator is not adversarial enough or the two sets are not independent — both are
findings, and both get published rather than smoothed over.

---

## What would falsify each of these

| # | Falsified if |
|---|---|
| P1 | false clears distribute evenly across strata, or the deterministic layer's misses are abstentions rather than wrong clears |
| P2 | the LLM baseline's false-clear count is at or below the deterministic layer's at comparable coverage |
| P3 | the naive baseline's coverage is low enough that no reader would need the false-clear count to reject it |
| P4 | the first engine run clears 0.70 on the selection set |
| P5 | holdout coverage is at or above selection coverage |

---

## RESULT — append-only, filled in after runs

### Run 1 — harness landed, no dataset

At the time this harness was committed, `data/` did not exist: W02 had not yet landed the
generator output, and `engine/` did not exist either. `pnpm eval` runs to completion,
writes `eval/report.json` with `row_count` 0 and every figure zeroed, records
`holdout: null`, states both absences in `notes`, and exits 0.

**No prediction above is confirmed or falsified by this run.** Nothing was measured.

What *was* established, because a judge that has never been observed to judge is not
evidence of anything: the harness was run against a seven-row synthetic fixture held
outside the repository (never committed, never in `data/`) with a hand-computed answer key,
and every figure it produced matched the hand calculation — set equality on a two-payment
bulk settlement, a false clear where truth says no match exists, a false clear where a
system named a payment id that is not in the ledger, per-stratum coverage, per-hold-type
recall and precision, and the declared-versus-realised mix disagreeing when the declaration
disagrees. The deliberately poor baseline scored 57.1% coverage with 1 false clear and
Rs 3,000.00 at risk against that fixture, and the harness said so in those words.

The strong LLM baseline was exercised only on its no-credentials path in this session: no
`ANTHROPIC_API_KEY` was available, so it correctly did not run, reported itself ABSENT
rather than as a row of zeros, and the run still exited 0. Its live behaviour is unmeasured
and that is stated here rather than implied away.

The next entry in this section is written after the dataset is frozen, and it must address
each of P1-P5 by name, including the ones that turn out wrong.
