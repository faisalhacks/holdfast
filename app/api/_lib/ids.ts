// Identifier and digest helpers.
//
// `lib/types.ts` brands every identifier, and the runtime constructors it points at
// (`lib/brands.ts`) belong to W01. Until they land, the API mints its own ids here — one
// place, so swapping to the shared constructors later is a single edit.

import { createHash, randomUUID } from 'node:crypto';
import type { IsoDate, IsoTimestamp, Sha256 } from '@/lib/types';

export function sha256(input: string): Sha256 {
  return createHash('sha256').update(input, 'utf8').digest('hex') as Sha256;
}

/**
 * Canonical JSON: keys sorted at every level, so a digest over a payload is stable
 * regardless of the order a driver or a serialiser happened to produce.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function newId<T extends string>(prefix: string): T {
  return `${prefix}_${randomUUID().replace(/-/g, '')}` as T;
}

export function nowTimestamp(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}

export function timestampAt(ms: number): IsoTimestamp {
  return new Date(ms).toISOString() as IsoTimestamp;
}

export function dateAt(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}

/** Accounting period, `YYYY-MM`, taken from a calendar date. */
export function periodOf(date: IsoDate): string {
  return String(date).slice(0, 7);
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two instants or dates, `later` minus `earlier`. */
export function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(earlier);
  const b = Date.parse(later);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / MS_PER_DAY);
}
