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

/*
 * Sections alternate between the workstation's two grounds — white surface and
 * cool canvas — the same pairing the product uses for a panel and the space
 * around it. There is no third colour and no marketing palette.
 */
const SURFACE = "border-t border-line bg-surface py-14 lg:py-20";
const CANVAS = "border-t border-line-strong bg-canvas py-14 lg:py-20";

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
        The hero opens on the product's own surface and gives the workstation
        the whole width. Brand, thesis, and interface are the first three
        things a reader meets, in that order, on the ground they will still be
        standing on a click later.
      */}
      <section className="bg-surface pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className={SHELL}>
          <Reveal className="max-w-3xl">
            <p className="label-eyebrow">Accounts payable · Exception review</p>

            <h1 className="display mt-4 text-[2.25rem] font-semibold text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
              Automation should stop before it guesses.
            </h1>

            <p className="mt-5 text-lg leading-relaxed text-ink-muted">
              Holdfast handles the reconciliation exceptions automation cannot safely resolve. It
              applies typed payment holds, assembles field-level evidence, and asks a human for the
              one thing a model should not decide:{" "}
              <span className="font-medium text-ink">who acts next.</span>
            </p>

            {/* The product's own state vocabulary, in the product's own chips. */}
            <ul className="mt-6 flex flex-wrap items-center gap-2">
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

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/exceptions" className={buttonClass("primary", "lg")}>
                Open the workstation
              </Link>
              <a href="#how" className={buttonClass("outline", "lg")}>
                See how Holdfast works
              </a>
            </div>

            <p className="mt-5 text-base text-ink-faint">
              No approve/reject. No confidence score. No model prose.
            </p>
          </Reveal>

          <Reveal delay={90} className="mt-10">
            <WorkstationPreview />
          </Reveal>
        </div>
      </section>

      {/* ── The problem ───────────────────────────────────────────────────── */}
      <section id="product" className={cn("scroll-mt-24", CANVAS)}>
        <div className={SHELL}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <Reveal>
              <p className="label-eyebrow">The problem</p>
              <h2 className="display mt-4 text-[1.75rem] font-semibold text-ink sm:text-[2.125rem]">
                Reconciliation tools compete on how much they clear.
                <span className="text-ink-faint">
                  {" "}
                  The harder question is what happens when they are wrong.
                </span>
              </h2>
            </Reveal>

            <Reveal delay={80}>
              <dl className="divide-y divide-line-strong border-t border-line-strong">
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
                    <dt className="text-md font-semibold text-ink">{item.term}</dt>
                    <dd className="mt-1.5 text-lg leading-relaxed text-ink-muted">{item.def}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className={cn("scroll-mt-24", SURFACE)}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">How it works</p>
            <h2 className="display mt-4 max-w-2xl text-[1.75rem] font-semibold text-ink sm:text-[2.125rem]">
              One exception, from reconciliation to a recorded decision.
            </h2>
          </Reveal>

          {/*
            A grid of panels on the canvas: the same object the product uses to
            group anything, at the same radius and the same hairline.
          */}
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal
                as="li"
                key={step.n}
                delay={index * 45}
                className="rounded-md border border-line-strong bg-canvas p-5 shadow-panel lg:p-6"
              >
                <span className="num font-mono text-xs text-focus">{step.n}</span>
                <h3 className="mt-2.5 text-md font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-ink-muted">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── The workstation ───────────────────────────────────────────────── */}
      <section className={CANVAS}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">The workstation</p>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { pane: "Intake", note: "Money-at-risk queue", from: null },
                { pane: "Diagnostic ledger", note: "Field-level evidence", from: null },
                { pane: "Action console", note: "Human routing decision", from: "lg" },
              ].map((item) => (
                <div
                  key={item.pane}
                  className={cn(
                    "border-t-2 border-focus/30 pt-3",
                    item.from === "lg" && "hidden lg:block",
                  )}
                >
                  <p className="label-field">{item.pane}</p>
                  <p className="mt-1 text-md text-ink">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <WorkstationPreview variant="full" />
            </div>

            <div className="mt-7">
              <Link href="/exceptions" className={buttonClass("primary", "lg")}>
                Open this workstation →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── The difference ────────────────────────────────────────────────── */}
      <section id="why" className={cn("scroll-mt-24", SURFACE)}>
        <div className={SHELL}>
          <Reveal>
            <p className="label-eyebrow">Why Holdfast</p>
          </Reveal>

          <div className="mt-6 border-t border-line-strong">
            {DIFFERENCES.map((item, index) => (
              <Reveal
                key={item.n}
                delay={index * 60}
                className="grid gap-3 border-b border-line-strong py-6 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] md:gap-8 lg:py-8"
              >
                <div className="flex items-baseline gap-2.5 md:block">
                  <span className="num font-mono text-xs text-focus">{item.n}</span>
                  <h3 className="label-field md:mt-2.5">{item.title}</h3>
                </div>
                <p className="display text-[1.25rem] font-medium text-ink lg:text-[1.5rem]">
                  {item.lede}
                </p>
                <p className="text-lg leading-relaxed text-ink-muted">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Control philosophy ────────────────────────────────────────────── */}
      <section className="border-t border-line-strong bg-focus-wash py-14 lg:py-20">
        <div className={SHELL}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <Reveal>
              <p className="label-eyebrow">Control philosophy</p>
              <p className="display mt-5 text-[1.875rem] font-semibold text-ink sm:text-[2.5rem]">
                The model may propose.
                <br />
                <span className="text-focus">Deterministic code verifies.</span>
              </p>
            </Reveal>

            <Reveal delay={80} className="lg:pt-12">
              <p className="text-lg leading-relaxed text-ink-muted">
                A generated suggestion is a nomination, not a verdict. It is scored by the same
                deterministic rules as every other candidate, and it is discarded if it does not
                clear on its own merits. No generated output can release a hold or clear a
                transaction by itself.
              </p>
              <p className="mt-5 border-l-2 border-focus pl-4 text-lg leading-relaxed text-ink">
                Automation can assemble the evidence.
                <br />
                Accountability stays explicit.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className={CANVAS}>
        <div className={SHELL}>
          <Reveal className="max-w-3xl">
            <h2 className="display text-[1.875rem] font-semibold text-ink sm:text-[2.5rem]">
              Review the exceptions automation shouldn&rsquo;t guess on.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-muted">
              The workstation opens on the demo run, ordered by money at risk.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
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
