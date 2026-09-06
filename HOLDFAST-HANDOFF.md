# HOLDFAST — CHAT HANDOFF

Paste this at the start of a new conversation, with
`HOLDFAST-ORCHESTRATION-FINAL.md` attached. This session was incognito, so nothing
carries over automatically.

---

## OPENING MESSAGE FOR THE NEW CHAT

> I'm building **Holdfast** for Syndicate by Maximor, Track 2 (Autonomous Office of the
> CFO), a 30-hour hackathon run by Agent Orchestrator (AO). AO spawns coding agents in
> isolated git worktrees, one task per worker, and routes CI failures back to the worker
> that caused them.
>
> The build runs autonomously — agents write the code, I don't. The attached file is the
> complete orchestration set: house rules, orchestrator prompt, eleven worker briefs, CI
> gates and seed files.
>
> Be direct with me. Flag risks and anything dishonest or over-claimed before I say it on
> camera — I'd rather be corrected than flattered.
>
> [then say what you need]

---

## THE PROJECT IN ONE PARAGRAPH

An accounts-payable reconciliation system modelled on how the work is actually done:
typed holds that block payment, field-level evidence for a reviewer, and a captured
**routing decision** rather than a thumbs up. Built for the messy ~30% that
cash-application automation stalls on, with a published false-clear count — the
correctness number the category omits.

## THE FOUR JUDGING QUESTIONS

The organizers stated these directly:

1. Is the problem a genuine pain point for the Office of the CFO?
2. Is the human judgement side of the finance automation truly intuitive?
3. How deep and well thought through is the automation in context of the specific
   Office of the CFO workflow?
4. How well grounded is it to be genuinely used by accountants in the real world?

Plus: don't build more than you have to; spend more time planning the idea than anything
else; three minutes is not a lot of time.

**Measurement is evidence for question 4, not the thesis.** Domain depth and the review
experience are the thesis. An earlier version of this plan had that backwards and was
corrected.

## RULES (confirmed by organizers)

- Research, ideation and planning before the window: **allowed**.
- Building or writing project code before the window: **disqualifying**.
- Earlier AO research sessions may be mentioned, but they will mainly review the
  **in-window** AO sessions used to build, test, debug and improve.
- Consequence: `lib/types.ts` is built by W01 inside the window, not pasted from a draft.

## SETTLED DECISIONS — do not re-litigate

- Domain model is **typed holds**, not `auto_clear/review/escalate`.
- Reviewer action is **resolution path + owner next**, not approve/reject.
- **Tolerance changes are recorded decisions.** Strongest original claim.
- Queue ordered by **money at risk, descending**.
- Engine is a **CLI writing Postgres**. No queue, no worker deploy, no Vercel timeout.
- Money is **integer paise**, BIGINT, never float.
- **Eleven workers.** No MCP, no FX/multi-currency, no meta-system, no GST product
  (GST-flavoured noise in the generator only).
- The **firewall**: generator and matcher never share a workspace; `engine/**` may never
  import from `scripts/**`; the generator is built before `engine/` exists.
- Do **not** claim novelty for three-way match, touchless AP, or duplicate detection.

## RESEARCH FINDINGS THE BUILD DEPENDS ON

**Workflow (Oracle documentation, primary):**
- Payables applies **typed holds** — matching holds, and variance holds like Dist
  Variance, Tax Variance, Tax Amount Range. A held invoice cannot be paid. Some holds
  auto-release when the condition resolves; others are manually releasable through a
  holds resolution workflow. Each hold declares whether accounting entries may be created.
- Oracle documents three ways to correct an exception: change the invoice, change the PO,
  **or change the tolerance** — after which the hold silently auto-releases and nothing
  records that a judgement was made. This is the landmine Holdfast closes.
- Oracle AR distinguishes **applied / unapplied / on-account / unidentified** as four
  separate states.
- Oracle's AR process docs have collection staff working accounts in **descending order
  of balance** — this validates money-ordering.

**The reviewer's actual job:**
- Analysts choose a **resolution path**: re-application, customer outreach, or internal
  correction. Unresolved items go to on-account holding or route onward to collections
  and deductions teams.
- An AP analyst reviewing a held invoice reconstructs context from **five or six screens**
  before deciding **who should act**. Assembling evidence is automatable; deciding is not.
- Real KPIs: straight-through processing, unapplied cash aging, same-day posting rate,
  exception backlog, rework rate.

**The wedge:**
- The category publishes **coverage** (Hackett median auto-match 70%; Ardent touchless
  32.6% avg / 49.2% best-in-class; SAP plateaus 60–70%; vendors claim up to 95%) and
  **never correctness**.
- **BenchRec** (ICAIF 2023, Operartis, from a Tier-1 bank's production data) requires
  **99.8–99.9% match precision** and states an unmatched item is better than a wrong
  match. Best citation available.
- **Kognitos**, a competitor, concedes 92% touchless reached aggressively is worse than an
  honest 85%.
- **OpenSanctions Pairs** (Feb 2026): rule-based 91.3% F1, GPT-4o 99.0%. Rules
  **over-match**; LLMs fail differently. Pairwise matching is near a practical ceiling —
  attention should shift to **uncertainty-aware review**. That is Holdfast.
- No vendor, analyst firm, auditor or academic source publishes an **audited false-clear
  rate from production**. Claim this narrowly; the broad "no benchmark exists" version is
  **false** and would be caught.
- Duplicate-payment loss estimates span 0.05%–5% of AP spend, all self-reported by firms
  selling recovery. **The variance is the argument.** Duplicates are 30–40% of recovery
  claims and concentrate in high-value invoices — that is why the amount cap exists.

**Prepared answer to "why not use BenchRec?"** — it is bank-statement-to-GL cash matching,
not invoice-to-payment, and it does not label exception *types*, which is what a review
workflow routes on. We use its precision floor as our design principle and our own
labelled generator as the primary eval.

## OPEN ITEMS

- Discord messages drafted and ready: AO rules question (**answered — see Rules above**),
  Maximor domain question about whether tolerance changes are tracked as reviewable
  events, a follow-up on whether the hard part is matching or routing, and an optional
  build-in-public intro.
- Two research gaps, both closed as "cannot close": no verbatim Reddit practitioner voice
  (robots-blocked), and no audited error rate exists anywhere — which was the answer we
  wanted.
- Not yet written: the CI workflow YAML and the seven gate scripts. Wave 0 needs them.

## WHAT TO ASK FOR NEXT

Most likely: *"Write the CI workflow and the gate scripts for Wave 0."* That is the last
thing standing between the plan and the first spawned worker.

Others that would be reasonable: tighten the three-minute video script; write the
`PREDICTION.md` for W03; sanity-check a worker's output against the four judging
questions; or draft the Devpost writeup skeleton.
