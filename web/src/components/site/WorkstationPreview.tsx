import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { OverviewGlyph, QueueGlyph } from "@/components/layout/NavGlyphs";
import { SeverityToken } from "@/components/ui/Badge";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StateDot, Token } from "@/components/ui/Token";
import { HoldfastLogo } from "./HoldfastLogo";
import {
  PREVIEW_CURRENCY,
  PREVIEW_AT_RISK_PAISE,
  PREVIEW_HOLD_PAISE,
  PREVIEW_QUEUE,
  PREVIEW_RAISED_AT,
  PREVIEW_RAISED_RELATIVE,
  PREVIEW_REFERENCE,
  PREVIEW_RUN_ID,
  PREVIEW_SIGNALS,
  PREVIEW_SLA_DUE,
  PREVIEW_SLA_LABEL,
  PREVIEW_TITLE,
} from "./previewCase";

/*
 * A non-interactive extract of the workstation.
 *
 * The comparison table is the real `ComparisonLedger`, the same component the
 * product renders, so the most important thing on this page cannot drift from
 * the thing it is selling. The frame around it is a static recreation built
 * from the same tokens and the same measurements — 208px sidebar, 56px top
 * bar, 360px queue, 8px panels on the canvas — because the live shell reads a
 * route, calls the API, and derives its countdowns from the clock, none of
 * which belong in a picture.
 *
 * Nothing inside the frame uses a responsive class. The frame is a screenshot
 * of the desktop composition and is scaled as a whole; a media query inside it
 * would answer questions about the reader's viewport, not about the frame.
 */

/* ── Shell ─────────────────────────────────────────────────────────────── */

const NAV = [
  { label: "Overview", Glyph: OverviewGlyph, active: false, count: null },
  { label: "Exceptions", Glyph: QueueGlyph, active: true, count: 3 },
];

