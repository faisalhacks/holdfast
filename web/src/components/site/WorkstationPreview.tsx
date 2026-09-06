import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { SeverityToken } from "@/components/ui/Badge";
import { Token } from "@/components/ui/Token";
import {
  PREVIEW_CURRENCY,
  PREVIEW_AT_RISK_PAISE,
  PREVIEW_HOLD_PAISE,
  PREVIEW_QUEUE,
  PREVIEW_REFERENCE,
  PREVIEW_SIGNALS,
  PREVIEW_TITLE,
} from "./previewCase";

/*
 * A non-interactive extract of the workstation.
 *
 * The centre column renders the real `ComparisonLedger`, the same component the
 * product uses, so the most important thing on this page cannot drift from the
 * thing it is selling. The queue and console columns are static recreations
 * built from the same tokens: the live queue row derives an SLA countdown from
 * the clock, and a marketing page should not show a number that keeps moving.
 */

function QueueColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col border-r border-line-strong bg-surface", className)}>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="label-section">Exception queue</span>
        <span className="num font-mono text-xs text-ink-faint">5 items</span>
      </div>

      <div className="border-b border-line px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="label-section">At risk</span>
          <span className="num font-mono text-xl font-semibold text-ink">
            {formatMoney(PREVIEW_AT_RISK_PAISE, PREVIEW_CURRENCY)}
          </span>
        </div>
        <p className="num mt-0.5 font-mono text-xs text-ink-faint">
          3 open · 1 in review · <span className="text-blocking">2 held</span> · 1 routed
        </p>
      </div>

      <div className="flex h-7 shrink-0 items-center border-b border-line px-3">
        <span className="label-section">Money at risk ↓</span>
      </div>

      <ul className="divide-y divide-line">
        {PREVIEW_QUEUE.map((row, index) => (
          <li
            key={row.reference}
            className={cn(
              "border-l-2 px-3 py-2",
              index === 0 ? "border-focus bg-surface-3" : "border-transparent",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "num font-mono text-base font-semibold",
                  row.exposure_paise !== null ? "text-ink" : "text-ink-faint",
                )}
              >
                {formatMoney(row.exposure_paise, PREVIEW_CURRENCY)}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {row.routed ? <Token tone="cleared">Routed</Token> : null}
                <SeverityToken severity={row.severity} />
              </span>
            </div>
            <p className="clamp-2 mt-1 text-base leading-snug text-ink">{row.title}</p>
            <p className="mt-1 truncate font-mono text-xs text-ink-faint">
              <span className="text-ink-muted">{row.reference}</span>
              <span aria-hidden className="mx-1.5 opacity-40">
                ·
              </span>
              {row.meta}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LedgerColumn() {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="border-b border-line bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-ink-muted">{PREVIEW_REFERENCE}</span>
          <SeverityToken severity="critical" />
          <Token tone="neutral">Open</Token>
          <span className="text-xs text-ink-faint">Threshold breach</span>
        </div>
        <p className="mt-1.5 text-lg leading-snug font-semibold text-ink">{PREVIEW_TITLE}</p>
      </div>

      <div className="flex h-8 items-center justify-between border-b border-line bg-surface px-3">
        <span className="label-section">Diagnostic ledger</span>
        <span className="num text-xs text-ink-faint">4 fields · 2 failing</span>
      </div>

      {/* The product's own component, rendering the product's own data shape. */}
      <ComparisonLedger signals={PREVIEW_SIGNALS} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-blocking/25 bg-blocking/8 px-3 py-2">
        <span className="label-section">Conflict summary</span>
        <span className="text-base text-ink">
          2 fields outside reference:{" "}
          <span className="text-ink-muted">Invoice total, Variance</span>
        </span>
        <span className="flex items-center gap-2">
          <Token tone="blocking">Payment held</Token>
          <span className="num font-mono text-base font-semibold text-blocking">
            {formatMoney(PREVIEW_HOLD_PAISE, PREVIEW_CURRENCY)}
          </span>
        </span>
      </div>
    </div>
  );
}

function ConsoleColumn({ className }: { className?: string }) {
  const paths = [
    { label: "Re-application", hint: "The settlement landed against the wrong item." },
    { label: "Customer outreach", hint: "The counterparty has to supply what is missing." },
    { label: "Internal correction", hint: "Our own record or posting is what is wrong." },
  ];

  return (
    <div className={cn("flex w-72 shrink-0 flex-col border-l border-line-strong bg-surface", className)}>
      <div className="flex h-8 items-center border-b border-line px-3">
        <span className="label-section">Route next action</span>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        <p className="text-sm text-ink-muted">
          Choosing who acts next. This does not determine whether the match is correct.
        </p>

        <div>
          <p className="label-section">Resolution path</p>
          <ul className="mt-1 space-y-1">
            {paths.map((path, index) => (
              <li key={path.label} className="flex gap-2 px-1.5 py-1">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-3 shrink-0 rounded-full border",
                    index === 2 ? "border-focus bg-focus/30" : "border-line-strong",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-base text-ink">{path.label}</span>
                  <span className="block text-xs text-ink-faint">{path.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-section">Next owner</p>
          <p className="mt-1 flex h-7 items-center rounded-sm border border-line-strong bg-surface-2 px-2 font-mono text-base text-ink">
            ap.corrections
          </p>
        </div>

        <div>
          <p className="label-section">Reason</p>
          <p className="mt-1 rounded-sm border border-line-strong bg-surface-2 px-2 py-1.5 text-sm leading-snug text-ink-muted">
            Variance is a contracted price change; purchasing to reissue the order line.
          </p>
        </div>

        <p className="flex h-7 items-center justify-center rounded-sm bg-focus text-base font-semibold text-canvas">
          Route action
        </p>
      </div>

      <div className="mt-auto border-t border-line">
        <div className="flex h-8 items-center justify-between px-3">
          <span className="label-section">Hold</span>
          <Token tone="blocking">Held</Token>
        </div>
        <div className="flex h-8 items-center justify-between border-t border-line px-3">
          <span className="label-section">Tolerance</span>
          <span className="num font-mono text-2xs text-ink-faint">5</span>
        </div>
        <div className="flex h-8 items-center justify-between border-t border-line px-3">
          <span className="label-section">Audit</span>
          <span className="num font-mono text-2xs text-ink-faint">4</span>
        </div>
      </div>
    </div>
  );
}

/**
 * `hero` shows intake plus the ledger; `full` adds the action console.
 *
 * The frame renders at a fixed intrinsic width and is scaled to whatever space
 * it is given, so it behaves like a screenshot rather than a responsive layout:
 * the composition never reflows, and the panes never reach a width the product
 * would never actually be used at. The intrinsic width steps down on small
 * screens so the type stays readable instead of shrinking to nothing.
 *
 * `zoom` is used rather than `transform: scale` because zoom participates in
 * layout, so the frame reserves its own height. Where zoom is unsupported the
 * container clips instead of breaking the page.
 *
 * Both variants are inert — no links, no controls, nothing focusable — so a
 * keyboard user tabs straight past the picture to the buttons that work.
 */
export function WorkstationPreview({
  variant = "hero",
  className,
}: {
  variant?: "hero" | "full";
  className?: string;
}) {
  /*
   * `--pane-width` is the width the frame is composed at. `--zoom-basis` is
   * the width it is scaled to fit.
   *
   * From `sm` up the two match, so the whole composition is visible. On a phone
   * they deliberately diverge: scaling a 34rem ledger into 350px would render
   * body text at eight pixels, so the frame stays legible and the frame clips
   * its right edge instead — a cropped screenshot rather than an unreadable one.
   */
  const width =
    variant === "full"
      ? "[--pane-width:34rem] sm:[--pane-width:52rem] lg:[--pane-width:80rem]"
      : "[--pane-width:34rem] sm:[--pane-width:52rem]";

  return (
    <figure
      className={cn(
        // The workstation's own hairline, so the frame is bounded the way the
        // panes inside it are rather than by a border invented for a website.
        "overflow-hidden rounded-sm border border-line-strong bg-canvas",
        "shadow-[0_18px_48px_-24px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div
        role="img"
        aria-label="The Holdfast workstation: a money-ordered exception queue, a diagnostic ledger comparing observed and reference values for each field, and a console for routing the exception to its next owner."
        className="@container overflow-hidden"
      >
        <div
          aria-hidden
          className={cn(
            // min(1, …) so a wide viewport never enlarges the frame past the
            // size the interface is actually designed at.
            "flex w-(--pane-width) text-ink",
            "[--zoom-basis:26rem] sm:[--zoom-basis:var(--pane-width)]",
            "[zoom:min(1,calc(100cqw/var(--zoom-basis)))]",
            width,
          )}
        >
          <QueueColumn className="hidden w-64 sm:flex" />
          <LedgerColumn />
          <ConsoleColumn className={variant === "full" ? "hidden lg:flex" : "hidden"} />
        </div>
      </div>

      {/*
        Says plainly what this is. The values above mirror the demo dataset and
        never move, so without this a reader could take them for a live run or
        an evaluation result. It sits outside the `role="img"` element so it is
        read out rather than swallowed by the image label.

        The colour is set here rather than taken from `ink-faint`, which lands
        at 3.9:1 on this surface. A disclosure has to be readable to do its job,
        so this is the quietest tone that still clears 4.5:1 at this size.
      */}
      <figcaption className="border-t border-line-strong bg-surface px-3 py-1.5 text-2xs text-[#7a838f]">
        Illustrative product preview &middot; sample data
      </figcaption>
    </figure>
  );
}
