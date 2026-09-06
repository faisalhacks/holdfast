import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { HOLD_TYPE_LABELS } from "@/lib/labels";
import { ComparisonLedger } from "@/components/exceptions/ComparisonLedger";
import { AuditGlyph, OverviewGlyph, QueueGlyph } from "@/components/layout/NavGlyphs";
import { SeverityBadge } from "@/components/ui/Badge";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Token } from "@/components/ui/Token";
import { HoldfastLogo } from "./HoldfastLogo";
import { PREVIEW_AT_RISK, PREVIEW_CASE_ID, PREVIEW_EVIDENCE, PREVIEW_HOLD, PREVIEW_INVOICE_ID, PREVIEW_QUEUE, PREVIEW_REFERENCE, PREVIEW_RUN_ID, PREVIEW_VENDOR } from "./previewCase";

const NAV = [
  { label: "Overview", Glyph: OverviewGlyph, active: false },
  { label: "Exceptions", Glyph: QueueGlyph, active: true },
  { label: "Audit", Glyph: AuditGlyph, active: false },
];

function SidebarPane() {
  return <div className="flex w-52 shrink-0 flex-col border-r border-line-strong bg-surface"><div className="flex h-14 shrink-0 items-center px-4"><HoldfastLogo className="w-[104px]" /></div><ul className="flex flex-col gap-1 px-3 py-2">{NAV.map((item) => <li key={item.label}><span className={cn("flex h-10 items-center gap-2.5 rounded-sm px-3", item.active ? "bg-focus-wash text-focus-ink" : "text-ink-muted")}><item.Glyph /><span className="min-w-0 flex-1 truncate text-base">{item.label}</span></span></li>)}</ul></div>;
}

function TopBar() {
  return <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-strong bg-surface px-6"><p className="flex min-w-0 items-baseline gap-2"><span className="label-field">Run</span><span className="truncate font-mono text-sm text-ink">{PREVIEW_RUN_ID}</span></p><span className="inline-flex items-center gap-2 rounded-sm border border-material/30 bg-material/8 px-2.5 py-1 text-xs text-material"><span aria-hidden className="size-1.5 rounded-full bg-material" />Demo data</span></div>;
}

function QueuePane() {
  return <div className="flex w-90 shrink-0 flex-col border-r border-line-strong bg-surface"><div className="flex h-12 items-center justify-between border-b border-line px-4"><span className="text-md font-semibold text-ink">Exception queue</span><span className="num text-xs text-ink-faint">{PREVIEW_QUEUE.length} cases</span></div><div className="border-b border-line px-4 py-3.5"><p className="label-field">Money at risk</p><p className="num mt-1.5 text-2xl font-semibold text-ink">{formatMoney(PREVIEW_AT_RISK)}</p><p className="mt-1.5 text-xs text-ink-faint">Typed holds · backend ordered</p></div><div className="grid gap-2 border-b border-line px-4 py-3"><span className="flex h-9 items-center rounded-sm border border-line-strong px-3 text-xs text-ink-muted">All hold types</span><span className="label-field">Money at risk ↓</span></div><ul className="divide-y divide-line">{PREVIEW_QUEUE.map((row, index) => <li key={row.caseId} className={cn("border-l-[3px] px-4 py-3.5", index === 0 ? "border-focus bg-focus-wash" : "border-transparent")}><div className="flex items-baseline justify-between gap-3"><span className="num text-lg font-semibold text-ink">{formatMoney(row.moneyAtRisk)}</span><SeverityBadge severity={row.severity} /></div><p className="mt-1.5 text-base text-ink">{HOLD_TYPE_LABELS[row.holdType]}</p><p className="mt-2 flex gap-2 text-xs text-ink-faint"><span className="font-mono text-ink-muted">{row.invoiceId}</span><span>·</span><span>{row.age}</span></p><p className="mt-1.5 text-xs text-ink-faint">{row.blocksAccounting ? "Blocks accounting" : "Accounting permitted"}</p></li>)}</ul></div>;
}

