# NORMALISATION SWEEP — all twelve agents, including the losers

Twelve agents, one assigned strategy direction each, isolated worktrees, **writable
`engine/normalise/**` and nothing else**. Every eval re-run by the orchestrator; no agent
scored itself into a merge.

Baseline at spawn: **coverage 70.5%, 141/200 decided, 0 false clears, Rs 0 at risk,
precision 100%** on the selection set.

## Selection rule, applied verbatim

1. **Filter**: any `false_clears` above 0, or any `rupees_at_risk` above 0 → **discarded**,
   not ranked lower.
2. Rank survivors by `selection.coverage`, descending.
3. Tie-break on lower `rupees_at_risk`.

**Every one of the eight completed agents passed the filter** — 0 false clears and Rs 0 at
risk throughout. Not one traded correctness for coverage, and not one had to be discarded
for touching a path outside `engine/normalise/**`. The Q2 guardrail — discard unevaluated
anything that edits the evaluator, the thresholds or the data — **fired zero times.**

## Results

| agent | strategy | coverage | decided | false clears | at risk | outcome |
|---|---|---|---|---|---|---|
| **sweep-05** | **delimiter normalisation** | **74.0%** | **148/200** | 0 | Rs 0 | **MERGED** |
| sweep-09 | reference-confidence signalling | 73.5% | 147/200 | 0 | Rs 0 | recorded |
| sweep-12 | composite (delimiters + tokens + folding) | 72.5% | 145/200 | 0 | Rs 0 | recorded |
| sweep-03 | reference token-set construction | 72.0% | 144/200 | 0 | Rs 0 | recorded |
| sweep-06 | invoice-number convention drift | 71.0% | 142/200 | 0 | Rs 0 | recorded |
| sweep-10 | GSTIN-style identifier folding | 71.0% | 142/200 | 0 | Rs 0 | recorded |
| sweep-01 | legal-suffix depth and ordering | 70.5% | 141/200 | 0 | Rs 0 | null result |
| sweep-02 | alias table from vendor co-occurrence | 70.5% | 141/200 | 0 | Rs 0 | null result |
| sweep-04 | field-displacement recovery | — | — | — | — | lost to API outage |
| sweep-07 | truncation-aware prefix matching | — | — | — | — | lost to API outage |
| sweep-08 | numeric extraction from narration | — | — | — | — | lost to API outage |
| sweep-11 | canonicalisation ordering effects | — | — | — | — | lost to API outage |

## The finding five agents reached independently

**`punctuation_strip` shatters a document number before candidates are extracted.**
`RCT-2026-01-472` reaches the scorer as the bare token `2026` — and because `token_set_ratio`
returns 1.0 for a subset, a fiscal year agrees **perfectly** with every invoice minted that
year. One bank line carrying `2026` was the top-ranked candidate for a dozen unrelated
invoices.

sweep-03, sweep-05, sweep-06, sweep-09 and sweep-12 each found this from a different
starting direction, without being able to see each other's work. **The convergence is the
result.** Five independent confirmations of one defect is worth more than one agent's
assertion, and it is the strongest argument for running a wide search rather than a deep one.

## The null results, which are also results

- **sweep-01 (legal suffixes)** ran 42 table variants including an empty table, and four step
  orders, and got **byte-identical decisions on all 200 invoices**. Leave-one-out over all 41
  existing entries showed every entry earns its place; removing `p` — the entry the code
  itself nominates as the first to try — costs similarity and buys nothing. It changed
  nothing and documented why.
- **sweep-02 (alias table)** resolved 143 of 162 distinct vendor residues and moved four
  invoices into correct auto-clears — and coverage did not move, because the holds it
  dissolved were handed straight back by the cardinality family admitting more same-vendor
  lines.

Both agents reported "this axis cannot move the metric" rather than manufacturing a change.

## What the sweep exposed about the metric itself

sweep-01's null result and critic C1's finding are the same discovery from opposite
directions: **coverage is largely insensitive to normalisation quality**, because a pairing
lost becomes a `matching` hold and one gained comes out of a `no_reference` hold — and both
are `auto_releasable`, so both already count as decided.

The agents that did move coverage moved it by dissolving **human-required** holds
(`price_variance`, `cardinality_residual`) into auto-releasing ones. That is a real
improvement in routing, and it is not the same thing as matching more invoices correctly.
Strict auto-clears barely moved: 96 → 93 on selection.

**This is why the submission reports the strict auto-clear count alongside coverage.**

## Refusals worth recording

- **sweep-12** measured that disabling its year guard scores **73.5%** — higher — and
  declined it: *"Coverage rising because the match got worse; not taken."*
- **sweep-06** found the baseline was *profiting* from the over-merge, and fixed it anyway
  at a temporary cost of three correct auto-clears.
- **sweep-10** found 25 rows carrying masked account numbers read as references, fixed it,
  observed it changed no decision, and **reverted it rather than pad the diff**.
