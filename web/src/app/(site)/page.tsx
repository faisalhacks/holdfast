import Link from "next/link";
import type { Metadata } from "next";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/Button";
import { Token } from "@/components/ui/Token";
import { Reveal } from "@/components/site/Reveal";
import { WorkstationPreview } from "@/components/site/WorkstationPreview";

export const metadata: Metadata = {
  title: "Holdfast — Automation should stop before it guesses",
  description:
    "Accounts-payable exception review: typed payment holds, field-level evidence, and a recorded human routing decision for the reconciliation cases automation cannot safely resolve.",
};

const SHELL = "mx-auto w-full max-w-[84rem] px-4 sm:px-6";

/* Sections alternate surface. The spacing system never changes. */
const LIGHT = "border-t border-rule bg-paper py-14 lg:py-20";
const DARK = "border-t border-line-strong bg-canvas py-14 text-ink lg:py-20";

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
      {/*
        The hero runs on the workstation's own canvas and gives the product the
        larger half. The first thing a reader sees is the interface, already on
        the surface they will be looking at a click later.
      */}
      <section className="bg-canvas pt-10 pb-12 text-ink lg:pt-14 lg:pb-16">
        <div className={SHELL}>
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:gap-10">
            <Reveal>
              <p className="label-section label-on-dark">Accounts payable · Exception review</p>

              <h1 className="display mt-4 text-[2.25rem] font-semibold text-ink sm:text-[2.75rem] lg:text-[3rem]">
                Automation should stop before it guesses.
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
                Holdfast handles the reconciliation exceptions automation cannot safely resolve. It
                applies typed payment holds, assembles field-level evidence, and asks a human for
                the one thing a model should not decide:{" "}
                <span className="text-ink">who acts next.</span>
              </p>

              {/* The product's own state vocabulary, in the product's own chips. */}
              <ul className="mt-5 flex flex-wrap items-center gap-1.5">
                <li>
                  <Token tone="blocking">Payment held</Token>
                </li>
                <li>
                  <Token tone="neutral">Field evidence</Token>
                </li>
                <li>
                  <Token tone="cleared">Routed to an owner</Token>
                </li>
              </ul>

              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <Link href="/exceptions" className={buttonClass("primary", "lg")}>
                  Open the workstation
                </Link>
                <a href="#how" className={buttonClass("outline", "lg")}>
                  See how Holdfast works
                </a>
              </div>

              <p className="mt-5 text-sm text-ink-faint">
                No approve/reject. No confidence score. No model prose.
              </p>
            </Reveal>

            <Reveal delay={90}>
              <WorkstationPreview />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The problem ───────────────────────────────────────────────────── */}
      <section id="product" className={cn("scroll-mt-24", LIGHT)}>
        <div className={SHELL}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <Reveal>
              <p className="label-eyebrow">The problem</p>
              <h2 className="display mt-4 text-[1.75rem] font-semibold sm:text-[2.125rem]">
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
                  <div key={item.term} className="py-4">
                    <dt className="text-xl font-medium text-graphite">{item.term}</dt>
                    <dd className="mt-1.5 text-lg leading-relaxed text-graphite-2">{item.def}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className={cn("scroll-mt-24", LIGHT)}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">How it works</p>
            <h2 className="display mt-4 max-w-2xl text-[1.75rem] font-semibold sm:text-[2.125rem]">
              One exception, from reconciliation to a recorded decision.
            </h2>
          </Reveal>

          <ol className="mt-8 grid gap-px border-t border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.n} delay={index * 45} className="bg-paper p-5 lg:p-6">
                <span className="num font-mono text-xs text-steel-deep">{step.n}</span>
                <h3 className="mt-2.5 text-xl font-medium text-graphite">{step.title}</h3>
                <p className="mt-1.5 text-lg leading-relaxed text-graphite-2">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The workstation ───────────────────────────────────────────────── */}
      <section className={DARK}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-section label-on-dark">The workstation</p>
            <h2 className="display mt-4 max-w-3xl text-[1.75rem] font-semibold text-ink sm:text-[2.125rem]">
              Three panes, and no screen the reviewer has to leave.
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
              An analyst reviewing a held invoice normally rebuilds context from five or six
              screens. Holdfast puts the queue, the evidence, and the decision in one place.
            </p>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            {/*
              The console pane only enters the frame at `lg`. Below that its
              label would point at something the reader cannot see, so the
              annotation leaves with the pane it describes.
            */}
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { pane: "Intake", note: "Money-at-risk queue", from: null },
                { pane: "Diagnostic ledger", note: "Field-level evidence", from: null },
                { pane: "Action console", note: "Human routing decision", from: "lg" },
              ].map((item) => (
                <div
                  key={item.pane}
                  className={cn(
                    "border-t border-line-strong pt-2.5",
                    item.from === "lg" && "hidden lg:block",
                  )}
                >
                  <p className="label-section label-on-dark">{item.pane}</p>
                  <p className="mt-1 text-lg text-ink">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <WorkstationPreview variant="full" />
            </div>

            <div className="mt-6">
              <Link href="/exceptions" className={buttonClass("primary", "lg")}>
                Open this workstation →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── The difference ────────────────────────────────────────────────── */}
      <section id="why" className={cn("scroll-mt-24", LIGHT)}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">Why Holdfast</p>
          </Reveal>

          <div className="mt-6 border-t border-rule">
            {DIFFERENCES.map((item, index) => (
              <Reveal
                key={item.n}
                delay={index * 60}
                className="grid gap-3 border-b border-rule py-6 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:py-8"
              >
                <div className="flex items-baseline gap-2.5 md:block">
                  <span className="num font-mono text-xs text-steel-deep">{item.n}</span>
                  <h3 className="label-eyebrow text-graphite-2 md:mt-2.5">{item.title}</h3>
                </div>
                <p className="display text-[1.25rem] font-medium text-graphite lg:text-[1.5rem]">
                  {item.lede}
                </p>
                <p className="text-lg leading-relaxed text-graphite-2">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Control philosophy ────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-steel-wash py-14 lg:py-20">
        <div className={SHELL}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <Reveal>
              <p className="label-eyebrow">Control philosophy</p>
              <p className="display mt-5 text-[1.875rem] font-semibold sm:text-[2.5rem]">
                The model may propose.
                <br />
                <span className="text-steel-deep">Deterministic code verifies.</span>
              </p>
            </Reveal>

            <Reveal delay={80} className="lg:pt-12">
              <p className="text-xl leading-relaxed text-graphite-2">
                A generated suggestion is a nomination, not a verdict. It is scored by the same
                deterministic rules as every other candidate, and it is discarded if it does not
                clear on its own merits. No generated output can release a hold or clear a
                transaction by itself.
              </p>
              <p className="mt-5 border-l-2 border-steel pl-4 text-xl leading-relaxed text-graphite">
                Automation can assemble the evidence.
                <br />
                Accountability stays explicit.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className={DARK}>
        <div className={SHELL}>
          <Reveal className="max-w-3xl">
            <h2 className="display text-[1.875rem] font-semibold text-ink sm:text-[2.5rem]">
              Review the exceptions automation shouldn&rsquo;t guess on.
            </h2>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link href="/exceptions" className={buttonClass("primary", "lg")}>
                Open workstation
              </Link>
              <Link href="/overview" className={buttonClass("outline", "lg")}>
                View run overview
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