function CasePanes() {
  return <><header className="rounded-md border border-line-strong bg-surface shadow-panel"><div className="px-5 pt-5 pb-4"><div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-sm text-ink-muted">{PREVIEW_REFERENCE}</span><SeverityBadge severity="blocking" /><Token tone="blocking">Payment held</Token></div><h3 className="mt-2.5 text-xl font-semibold text-ink">{PREVIEW_VENDOR}</h3><p className="mt-2 font-mono text-xs text-ink-muted">{PREVIEW_INVOICE_ID} · {PREVIEW_CASE_ID}</p></div><dl className="grid grid-cols-3 gap-px border-t border-line bg-line"><div className="bg-surface px-4 py-3"><dt className="label-field">Money at risk</dt><dd className="num mt-1 text-xl font-semibold text-ink">{formatMoney(PREVIEW_HOLD)}</dd></div><div className="bg-surface px-4 py-3"><dt className="label-field">Age</dt><dd className="mt-1 text-base font-medium text-ink">held 2 days</dd></div><div className="bg-surface px-4 py-3"><dt className="label-field">Hold state</dt><dd className="mt-1 text-base font-semibold text-blocking">1 open</dd><p className="mt-0.5 text-xs text-ink-faint">Blocks accounting</p></div></dl></header><Panel><PanelHeader title="Invoice against payment" count="3 fields · 1 outside tolerance" /><ComparisonLedger rows={PREVIEW_EVIDENCE} /></Panel></>;
}

function ConsolePanes({ className }: { className?: string }) {
  return <div className={className}><Panel><div className="flex min-h-11 items-center border-b border-line px-4 py-2"><span className="text-md font-semibold text-ink">Route next action</span></div><div className="space-y-4 px-4 py-4"><p className="text-base text-ink-muted">Choose who should act next. This does not release a hold.</p><div><p className="label-field">Resolution path</p><p className="mt-1.5 rounded-sm border border-focus bg-focus-wash px-3 py-2 text-base text-focus-ink">Internal correction</p></div><div><p className="label-field">Owner role</p><p className="mt-1.5 rounded-sm border border-line-strong px-3 py-2 text-base text-ink">AP manager</p></div><div><p className="label-field">Reason</p><p className="mt-1.5 rounded-sm border border-line-strong px-3 py-2 text-base text-ink-muted">Review the price variance against the order.</p></div><p className="flex h-9 items-center justify-center rounded-sm bg-focus text-base font-semibold text-white">Record decision</p></div></Panel>{[{ title: "Holds", status: "1 open" }, { title: "Tolerance", status: "₹92,160.25" }, { title: "Audit", status: "8" }].map((section) => <Panel key={section.title}><div className="flex min-h-11 items-center justify-between px-4 py-2"><span className="text-md font-semibold text-ink">▸ {section.title}</span><span className="num text-xs text-ink-faint">{section.status}</span></div></Panel>)}</div>;
}

function Caption() { return <figcaption className="border-t border-line-strong bg-surface px-4 py-2 text-xs text-[#5d6773]">Illustrative product preview · sample data</figcaption>; }
const LABEL = "The Holdfast workstation with a money-ordered typed-hold queue, field evidence, and a human action console.";

export function WorkstationPreview({ variant = "hero", className }: { variant?: "hero" | "full"; className?: string }) {
  const paneWidth = variant === "full" ? "[--pane-width:76rem] lg:[--pane-width:90rem]" : "[--pane-width:66rem] lg:[--pane-width:84rem]";
  return <><figure className={cn("overflow-hidden rounded-md border border-line-strong bg-canvas shadow-[0_16px_40px_-28px_rgba(16,24,40,0.45)] sm:hidden", className)}><div role="img" aria-label={LABEL}><div aria-hidden className="text-ink"><TopBar />{variant === "full" ? <ConsolePanes className="space-y-4 p-4" /> : <div className="space-y-4 p-4"><CasePanes /></div>}</div></div><Caption /></figure><figure className={cn("hidden overflow-hidden rounded-md border border-line-strong bg-canvas shadow-[0_24px_56px_-32px_rgba(16,24,40,0.45)] sm:block", className)}><div role="img" aria-label={LABEL} className="@container overflow-hidden"><div aria-hidden className={cn("flex w-(--pane-width) bg-canvas text-ink [zoom:min(1,calc(100cqw/var(--pane-width)))]", paneWidth)}><SidebarPane /><div className="flex min-w-0 flex-1 flex-col"><TopBar /><div className="flex min-h-0 flex-1"><QueuePane /><div className="min-w-0 flex-1 space-y-4 p-5"><CasePanes /></div>{variant === "full" ? <ConsolePanes className="w-90 shrink-0 space-y-4 border-l border-line-strong bg-canvas p-4" /> : null}</div></div></div></div><Caption /></figure></>;
}
