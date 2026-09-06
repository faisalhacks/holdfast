// Tolerance comparison and scope resolution.
//
// A tolerance change is a DECISION, and the single most defensible claim this project
// makes is that widening one is recorded rather than silent. That claim is only worth
// anything if the API can say, mechanically, whether a change LOOSENED or TIGHTENED and
// exactly which holds sat inside its scope at the moment it was made.

import type {
  Hold,
  Invoice,
  Tolerance,
  ToleranceDirection,
  ToleranceScope,
} from '@/lib/types';
import { exact } from './money';

/**
 * `similarity` is inverted on purpose: raising a similarity floor makes the rule STRICTER,
 * so a higher number is a narrowing. Every other kind loosens as its number grows. Getting
 * this backwards would let a tightening be reported as a widening and vice versa, which is
 * the one thing the audit view exists to get right.
 */
export function toleranceDirection(from: Tolerance, to: Tolerance): ToleranceDirection {
  if (from.kind !== to.kind) return 'retyped';
  if (from.kind === 'exact' || to.kind === 'exact') return 'unchanged';

  if (from.kind === 'absolute_paise' && to.kind === 'absolute_paise') {
    const a = exact(from.value);
    const b = exact(to.value);
    if (b > a) return 'widened';
    if (b < a) return 'narrowed';
    return 'unchanged';
  }

  if (from.kind === 'similarity' && to.kind === 'similarity') {
    if (to.value < from.value) return 'widened';
    if (to.value > from.value) return 'narrowed';
    return 'unchanged';
  }

  if (
    (from.kind === 'percentage' && to.kind === 'percentage') ||
    (from.kind === 'days' && to.kind === 'days')
  ) {
    if (to.value > from.value) return 'widened';
    if (to.value < from.value) return 'narrowed';
    return 'unchanged';
  }

  return 'retyped';
}

/** True when a hold sits inside the scope of a tolerance change. */
export function holdInScope(
  hold: Hold,
  scope: ToleranceScope,
  invoiceOf: (hold: Hold) => Invoice | null,
): boolean {
  switch (scope.kind) {
    case 'global':
      return true;
    case 'hold_type':
      return hold.type === scope.hold_type;
    case 'invoice':
      return hold.invoice_id === scope.invoice_id;
    case 'vendor': {
      const invoice = invoiceOf(hold);
      return invoice !== null && invoice.vendor_id === scope.vendor_id;
    }
    default:
      return false;
  }
}

/** Short fixed phrase describing a scope, for the audit list. Not generated prose. */
export function describeScope(scope: ToleranceScope): string {
  switch (scope.kind) {
    case 'global':
      return 'every invoice in the run';
    case 'vendor':
      return `vendor ${scope.vendor_id}`;
    case 'hold_type':
      return `hold type ${scope.hold_type}`;
    case 'invoice':
      return `invoice ${scope.invoice_id}`;
    default:
      return 'unrecognised scope';
  }
}
