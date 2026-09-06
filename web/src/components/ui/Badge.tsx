import type { ExceptionStatus, Severity, SignalStatus } from "@/lib/api";
import { SEVERITY_LABELS, SIGNAL_STATUS_LABELS, STATUS_LABELS } from "@/lib/labels";
import { StateDot, Token, type Tone } from "./Token";

/**
 * Severity, status and evidence state, each mapped to exactly one tone.
 *
 * `low` severity and an `unknown` signal get no colour at all: nothing is
 * wrong, and painting them would spend attention the reviewer needs elsewhere.
 */
export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: "blocking",
  high: "material",
  medium: "advisory",
  low: "neutral",
};

export function SeverityToken({ severity }: { severity: Severity }) {
  return <Token tone={SEVERITY_TONE[severity]}>{SEVERITY_LABELS[severity]}</Token>;
}

export const STATUS_TONE: Record<ExceptionStatus, Tone> = {
  open: "neutral",
  in_review: "focus",
  routed: "cleared",
};

export function StatusToken({ status }: { status: ExceptionStatus }) {
  return (
    <Token tone={STATUS_TONE[status]}>
      <StateDot tone={STATUS_TONE[status]} />
      {STATUS_LABELS[status]}
    </Token>
  );
}

/*
 * A passing field is the normal case, and in a table where most rows pass, a
 * green chip on each of them is the loudest thing on screen. Pass is stated,
 * not celebrated; the colour is spent on the rows that need reading.
 */
export const SIGNAL_TONE: Record<SignalStatus, Tone> = {
  pass: "neutral",
  warn: "material",
  fail: "blocking",
  unknown: "neutral",
};

export function SignalToken({ status }: { status: SignalStatus }) {
  return (
    <Token tone={SIGNAL_TONE[status]}>
      <StateDot tone={SIGNAL_TONE[status]} />
      {SIGNAL_STATUS_LABELS[status]}
    </Token>
  );
}

export { Token, StateDot };
