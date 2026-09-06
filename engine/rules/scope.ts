/**
 * W10 — the declared scope of a tolerance change, and whether a hold sits inside it.
 *
 * Scope is half the reconstruction. Reach says which hold TYPES a kind of tolerance can
 * touch; scope says which ROWS the reviewer aimed at. A change with no scope is a global
 * change, and a global change to a widely-reached kind is the single loudest row the audit
 * view has — which is why `global` is a value in the union and never the default that
 * happens when someone omits a field.
 *
 * A hold reaches its vendor through its invoice, so vendor scope needs an invoice
 * resolver. The resolver is passed in rather than read from a repository: this module has
 * no data access, no clock and no module state, so the same inputs give the same answer on
 * any machine, forever.
 */

import type { Hold, InvoiceId, ToleranceScope, VendorId } from '@/lib/types';

/**
 * Resolves the vendor a hold's invoice belongs to. Returns null when the invoice is not in
 * the caller's set — which is a real answer, not an error: a vendor-scoped change simply
 * does not reach a hold whose vendor cannot be established.
 */
export type VendorResolver = (invoiceId: InvoiceId) => VendorId | null;

/** A resolver over a plain list of invoice-to-vendor pairs. */
export function vendorResolver(
  invoices: readonly { readonly id: InvoiceId; readonly vendor_id: VendorId }[],
): VendorResolver {
  const byId = new Map<string, VendorId>(
    invoices.map((invoice) => [String(invoice.id), invoice.vendor_id]),
  );
  return (invoiceId) => byId.get(String(invoiceId)) ?? null;
}

/** True when a hold sits inside the declared scope of a tolerance change. */
export function holdInScope(
  hold: Hold,
  scope: ToleranceScope,
  vendorOf: VendorResolver,
): boolean {
  switch (scope.kind) {
    case 'global':
      return true;
    case 'hold_type':
      return hold.type === scope.hold_type;
    case 'invoice':
      return String(hold.invoice_id) === String(scope.invoice_id);
    case 'vendor': {
      const vendor = vendorOf(hold.invoice_id);
      return vendor !== null && String(vendor) === String(scope.vendor_id);
    }
    default:
      return false;
  }
}

/**
 * Short fixed phrase describing a scope, for the audit list. Not generated prose.
 * Matches `describeScope` in `app/api/_lib/tolerance.ts` word for word, so the same change
 * reads the same way whichever layer rendered it.
 */
export function describeScope(scope: ToleranceScope): string {
  switch (scope.kind) {
    case 'global':
      return 'every invoice in the run';
    case 'vendor':
      return `vendor ${String(scope.vendor_id)}`;
    case 'hold_type':
      return `hold type ${scope.hold_type}`;
    case 'invoice':
      return `invoice ${String(scope.invoice_id)}`;
    default:
      return 'unrecognised scope';
  }
}

/**
 * How wide a scope is, for ranking the audit list. A global widening of a widely-reached
 * kind is the row a reviewer should see first, and ordering by this rather than by
 * timestamp is why it appears there.
 */
export function scopeBreadth(scope: ToleranceScope): number {
  switch (scope.kind) {
    case 'global':
      return 3;
    case 'vendor':
      return 2;
    case 'hold_type':
      return 1;
    case 'invoice':
      return 0;
    default:
      return 0;
  }
}
