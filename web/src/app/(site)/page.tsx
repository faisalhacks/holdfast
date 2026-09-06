import Link from "next/link";
import type { Metadata } from "next";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/site/Reveal";
import { WorkstationPreview } from "@/components/site/WorkstationPreview";

export const metadata: Metadata = {
  title: "Holdfast — Automation should stop before it guesses",
  description:
    "Accounts-payable exception review: typed payment holds, field-level evidence, and a recorded human routing decision for the reconciliation cases automation cannot safely resolve.",
};

const SHELL = "mx-auto w-full max-w-[84rem] px-5 sm:px-8";

const PRIMARY =
  "inline-flex h-11 items-center rounded-sm bg-graphite px-5 text-[0.9375rem] font-medium text-paper " +
  "transition-colors hover:bg-steel-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel";

const SECONDARY =
  "inline-flex h-11 items-center rounded-sm border border-rule-strong px-5 text-[0.9375rem] text-graphite " +
  "transition-colors hover:border-graphite-3 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel";

const STEPS = [
  { n: "01", title: "Reconcile", body: "Invoices are matched against payments and purchase orders." },
  { n: "02", title: "Apply typed hold", body: "Where a condition is breached, a typed hold blocks payment." },
  { n: "03", title: "Assemble evidence", body: "Every compared field is captured with its reference value." },
  { n: "04", title: "Route next action", body: "A reviewer chooses the resolution path and the next owner." },
  { n: "05", title: "Record control changes", body: "A tolerance change is written down like any other decision." },
  { n: "06", title: "Preserve the trail", body: "Each action lands on an append-only timeline for the case." },
];

