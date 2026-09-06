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

## Floors, set before any data existed
Written into eval/thresholds.json at Wave 0 and frozen. A floor set in advance is a
promise; a floor set afterwards is a rationalisation.

  coverage            >= 0.70          the plateau we position against
  false_clears        <= 3             absolute count, never a rate
  match_precision     >= 0.98          BenchRec demands 0.998-0.999; we state the gap
  rupees_at_risk      <= Rs 15,00,000  derived: 3 x the Rs 5,00,000 amount cap
  per-type recall     >= 0.70          per hold type, never aggregate-only
  conflicts per hold  >= 1             a hold with no conflict is a policy bug

## Adverse findings
Whatever the number is at the end, it ships. Q4' catches the silent regression, not the
unflattering result. If C1 proves the generator and matcher share an assumption, that goes
in the submission.