function SidebarPane() {
  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-line-strong bg-surface">
      <div className="flex h-14 shrink-0 items-center px-4">
        <HoldfastLogo className="w-[104px]" />
      </div>
      <ul className="flex flex-col gap-1 px-3 py-2">
        {NAV.map((item) => (
          <li key={item.label}>
            <span
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-sm px-3",
                item.active ? "bg-focus-wash text-focus-ink" : "text-ink-muted",
              )}
            >
              <item.Glyph />
              <span className="min-w-0 flex-1 truncate text-base">{item.label}</span>
              {item.count ? (
                <span className="num shrink-0 rounded-xs bg-surface-3 px-1.5 py-px text-xs text-ink-muted">
                  {item.count}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-strong bg-surface px-6">
      <p className="flex min-w-0 items-baseline gap-2">
        <span className="label-field">Run</span>
        <span className="truncate font-mono text-sm text-ink">{PREVIEW_RUN_ID}</span>
      </p>
      <span className="inline-flex items-center gap-2 rounded-sm border border-material/30 bg-material/8 px-2.5 py-1 text-xs text-material">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-material" />
        Demo data
      </span>
    </div>
  );
}

/* ── Queue ─────────────────────────────────────────────────────────────── */

const STATUS_TABS = ["All", "Open", "In review", "Routed"];

function QueuePane() {
  return (
    <div className="flex w-90 shrink-0 flex-col border-r border-line-strong bg-surface">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <span className="text-md font-semibold text-ink">Exception queue</span>
        <span className="num shrink-0 text-xs text-ink-faint">5 items</span>
      </div>

      <div className="border-b border-line px-4 py-3.5">
        <p className="label-field">Money at risk</p>
        <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-ink">
          {formatMoney(PREVIEW_AT_RISK_PAISE, PREVIEW_CURRENCY)}
        </p>
        <p className="num mt-1.5 text-xs text-ink-faint">
          3 open · 1 in review · <span className="font-medium text-blocking">2 held</span> · 1
          routed
        </p>
      </div>

      <div className="border-b border-line px-4 py-3">
        <p className="flex h-9 items-center rounded-sm border border-line-strong bg-surface px-3 text-base text-ink-faint">
          Reference, subject, agent
        </p>
        <div className="mt-2.5 flex overflow-hidden rounded-sm border border-line-strong">
          {STATUS_TABS.map((label, index) => (
            <span
              key={label}
              className={cn(
                "flex-1 border-r border-line-strong py-1.5 text-center text-xs last:border-r-0",
                index === 0
                  ? "bg-focus-wash font-medium text-focus-ink"
                  : "bg-surface text-ink-muted",
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="label-field">Money at risk ↓</span>
          <span className="text-xs text-focus-ink">▸ More filters</span>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {PREVIEW_QUEUE.map((row, index) => (
          <li
            key={row.reference}
            className={cn(
              "border-l-[3px] px-4 py-3.5",
              index === 0
                ? "border-focus bg-surface-3"
                : row.routed
                  ? "border-cleared/50"
                  : "border-transparent",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={cn(
                  "num text-lg font-semibold tracking-tight",
                  row.exposure_paise !== null ? "text-ink" : "text-ink-faint",
                )}
              >
                {formatMoney(row.exposure_paise, PREVIEW_CURRENCY)}
              </span>
              <span className="shrink-0">
                <SeverityToken severity={row.severity} />
              </span>
            </div>
            <p
              className={cn(
                "clamp-2 mt-1.5 text-base leading-snug",
                row.routed ? "text-ink-muted" : "text-ink",
              )}
            >
              {row.title}
            </p>
            <p className="mt-2 flex items-center gap-2 truncate text-xs text-ink-faint">
              <span className="shrink-0 font-mono text-ink-muted">{row.reference}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="truncate">{row.meta}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className={cn("shrink-0", row.breached && "font-medium text-blocking")}>
                {row.sla}
              </span>
            </p>
            {row.exposure_paise === null ? (
              <p className="mt-1.5 text-xs text-ink-faint">No exposure recorded</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Centre ────────────────────────────────────────────────────────────── */

function CaseHeaderPanel() {
  return (
    <header className="rounded-md border border-line-strong bg-surface shadow-panel">
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-sm text-ink-muted">{PREVIEW_REFERENCE}</span>
          <SeverityToken severity="critical" />
          <Token tone="neutral">
            <StateDot tone="neutral" />
            Open
          </Token>
          <span className="text-xs text-ink-faint">Threshold breach</span>
        </div>

        <h3 className="mt-2.5 text-xl leading-snug font-semibold tracking-tight text-ink">
          {PREVIEW_TITLE}
        </h3>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          <span>Reconciliation agent</span>
          <span aria-hidden className="opacity-40">·</span>
          <span className="font-mono text-xs">{PREVIEW_RUN_ID}</span>
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-px border-t border-line bg-line">
        <div className="bg-surface px-4 py-3">
          <dt className="label-field">Amount at risk</dt>
          <dd className="num mt-1 text-xl font-semibold text-ink">
            {formatMoney(PREVIEW_HOLD_PAISE, PREVIEW_CURRENCY)}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="label-field">Raised</dt>
          <dd className="mt-1 text-base font-medium text-ink">
            {PREVIEW_RAISED_RELATIVE}
            <span className="mt-0.5 block text-xs font-normal text-ink-faint">
              {PREVIEW_RAISED_AT}
            </span>
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="label-field">Time left</dt>
          <dd className="mt-1 text-md font-semibold text-material">
            {PREVIEW_SLA_LABEL}
            <span className="mt-0.5 block text-xs font-normal text-ink-faint">
              due {PREVIEW_SLA_DUE}
            </span>
          </dd>
        </div>
      </dl>
    </header>
  );
}

function ConflictPanel() {
  return (
    <div className="rounded-md border border-blocking/25 bg-blocking/6 px-5 py-3.5">
      <p className="flex items-center gap-2">
        <StateDot tone="blocking" />
        <span className="label-field">Conflict summary</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-base text-ink">
          2 fields outside reference:{" "}
          <span className="text-ink-muted">Invoice total, Variance</span>
        </p>
        <span className="flex items-center gap-2.5">
          <Token tone="blocking">Payment held</Token>
          <span className="num text-md font-semibold text-blocking">
            {formatMoney(PREVIEW_HOLD_PAISE, PREVIEW_CURRENCY)}
          </span>
        </span>
      </div>
    </div>
  );
}

/** The case, exactly as the centre pane stacks it: header, conflict, ledger. */
function CasePanes() {
  return (
    <>
      <CaseHeaderPanel />
      <ConflictPanel />
      <Panel>
        <PanelHeader title="Field comparison" count="4 fields · 2 failing" />
        {/* The product's own component, rendering the product's own data shape. */}
        <ComparisonLedger signals={PREVIEW_SIGNALS} />
      </Panel>
    </>
  );
}

/* ── Console ───────────────────────────────────────────────────────────── */

const PATHS = [
  { label: "Re-application", hint: "The settlement landed against the wrong item." },
  { label: "Customer outreach", hint: "The counterparty has to supply what is missing." },
  { label: "Internal correction", hint: "Our own record or posting is what is wrong." },
];

function ConsolePanes({ className }: { className?: string }) {
  const sections = [
    { title: "Hold", status: <Token tone="blocking">Held</Token> },
    { title: "Tolerance", status: <span className="num text-xs text-ink-faint">5</span> },
    { title: "Audit", status: <span className="num text-xs text-ink-faint">4</span> },
  ];

  return (
    <div className={className}>
      <Panel>
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="text-md font-semibold text-ink">Route next action</span>
        </div>
        <div className="space-y-4 px-4 py-4">
          <p className="text-base text-ink-muted">
            Choosing who acts next. This does not determine whether the match is correct.
          </p>

          <div>
            <p className="label-field mb-1.5">Resolution path</p>
            <ul className="space-y-1.5">
              {PATHS.map((path, index) => (
                <li key={path.label} className="flex gap-2.5 rounded-sm px-2 py-2">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 size-3.5 shrink-0 rounded-full border",
                      index === 2 ? "border-[5px] border-focus" : "border-line-strong",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-ink">{path.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-faint">{path.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="label-field">Next owner</p>
            <p className="mt-1.5 flex h-9 items-center rounded-sm border border-line-strong bg-surface px-2.5 text-base text-ink">
              ap.corrections
            </p>
          </div>

          <div>
            <p className="label-field">Reason</p>
            <p className="mt-1.5 rounded-sm border border-line-strong bg-surface px-2.5 py-2 text-base leading-snug text-ink-muted">
              Variance is a contracted price change; purchasing to reissue the order line.
            </p>
          </div>

          <p className="flex h-9 w-full items-center justify-center rounded-sm bg-focus text-base font-semibold text-white">
            Route action
          </p>
        </div>
      </Panel>

      {sections.map((section) => (
        <Panel key={section.title}>
          <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
            <span className="flex items-center gap-2">
              <span aria-hidden className="text-ink-faint">▸</span>
              <span className="text-md font-semibold text-ink">{section.title}</span>
            </span>
            {section.status}
          </div>
        </Panel>
      ))}
    </div>
  );
}

/* ── Frame ─────────────────────────────────────────────────────────────── */

/*
 * Says plainly what this is. The values mirror the demo dataset and never
 * move, so without this a reader could take them for a live run or an
 * evaluation result. It sits outside the `role="img"` element so it is read
 * out rather than swallowed by the image label.
 *
 * The colour is set here rather than taken from `ink-faint`. A disclosure has
 * to be readable to do its job, so this is a tone that clears 4.5:1 at this
 * size on this surface.
 */
function Caption() {
  return (
    <figcaption className="border-t border-line-strong bg-surface px-4 py-2 text-xs text-[#5d6773]">
      Illustrative product preview &middot; sample data
    </figcaption>
  );
}

const LABEL =
  "The Holdfast workstation: a money-ordered exception queue, a diagnostic ledger comparing observed and reference values for each field, and a console for routing the exception to its next owner.";

/**
 * `hero` shows the shell, the queue and the case; `full` adds the action
 * console.
 *
 * The desktop frame renders at a fixed intrinsic width and is scaled to
 * whatever space it is given, so it behaves like a screenshot rather than a
 * responsive layout: the composition never reflows, and the panes never reach
 * a width the product would never be used at. `zoom` is used rather than
 * `transform: scale` because zoom participates in layout, so the frame
 * reserves its own height.
 *
 * Below `sm` there is no honest way to scale a 1440px composition, so the page
 * shows the case pane on its own instead — which is exactly what the product
 * shows a reader on a phone. The preview is small there because the product
 * is, not because the picture has been cropped.
 *
 * Both are inert: no links, no controls, nothing focusable, so a keyboard user
 * tabs straight past the picture to the buttons that work.
 */
export function WorkstationPreview({
  variant = "hero",
  className,
}: {
  variant?: "hero" | "full";
  className?: string;
}) {
  const paneWidth =
    variant === "full"
      ? "[--pane-width:76rem] lg:[--pane-width:90rem]"
      : "[--pane-width:66rem] lg:[--pane-width:84rem]";

  return (
    <>
      {/*
        Phone: the product at the width the reader is holding.

        The two variants show different panes rather than the same one twice.
        On a phone the workstation is one pane at a time — the case, then the
        console over it — so the hero shows the evidence and the section about
        the decision shows the console. Which is also how the product behaves.
      */}
      <figure
        className={cn(
          "overflow-hidden rounded-md border border-line-strong bg-canvas sm:hidden",
          "shadow-[0_16px_40px_-28px_rgba(16,24,40,0.45)]",
          className,
        )}
      >
        <div role="img" aria-label={LABEL}>
          <div aria-hidden className="text-ink">
            <TopBar />
            {variant === "full" ? (
              <ConsolePanes className="space-y-4 p-4" />
            ) : (
              <div className="space-y-4 p-4">
                <CasePanes />
              </div>
            )}
          </div>
        </div>
        <Caption />
      </figure>

      {/* Everything else: the desktop composition, scaled as one picture. */}
      <figure
        className={cn(
          "hidden overflow-hidden rounded-md border border-line-strong bg-canvas sm:block",
          "shadow-[0_24px_56px_-32px_rgba(16,24,40,0.45)]",
          className,
        )}
      >
        <div role="img" aria-label={LABEL} className="@container overflow-hidden">
          <div
            aria-hidden
            className={cn(
              // min(1, …) so a wide viewport never enlarges the frame past the
              // size the interface is actually designed at.
              "flex w-(--pane-width) bg-canvas text-ink",
              "[zoom:min(1,calc(100cqw/var(--pane-width)))]",
              paneWidth,
            )}
          >
            <SidebarPane />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar />
              <div className="flex min-h-0 flex-1">
                <QueuePane />
                <div className="min-w-0 flex-1 space-y-4 p-5">
                  <CasePanes />
                </div>
                {variant === "full" ? (
                  <ConsolePanes className="w-90 shrink-0 space-y-4 border-l border-line-strong bg-canvas p-4" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <Caption />
      </figure>
    </>
  );
}
