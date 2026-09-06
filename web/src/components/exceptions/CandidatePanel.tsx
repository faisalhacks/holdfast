import type { MatchCandidate } from "@/lib/api";
import { formatMoney, formatPercent } from "@/lib/format";
import { CARDINALITY_LABELS, PROPOSAL_SOURCE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { ScoreBar } from "@/components/ui/ScoreBar";

const COMPONENTS = ["amount", "reference", "date", "vendor"] as const;

const COMPONENT_LABELS: Record<(typeof COMPONENTS)[number], string> = {
  amount: "Amount",
  reference: "Reference",
  date: "Date",
  vendor: "Vendor",
};

/**
 * The scorer's arithmetic, itemised.
 *
 * Every row is `score × weight = contribution`, and the four contributions sum to the
 * composite — so a reviewer can re-add the number by hand rather than take it on trust.
 * This is the whole of what "score" means in this system; there is no separate certainty
 * the model reports about itself.
 */
export function CandidatePanel({ candidate }: { candidate: MatchCandidate }) {
  const { score } = candidate;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-faint">{candidate.id}</span>
        <Badge className="border-line-strong bg-surface-2 text-ink-muted">
          {CARDINALITY_LABELS[candidate.cardinality]}
        </Badge>
        <Badge className="border-line-strong bg-surface-2 text-ink-muted">
          {PROPOSAL_SOURCE_LABELS[candidate.proposed_by]}
        </Badge>
        {candidate.proposed_by === "model_proposal" ? (
          <Badge
            className={
              candidate.reverified
                ? "border-positive/35 bg-positive/10 text-positive"
                : "border-critical/40 bg-critical/10 text-critical"
            }
          >
            {candidate.reverified
              ? "Re-scored by the deterministic scorer"
              : "Not re-scored — cannot clear"}
          </Badge>
        ) : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] tracking-wide text-ink-faint uppercase">
            Composite score
          </p>
          <span className="font-mono text-[11px] text-ink-faint">{score.scorer_version}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-2xl font-semibold text-ink tabular-nums">
            {formatPercent(score.composite, 1)}
          </span>
          <ScoreBar
            value={score.composite}
            label="Deterministic composite match score"
            showValue={false}
            className="flex-1"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1.5 text-left text-[11px] font-medium text-ink-faint uppercase">
                Component
              </th>
              <th className="py-1.5 text-right text-[11px] font-medium text-ink-faint uppercase">
                Score
              </th>
              <th className="py-1.5 text-right text-[11px] font-medium text-ink-faint uppercase">
                Weight
              </th>
              <th className="py-1.5 text-right text-[11px] font-medium text-ink-faint uppercase">
                Contribution
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs tabular-nums">
            {COMPONENTS.map((key) => (
              <tr key={key} className="border-b border-line/60">
                <td className="py-1.5 font-sans text-ink">{COMPONENT_LABELS[key]}</td>
                <td className="py-1.5 text-right text-ink-muted">
                  {formatPercent(score[key].score, 1)}
                </td>
                <td className="py-1.5 text-right text-ink-faint">
                  {formatPercent(score[key].weight, 0)}
                </td>
                <td className="py-1.5 text-right text-ink">
                  {score[key].contribution.toFixed(4)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 font-sans text-ink-muted" colSpan={3}>
                Sum of contributions
              </td>
              <td className="py-1.5 text-right font-semibold text-ink">
                {score.composite.toFixed(4)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <dt className="text-[10px] text-ink-faint uppercase">Settled</dt>
          <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
            {formatMoney(candidate.settled)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-ink-faint uppercase">Residual</dt>
          <dd className="mt-1 font-mono text-sm text-ink tabular-nums">
            {formatMoney(candidate.residual)}
          </dd>
        </div>
      </dl>

      {candidate.payments.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="text-[10px] tracking-wide text-ink-faint uppercase">
            Bank lines ({candidate.payments.length})
          </p>
          <ul className="mt-2 space-y-2">
            {candidate.payments.map((payment) => (
              <li key={payment.id} className="text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-ink">{payment.bank_transaction_id}</span>
                  <span className="font-mono text-ink tabular-nums">
                    {formatMoney(payment.amount)}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] break-all text-ink-faint">
                  {payment.narration_raw}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  value {payment.value_date}
                  {payment.reference_extracted
                    ? ` · reference ${payment.reference_extracted}`
                    : " · no reference recovered"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