const DIFFERENCES = [
  {
    n: "01",
    title: "Typed holds",
    lede: "A held invoice cannot progress as though nothing happened.",
    body: "Holds are typed, not a boolean flag, and they carry the amount they are blocking. Releasing one takes a named reviewer and a stated reason, and the release is recorded.",
  },
  {
    n: "02",
    title: "Field-level evidence",
    lede: "Observed values, reference values, and the delta between them.",
    body: "The reviewer reads the comparison the engine actually made — what the record said, what it was checked against, and by how much it differs. There is no narrative summary to agree with.",
  },
  {
    n: "03",
    title: "Recorded control changes",
    lede: "A tolerance change is a decision, not a setting.",
    body: "Widening a threshold records what it was, what it became, the scope it applied to, who changed it, why, and which holds the change affected.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className={`${SHELL} pt-10 pb-16 sm:pt-16 lg:pt-20 lg:pb-24`}>
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:gap-14">
          <Reveal>
            <p className="label-eyebrow">Accounts payable · Exception review</p>

            <h1 className="display mt-5 text-[2.5rem] font-semibold sm:text-[3rem] lg:text-[3.25rem]">
              Automation should stop before it guesses.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-graphite-2">
              Holdfast handles the reconciliation exceptions automation cannot safely resolve. It
              applies typed payment holds, assembles field-level evidence, and asks a human for the
              one thing a model should not decide:{" "}
              <span className="text-graphite">who acts next.</span>
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/exceptions" className={PRIMARY}>
                Open the workstation
              </Link>
              <a href="#how" className={SECONDARY}>
                See how Holdfast works
              </a>
            </div>

            <p className="mt-6 text-sm text-graphite-3">
              No approve/reject. No confidence score. No model prose.
            </p>
          </Reveal>

          <Reveal delay={90}>
            <WorkstationPreview />
            <p className="mt-3 text-xs text-graphite-3">
              The workstation, running the demo dataset: intake queue, diagnostic ledger, action
              console.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── The problem ───────────────────────────────────────────────────── */}
      <section id="product" className="scroll-mt-24 border-t border-rule bg-paper-2/60 py-20 lg:py-28">
        <div className={SHELL}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <Reveal>
              <p className="label-eyebrow">The problem</p>
              <h2 className="display mt-5 text-[1.875rem] font-semibold sm:text-[2.375rem]">
                Reconciliation tools compete on how much they clear.
                <span className="text-graphite-3">
                  {" "}
                  The harder question is what happens when they are wrong.
                </span>
              </h2>
            </Reveal>

            <Reveal delay={80}>
              <dl className="divide-y divide-rule border-t border-rule">
                {[
                  {
                    term: "A wrong match is worse than an unmatched transaction.",
                    def: "An unmatched item stays visible and gets worked. A wrong one settles quietly and is found much later, if at all.",
                  },
                  {
                    term: "Reviewers should inspect evidence, not model prose.",
                    def: "Fluent explanation invites agreement. A field, its reference, and the delta between them invite a decision.",
                  },
                  {
                    term: "Exceptions need routing, not approve/reject.",
                    def: "A binary control forces the real work into spreadsheets and email, outside the record entirely.",
                  },
                ].map((item) => (
                  <div key={item.term} className="py-5">
                    <dt className="text-[1.0625rem] font-medium text-graphite">{item.term}</dt>
                    <dd className="mt-2 text-[0.9375rem] leading-relaxed text-graphite-2">
                      {item.def}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-24 border-t border-rule py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">How it works</p>
            <h2 className="display mt-5 max-w-2xl text-[1.875rem] font-semibold sm:text-[2.375rem]">
              One exception, from reconciliation to a recorded decision.
            </h2>
          </Reveal>

          <ol className="mt-12 grid gap-px border-t border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.n} delay={index * 50} className="bg-paper p-6 lg:p-7">
                <span className="num font-mono text-xs text-steel">{step.n}</span>
                <h3 className="mt-3 text-[1.0625rem] font-medium text-graphite">{step.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-graphite-2">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The workstation ───────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-graphite py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow text-paper-3/60">The workstation</p>
            <h2 className="display mt-5 max-w-3xl text-[1.875rem] font-semibold text-paper sm:text-[2.375rem]">
              Three panes, and no screen the reviewer has to leave.
            </h2>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-paper-3/70">
              An analyst reviewing a held invoice normally rebuilds context from five or six
              screens. Holdfast puts the queue, the evidence, and the decision in one place.
            </p>
          </Reveal>

          <Reveal delay={80} className="mt-12">
            {/*
              The console pane only enters the frame at `lg`. Below that its
              label would point at something the reader cannot see, so the
              annotation leaves with the pane it describes.
            */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { pane: "Intake", note: "Money-at-risk queue", from: null },
                { pane: "Diagnostic ledger", note: "Field-level evidence", from: null },
                { pane: "Action console", note: "Human routing decision", from: "lg" },
              ].map((item) => (
                <div
                  key={item.pane}
                  className={cn(
                    "border-t border-paper-3/25 pt-3",
                    item.from === "lg" && "hidden lg:block",
                  )}
                >
                  <p className="label-eyebrow text-paper-3/55">{item.pane}</p>
                  <p className="mt-1.5 text-[0.9375rem] text-paper-3/85">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <WorkstationPreview variant="full" className="border-paper-3/15" />
            </div>

            <div className="mt-8">
              <Link
                href="/exceptions"
                className="inline-flex h-11 items-center rounded-sm bg-paper px-5 text-[0.9375rem] font-medium text-graphite transition-colors hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
              >
                Open this workstation →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── The difference ────────────────────────────────────────────────── */}
      <section id="why" className="scroll-mt-24 border-t border-rule py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">Why Holdfast</p>
          </Reveal>

          <div className="mt-10 border-t border-rule">
            {DIFFERENCES.map((item, index) => (
              <Reveal
                key={item.n}
                delay={index * 60}
                className="grid gap-4 border-b border-rule py-9 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-10 lg:py-12"
              >
                <div className="flex items-baseline gap-3 md:block">
                  <span className="num font-mono text-xs text-steel">{item.n}</span>
                  <h3 className="text-[0.9375rem] font-semibold tracking-wide text-graphite uppercase md:mt-3 md:text-sm">
                    {item.title}
                  </h3>
                </div>
                <p className="display text-[1.375rem] font-medium text-graphite lg:text-[1.625rem]">
                  {item.lede}
                </p>
                <p className="text-[0.9375rem] leading-relaxed text-graphite-2">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Control philosophy ────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-steel-wash py-20 lg:py-32">
        <div className={SHELL}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <Reveal>
              <p className="label-eyebrow">Control philosophy</p>
              <p className="display mt-6 text-[2rem] font-semibold sm:text-[2.75rem]">
                The model may propose.
                <br />
                <span className="text-steel-deep">Deterministic code verifies.</span>
              </p>
            </Reveal>

            <Reveal delay={80} className="lg:pt-16">
              <p className="text-[1.0625rem] leading-relaxed text-graphite-2">
                A generated suggestion is a nomination, not a verdict. It is scored by the same
                deterministic rules as every other candidate, and it is discarded if it does not
                clear on its own merits. No generated output can release a hold or clear a
                transaction by itself.
              </p>
              <p className="mt-6 border-l-2 border-steel pl-5 text-[1.0625rem] leading-relaxed text-graphite">
                Automation can assemble the evidence.
                <br />
                Accountability stays explicit.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="border-t border-rule py-20 lg:py-28">
        <div className={SHELL}>
          <Reveal className="max-w-3xl">
            <h2 className="display text-[2rem] font-semibold sm:text-[2.75rem]">
              Review the exceptions automation shouldn&rsquo;t guess on.
            </h2>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/exceptions" className={PRIMARY}>
                Open workstation
              </Link>
              <Link href="/overview" className={SECONDARY}>
                View run overview
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
