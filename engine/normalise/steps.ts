// W04a — the named steps.
//
// One exported factory per step, plus a registry mapping step id -> implementation.
// Nothing here reads a module-level variable, a clock, an environment variable or a cache.
// Two calls with the same `(value, ctx)` return the same `StepResult` on any machine, which
// is the precondition for a parallel search over orderings meaning anything at all.
//
// SWAPPING A STEP: build a registry with the replacement under the same id.
//
//   const steps = withStep(DEFAULT_STEPS, punctuationStripStep({ replaceWith: '' }));
//
// Every profile naming `punctuation_strip` now uses it, and every note still cites
// `punctuation_strip`, so two sweep runs remain comparable by step id.

import type {
  NormalisationStep,
  StepChange,
  StepContext,
  StepId,
  StepRegistry,
  StepResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Small pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Splits on whitespace, dropping empties. The canonical token view of a value. */
export function tokensOf(value: string): string[] {
  return value.split(/\s+/).filter((t) => t.length > 0);
}

function noChange(value: string): StepResult {
  return { value, changes: [], resolved_vendor_id: null };
}

function withChanges(value: string, changes: readonly StepChange[]): StepResult {
  return { value, changes, resolved_vendor_id: null };
}

function change(
  kind: StepChange['kind'],
  from: string,
  to: string,
  source: string | null,
): StepChange {
  return { kind, from, to, source, feedback_rule_id: null };
}

/**
 * Runs a per-token rewrite. `rewrite` returns the replacement text — the empty string
 * removes the token — or null to leave it alone. Removal and rewrite are both recorded
 * per token, so the evidence names the exact table entry that fired.
 */
function mapTokens(
  value: string,
  kind: StepChange['kind'],
  rewrite: (token: string) => string | null,
): StepResult {
  const tokens = tokensOf(value);
  const kept: string[] = [];
  const changes: StepChange[] = [];
  for (const token of tokens) {
    const next = rewrite(token);
    if (next === null) {
      kept.push(token);
      continue;
    }
    changes.push(change(kind, token, next, token));
    if (next.length > 0) kept.push(next);
  }
  if (changes.length === 0) return noChange(value);
  return withChanges(kept.join(' '), changes);
}

// ─────────────────────────────────────────────────────────────────────────────
// unicode_fold
// ─────────────────────────────────────────────────────────────────────────────

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Typographic characters a bank export produces that ASCII rules would otherwise miss.
 * Written as escapes, not as literal glyphs: a smart quote pasted into source is
 * invisible in a diff and survives review by being unreadable.
 */
const LOOKALIKES: ReadonlyMap<string, string> = new Map([
  ['\u2018', "'"], // left single quote
  ['\u2019', "'"], // right single quote, the apostrophe a spreadsheet emits
  ['\u201a', "'"], // single low quote
  ['\u201c', '\"'], // left double quote
  ['\u201d', '\"'], // right double quote
  ['\u2013', '-'], // en dash
  ['\u2014', '-'], // em dash
  ['\u2015', '-'], // horizontal bar
  ['\u2212', '-'], // minus sign
  ['\u00a0', ' '], // no-break space
  ['\u2009', ' '], // thin space
  ['\u202f', ' '], // narrow no-break space
  ['\ufeff', ''], // byte order mark
]);

/**
 * Compatibility-folds, removes combining marks, and maps typographic look-alikes to ASCII.
 * Runs first so every later rule can assume plain characters.
 */
export function unicodeFoldStep(): NormalisationStep {
  return {
    id: 'unicode_fold',
    clause: 'compatibility fold, diacritics removed, typographic characters mapped to ASCII',
    apply(value: string): StepResult {
      let out = value.normalize('NFKD').replace(COMBINING_MARKS, '');
      for (const [from, to] of LOOKALIKES) out = out.split(from).join(to);
      out = out.normalize('NFC');
      if (out === value) return noChange(value);
      return withChanges(out, [change('unicode_folded', value, out, null)]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// case_fold
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lower-cases. `toLowerCase`, never `toLocaleLowerCase`: a locale-sensitive fold makes the
 * output depend on the machine that ran it, and a normaliser whose result depends on the
 * host is not a normaliser.
 */
export function caseFoldStep(): NormalisationStep {
  return {
    id: 'case_fold',
    clause: 'lower-cased, locale-invariant',
    apply(value: string): StepResult {
      const out = value.toLowerCase();
      if (out === value) return noChange(value);
      return withChanges(out, [change('case_folded', value, out, null)]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// punctuation_strip
// ─────────────────────────────────────────────────────────────────────────────

const NON_ALNUM = /[^\p{L}\p{N}]+/gu;

export interface PunctuationStripOptions {
  /**
   * What a run of punctuation becomes. `' '` (default) treats a delimiter as a token
   * boundary, which is what inconsistent delimiters demand. `''` concatenates instead.
   */
  readonly replaceWith?: string;
}

/**
 * Replaces every run of non-alphanumerics. The single biggest source of spurious
 * mismatch is delimiter drift — `A/B`, `A-B`, `A_B`, `A.B` — and this is where it dies.
 */
export function punctuationStripStep(options: PunctuationStripOptions = {}): NormalisationStep {
  const replaceWith = options.replaceWith ?? ' ';
  return {
    id: 'punctuation_strip',
    clause: `punctuation replaced with ${replaceWith === '' ? 'nothing' : 'a token boundary'}`,
    apply(value: string): StepResult {
      const removed = new Set<string>();
      const out = value.replace(NON_ALNUM, (run) => {
        for (const ch of run) if (ch.trim().length > 0) removed.add(ch);
        return replaceWith;
      });
      if (out === value) return noChange(value);
      const source = removed.size > 0 ? [...removed].sort().join('') : null;
      return withChanges(out, [change('punctuation_stripped', value, out, source)]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// whitespace_collapse
// ─────────────────────────────────────────────────────────────────────────────

export function whitespaceCollapseStep(): NormalisationStep {
  return {
    id: 'whitespace_collapse',
    clause: 'runs of whitespace collapsed, ends trimmed',
    apply(value: string): StepResult {
      const out = value.replace(/\s+/g, ' ').trim();
      if (out === value) return noChange(value);
      return withChanges(out, [change('whitespace_collapsed', value, out, null)]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// noise_token_strip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Removes payment-rail boilerplate and connectives. On a bank narration this is most of
 * the string; on a vendor name it is usually nothing.
 */
export function noiseTokenStripStep(): NormalisationStep {
  return {
    id: 'noise_token_strip',
    clause: 'rail and connective boilerplate removed',
    apply(value: string, ctx: StepContext): StepResult {
      return mapTokens(value, 'noise_token_removed', (t) =>
        ctx.tables.noiseTokens.has(t) ? '' : null,
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// legal_suffix_strip
// ─────────────────────────────────────────────────────────────────────────────

export function legalSuffixStripStep(): NormalisationStep {
  return {
    id: 'legal_suffix_strip',
    clause: 'company-form tokens removed',
    apply(value: string, ctx: StepContext): StepResult {
      return mapTokens(value, 'legal_suffix_removed', (t) =>
        ctx.tables.legalSuffixes.has(t) ? '' : null,
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// abbreviation_expand
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expands known truncations token-wise. Runs AFTER the suffix strip so a company-form
 * token is gone before it can collide with an abbreviation of the same spelling.
 */
export function abbreviationExpandStep(): NormalisationStep {
  return {
    id: 'abbreviation_expand',
    clause: 'known truncations expanded to their full form',
    apply(value: string, ctx: StepContext): StepResult {
      return mapTokens(value, 'abbreviation_expanded', (t) => {
        const full = ctx.tables.abbreviations.get(t);
        return full === undefined || full === t ? null : full;
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// reference_prefix_strip
// ─────────────────────────────────────────────────────────────────────────────

const ALPHA_HEAD = /^(\p{L}+)(\p{N}.*)$/u;

/**
 * Removes a document-number prefix, whether it stands alone (`INV 0042`) or is fused to
 * the number (`INV0042`). Both spellings occur in the same vendor's own numbering within
 * a single year; that is what convention drift is.
 */
export function referencePrefixStripStep(): NormalisationStep {
  return {
    id: 'reference_prefix_strip',
    clause: 'document-number prefix removed',
    apply(value: string, ctx: StepContext): StepResult {
      return mapTokens(value, 'reference_prefix_removed', (t) => {
        if (ctx.tables.referencePrefixes.has(t)) return '';
        const m = ALPHA_HEAD.exec(t);
        if (m === null) return null;
        const head = m[1];
        const rest = m[2];
        if (head === undefined || rest === undefined) return null;
        return ctx.tables.referencePrefixes.has(head) ? rest : null;
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// leading_zero_strip
// ─────────────────────────────────────────────────────────────────────────────

const PADDED_NUMBER = /^0+(\d+)$/;

/**
 * Strips zero padding from a wholly numeric token. Applied only to whole tokens: zeros
 * inside a mixed token may be part of a code, and there is no way to tell from the string
 * alone. The cross-convention bridge is `NormalisationResult.digits`, not this step.
 */
export function leadingZeroStripStep(): NormalisationStep {
  return {
    id: 'leading_zero_strip',
    clause: 'zero padding removed from numeric tokens',
    apply(value: string): StepResult {
      return mapTokens(value, 'leading_zeros_removed', (t) => {
        const m = PADDED_NUMBER.exec(t);
        if (m === null) return null;
        const digits = m[1];
        return digits === undefined ? null : digits;
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// identifier_repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GSTIN-style layout, by position: two digits, five letters, four digits, one letter, one
 * alphanumeric, one letter, one alphanumeric. Fifteen characters.
 */
export const IDENTIFIER_LAYOUT = ['D', 'D', 'A', 'A', 'A', 'A', 'A', 'D', 'D', 'D', 'D', 'A', 'X', 'A', 'X'] as const;
export const IDENTIFIER_LENGTH = IDENTIFIER_LAYOUT.length;

/**
 * The shortest leading run of the layout still recognisable as a registration rather than
 * as a document number: the state code, the whole five-letter block, and the four digits.
 *
 * A value shorter than the full fifteen is only ever read as an identifier when a marker
 * token introduced it — see `foldIdentifierTokens` in tokens.ts. A bank field that ran out
 * of characters mid-registration is a truncated registration, not a reference; a bare
 * eleven-character fragment with nothing in front of it is neither, and is left alone.
 */
export const IDENTIFIER_MIN_PREFIX = 11;

/** Optical confusions, in both directions. Only these; a wider map invents identifiers. */
const TO_DIGIT: ReadonlyMap<string, string> = new Map([
  ['O', '0'],
  ['D', '0'],
  ['I', '1'],
  ['L', '1'],
  ['Z', '2'],
  ['S', '5'],
  ['B', '8'],
]);
const TO_ALPHA: ReadonlyMap<string, string> = new Map([
  ['0', 'O'],
  ['1', 'I'],
  ['2', 'Z'],
  ['5', 'S'],
  ['8', 'B'],
]);

/** `'D'` for an ASCII digit, `'A'` for an ASCII letter, null for anything else. */
function charClass(ch: string): 'D' | 'A' | null {
  if (ch >= '0' && ch <= '9') return 'D';
  if (ch >= 'A' && ch <= 'Z') return 'A';
  return null;
}

/**
 * THE ONE INVARIANT OF THIS WHOLE FAMILY OF RULES.
 *
 * A character is replaced ONLY when the class its position requires is not the class it
 * has. `O` standing where a digit belongs is a scanning artefact and becomes `0`; `7`
 * standing where a digit belongs is a digit and is left exactly as it is, whatever it is.
 * So no rule reachable from here can turn one registration into another registration:
 * `...7504...` and `...7505...` differ in a position where both characters are already
 * correct, every repair declines, and the two values stay two values.
 *
 * That is the difference between folding a variant and inventing a match. A variant is the
 * same registration typed differently — spaced, hyphened, lower-cased, scanned with an `O`
 * for a `0`. A registration one digit away is a different taxpayer, and merging the two is
 * a wrong match wearing a normaliser's coat.
 *
 * Returns null when the value cannot be the layout at its length — a non-alphanumeric, or
 * a class conflict with no optical explanation.
 */
export function repairIdentifierLayout(compactUpper: string): string | null {
  if (compactUpper.length > IDENTIFIER_LENGTH) return null;
  const chars = [...compactUpper];
  for (let i = 0; i < chars.length; i += 1) {
    const want = IDENTIFIER_LAYOUT[i];
    const ch = chars[i];
    if (want === undefined || ch === undefined) return null;
    const klass = charClass(ch);
    if (klass === null) return null;
    if (want === 'X' || want === klass) continue;
    const fixed = want === 'D' ? TO_DIGIT.get(ch) : TO_ALPHA.get(ch);
    if (fixed === undefined) return null;
    chars[i] = fixed;
  }
  return chars.join('');
}

/**
 * True when every character already sits in the class its position requires — no repair
 * consulted, no character substituted, nothing given the benefit of the doubt.
 *
 * RECOGNITION IS STRICT AND REPAIR IS NOT, and keeping the two apart is deliberate. The
 * repair table is a reasonable thing to apply to a value already known to be a
 * registration; applied as a TEST, it widens the shape enough to swallow document numbers
 * — `99INV012345678` passes a repairing test by reading its `0` and `1` as `O` and `I`,
 * and a reference read as a registration is a reference the matcher never sees.
 */
export function matchesIdentifierLayout(compactUpper: string): boolean {
  if (compactUpper.length > IDENTIFIER_LENGTH) return false;
  for (let i = 0; i < compactUpper.length; i += 1) {
    const want = IDENTIFIER_LAYOUT[i];
    const ch = compactUpper[i];
    if (want === undefined || ch === undefined) return false;
    const klass = charClass(ch);
    if (klass === null) return false;
    if (want !== 'X' && want !== klass) return false;
  }
  return true;
}

/** True when `compactUpper` is a whole identifier as written. Strict. */
export function isIdentifierValue(compactUpper: string): boolean {
  return compactUpper.length === IDENTIFIER_LENGTH && matchesIdentifierLayout(compactUpper);
}

/**
 * True when `compactUpper` is a whole identifier once optical confusions are repaired.
 * Only sound where something OTHER than the shape already says this is a registration —
 * a marker token in front of it. See `matchesIdentifierLayout`.
 */
export function isRepairableIdentifierValue(compactUpper: string): boolean {
  return (
    compactUpper.length === IDENTIFIER_LENGTH && repairIdentifierLayout(compactUpper) !== null
  );
}

/**
 * True when `compactUpper` is a leading run of the layout that stops short of the full
 * length — the shape of a registration a fixed-width bank field cut off. Strict, and never
 * true of a whole one.
 */
export function isIdentifierPrefix(compactUpper: string): boolean {
  return (
    compactUpper.length >= IDENTIFIER_MIN_PREFIX &&
    compactUpper.length < IDENTIFIER_LENGTH &&
    matchesIdentifierLayout(compactUpper)
  );
}

/**
 * Compacts to alphanumerics, upper-cases, drops a fused label, and repairs character-class
 * confusions at fixed positions.
 *
 * The three things a tax identifier arrives wearing are separators (`99-ZZSUN6912V-9ZG`,
 * `99 ZZLOM 8277Y 6ZW`), case (`97zzest7504u1zv`) and the label it was printed beside
 * (`GSTIN97ZZHAS2704N1ZP`). All three are the same registration and all three fold here.
 *
 * What does NOT fold is a value that differs in a character already of the right class.
 * See `repairIdentifierLayout`: the repair table is consulted only where the class is
 * wrong, so a one-digit difference survives every step in this file and stays a distinct
 * registration. The label strip is bounded the same way — the remainder must be exactly a
 * whole identifier, so nothing is ever shortened into a shape it did not have.
 *
 * A value of some other length is still compacted and upper-cased, and is still not
 * repaired: guessing at a value that is not the shape it claims to be manufactures
 * identifiers that were never issued.
 */
export function identifierRepairStep(): NormalisationStep {
  return {
    id: 'identifier_repair',
    clause:
      'compacted, upper-cased, label removed, character-class confusions repaired at fixed positions',
    apply(value: string, ctx: StepContext): StepResult {
      const changes: StepChange[] = [];

      const compact = value.replace(NON_ALNUM, '');
      if (compact !== value) changes.push(change('whitespace_collapsed', value, compact, null));

      let upper = compact.toUpperCase();
      if (upper !== compact) changes.push(change('case_folded', compact, upper, null));

      // A fused label: `GSTIN97ZZHAS2704N1ZP`. Stripped only when what is left is exactly a
      // whole identifier, so this can never shorten a value into a shape it did not have.
      if (upper.length > IDENTIFIER_LENGTH) {
        const head = upper.slice(0, upper.length - IDENTIFIER_LENGTH);
        const tail = upper.slice(upper.length - IDENTIFIER_LENGTH);
        if (ctx.tables.identifierMarkers.has(head.toLowerCase()) && isIdentifierValue(tail)) {
          changes.push(change('identifier_marker_removed', head, '', head.toLowerCase()));
          upper = tail;
        }
      }

      if (upper.length !== IDENTIFIER_LENGTH) {
        if (changes.length === 0) return noChange(value);
        return withChanges(upper, changes);
      }

      const chars = [...upper];
      for (let i = 0; i < IDENTIFIER_LENGTH; i += 1) {
        const want = IDENTIFIER_LAYOUT[i];
        const ch = chars[i];
        if (want === undefined || ch === undefined || want === 'X') continue;
        const klass = charClass(ch);
        if (klass === null || klass === want) continue;
        const fixed = want === 'D' ? TO_DIGIT.get(ch) : TO_ALPHA.get(ch);
        if (fixed === undefined) continue;
        chars[i] = fixed;
        changes.push(change('identifier_character_repaired', ch, fixed, `position ${i}`));
      }

      const out = chars.join('');
      if (changes.length === 0) return noChange(value);
      return withChanges(out, changes);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// alias_map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whole-string lookup, LAST in every default order. The table is keyed on the already
 * canonicalised string, so one entry covers every spelling the earlier steps already
 * collapse — which is why the table stays small enough for a human to read.
 *
 * An entry sourced from a feedback rule carries its rule id straight into the note, so the
 * reviewer sees that a named human's correction is what moved the value.
 */
export function aliasMapStep(): NormalisationStep {
  return {
    id: 'alias_map',
    clause: 'alias table applied to the canonicalised value',
    apply(value: string, ctx: StepContext): StepResult {
      const hit = ctx.tables.aliases.get(value);
      if (hit === undefined) return noChange(value);
      if (hit.canonical === value && hit.vendor_id === null) return noChange(value);
      const changes: StepChange[] =
        hit.canonical === value
          ? []
          : [
              {
                kind: 'alias_applied',
                from: value,
                to: hit.canonical,
                source: value,
                feedback_rule_id: hit.feedback_rule_id,
              },
            ];
      return { value: hit.canonical, changes, resolved_vendor_id: hit.vendor_id };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// token_sort
// ─────────────────────────────────────────────────────────────────────────────

export interface TokenSortOptions {
  /** Collapse repeats after sorting. Default true. */
  readonly dedupe?: boolean;
}

/**
 * Sorts tokens into a canonical order. OFF in every default profile: `fuzzball`'s
 * token-set ratio already ignores order, so sorting buys nothing there and destroys the
 * word order a reviewer reads. It exists because it is an obvious thing for a search to
 * try, and a knob the search cannot reach is a knob that was never tested.
 */
export function tokenSortStep(options: TokenSortOptions = {}): NormalisationStep {
  const dedupe = options.dedupe ?? true;
  return {
    id: 'token_sort',
    clause: dedupe ? 'tokens sorted and de-duplicated' : 'tokens sorted',
    apply(value: string): StepResult {
      const tokens = tokensOf(value);
      if (tokens.length < 2) return noChange(value);
      const sorted = [...tokens].sort();
      const final = dedupe ? [...new Set(sorted)] : sorted;
      const out = final.join(' ');
      if (out === value) return noChange(value);
      return withChanges(out, [change('tokens_sorted', value, out, null)]);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/** Every step at its default configuration. */
export const DEFAULT_STEPS: StepRegistry = new Map<StepId, NormalisationStep>([
  ['unicode_fold', unicodeFoldStep()],
  ['case_fold', caseFoldStep()],
  ['punctuation_strip', punctuationStripStep()],
  ['whitespace_collapse', whitespaceCollapseStep()],
  ['noise_token_strip', noiseTokenStripStep()],
  ['legal_suffix_strip', legalSuffixStripStep()],
  ['abbreviation_expand', abbreviationExpandStep()],
  ['reference_prefix_strip', referencePrefixStripStep()],
  ['leading_zero_strip', leadingZeroStripStep()],
  ['identifier_repair', identifierRepairStep()],
  ['alias_map', aliasMapStep()],
  ['token_sort', tokenSortStep()],
]);

/** Pure override. Returns a new registry with `step` installed under its own id. */
export function withStep(base: StepRegistry, step: NormalisationStep): StepRegistry {
  const next = new Map(base);
  next.set(step.id, step);
  return next;
}

/** Pure override for several steps at once. Later entries win. */
export function withSteps(base: StepRegistry, steps: readonly NormalisationStep[]): StepRegistry {
  const next = new Map(base);
  for (const s of steps) next.set(s.id, s);
  return next;
}
