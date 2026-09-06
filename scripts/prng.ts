// HOLDFAST — W02 generator. Deterministic pseudo-randomness and pure date arithmetic.
//
// Hand-rolled on purpose. Regeneration has to be byte-identical on any machine, at any
// future date, so determinism must not depend on a library version, on `Date.now()`, or
// on the host timezone. mulberry32 is 32-bit integer arithmetic throughout (`Math.imul`
// is exact), and the calendar helpers are Hinnant's civil-from-days algorithm rather than
// the `Date` object.

export type Rng = () => number;

/** mulberry32. Returns a value in [0, 1). Same seed, same stream, forever. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Indexed access that fails loudly instead of yielding `undefined`. */
export function at<T>(xs: readonly T[], i: number): T {
  const v = xs[i];
  if (v === undefined) throw new Error(`generator: index ${i} out of range (length ${xs.length})`);
  return v;
}

/** Inclusive on both bounds. */
export function intBetween(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pickOne<T>(rng: Rng, xs: readonly T[]): T {
  return at(xs, Math.floor(rng() * xs.length));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Fisher-Yates against the seeded stream. Does not mutate the input. */
export function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = at(out, i);
    const b = at(out, j);
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Largest-remainder (Hamilton) apportionment of `n` across `weights`, ties broken by
 * declaration order. This is how the holdout keeps the selection set's proportions while
 * still landing on whole invoices: 60 x 0.075 is 4.5, and 4.5 invoices do not exist.
 */
export function allocate(weights: readonly number[], n: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('generator: allocation weights must sum above zero');
  const exact = weights.map((w) => (w * n) / sum);
  const base = exact.map((x) => Math.floor(x));
  let remaining = n - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => (b.rem !== a.rem ? b.rem - a.rem : a.i - b.i));
  let k = 0;
  while (remaining > 0) {
    const slot = at(order, k % order.length);
    base[slot.i] = at(base, slot.i) + 1;
    remaining -= 1;
    k += 1;
  }
  return base;
}

// ── calendar ────────────────────────────────────────────────────────────────────

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: m <= 2 ? y + 1 : y, m, d };
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** `YYYY-MM-DD` from a day number. */
export function isoDate(day: number): string {
  const c = civilFromDays(day);
  return `${c.y}-${pad2(c.m)}-${pad2(c.d)}`;
}

/** `YYYY-MM` accounting period from a day number. */
export function isoPeriod(day: number): string {
  const c = civilFromDays(day);
  return `${c.y}-${pad2(c.m)}`;
}

/** `DD-MM-YY`, the shape a bank narration actually carries. */
export function shortDate(day: number): string {
  const c = civilFromDays(day);
  return `${pad2(c.d)}-${pad2(c.m)}-${pad2(c.y % 100)}`;
}

/**
 * A timestamp derived from a date plus a seeded time of day. Never the wall clock: a
 * generator that reads the clock cannot regenerate byte-identically tomorrow.
 */
export function stampAt(day: number, hour: number, minute: number, second: number): string {
  return `${isoDate(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.000Z`;
}

/** First day of the month containing `day`. */
export function monthStart(day: number): number {
  const c = civilFromDays(day);
  return daysFromCivil(c.y, c.m, 1);
}

/** `day` shifted by `months`, clamped to the 28th so month lengths never shift the series. */
export function addMonths(day: number, months: number): number {
  const c = civilFromDays(day);
  const total = c.y * 12 + (c.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return daysFromCivil(y, m, Math.min(c.d, 28));
}
