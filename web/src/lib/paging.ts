/**
 * Offset/limit ↔ page-number arithmetic.
 *
 * The backend pages with `limit` and `offset`; the pagination control counts pages. This
 * conversion is the only arithmetic the console performs on a backend page, and it lives
 * here rather than in the adapter so UI code never has to reach past `@/lib/api`.
 */

export function offsetToPage(offset: number, limit: number): number {
  return limit > 0 ? Math.floor(offset / limit) + 1 : 1;
}

export function pageToOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}
