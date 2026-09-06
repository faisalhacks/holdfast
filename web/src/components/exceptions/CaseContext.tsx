import type { CaseDossier } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { CandidatePanel } from "./CandidatePanel";
import { Panel, PanelHeader } from "@/components/ui/Panel";

export function CaseContext({ dossier }: { dossier: CaseDossier }) {
  const candidate = dossier.candidates[0] ?? null;
  return (
    <div className="space-y-3 2xl:space-y-4">
      {candidate ? <Panel><PanelHeader title="Top candidate" count={`rank ${candidate.rank}`} /><CandidatePanel candidate={candidate} /></Panel> : null}
      <Panel><PanelHeader title="Source context" /><dl className="grid gap-px bg-line sm:grid-cols-2"><div className="bg-surface px-4 py-3"><dt className="label-field">Invoice gross</dt><dd className="num mt-1 text-base text-ink">{formatMoney(dossier.invoice.gross)}</dd><p className="mt-1 font-mono text-xs text-ink-faint">{dossier.invoice.reference}</p></div><div className="bg-surface px-4 py-3"><dt className="label-field">Vendor context</dt><dd className="mt-1 text-base text-ink">{dossier.vendor.name}</dd><p className="mt-1 text-xs text-ink-faint">{dossier.duplicate_context.same_vendor_invoice_count} invoices · {formatMoney(dossier.duplicate_context.vendor_exposure)} exposure</p></div></dl></Panel>
    </div>
  );
}
