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
// reference_period_strip
// ─────────────────────────────────────────────────────────────────────────────

const TWO_DIGITS = /^\d{2}$/;
const PADDING = /^0+(?=\d)/;

/**
 * Removes the PERIOD segments of a document number — the calendar year one system writes
 * into its numbering and the other leaves out, and the Indian fiscal-year tail that a bank
 * line truncates away.
 *
 *     INV/2026/01640   ->  01640          the year is on one side only
 *     1342/26-27       ->  1342           the bank line says `1342`
 *
 * WHY THIS IS THE OPPOSITE OF OVER-MERGING, WHICH IS THE OBVIOUS OBJECTION.
 *
 * A period segment is shared by every document of that period, so it carries no evidence
 * about WHICH document is meant while looking exactly like evidence that does. The
 * comparator downstream is a token-set ratio, and a token-set ratio reaches 1 whenever one
 * side's tokens are a subset of the other's — so a bank line offering the bare token `2026`
 * scored a perfect reference agreement against every invoice numbered in 2026, on the
 * strength of a fact true of all of them. Deleting the segment does not merge two documents;
 * it stops one token pretending to distinguish them. Every case this changed on the frozen
 * selection set moved a WRONG payment off the top of the ranking.
 *
 * The two rules are narrow on purpose:
 *
 *   YEAR   a whole token listed in `tables.referenceYears`. A closed list, because
 *          `2602-5876` and `2603-2119` are YYMM-and-serial and a `/^20\d\d$/` pattern would
 *          eat the second half of this ledger's numbering.
 *   FISCAL two adjacent two-digit tokens, the second one greater than the first, AT THE END
 *          of the number. `1342/26-27` qualifies; `2603-2119` does not (four digits each),
 *          and a leading `26 27` would not (it is not the tail).
 *
 * A segment is never removed when nothing would be left. A reference that is only a period
 * is a reference we have no better reading of, and returning it untouched is more honest
 * than returning nothing and letting the pipeline's non-destructive guard put it back.
 */
export function referencePeriodStripStep(): NormalisationStep {
  return {
    id: 'reference_period_strip',
    clause: 'calendar-year and fiscal-year segments removed from the document number',
    apply(value: string, ctx: StepContext): StepResult {
      const tokens = tokensOf(value);
      if (tokens.length < 2) return noChange(value);

      const drop = new Array<boolean>(tokens.length).fill(false);
      const changes: StepChange[] = [];

      // FISCAL: the trailing `26 27`. Tested before the year rule so the tail is judged on
      // the number as written, not on what the year rule left behind.
      // Zero padding is convention drift in its own right — the same fiscal year arrives as
      // `26-27` and as `026/027` — so the shape is judged on the unpadded segment. The step
      // runs before `leading_zero_strip`, which is what makes this its problem and not that
      // step's.
      const last = tokens[tokens.length - 1]?.replace(PADDING, '');
      const penultimate = tokens[tokens.length - 2]?.replace(PADDING, '');
      if (
        tokens.length >= 3 &&
        last !== undefined &&
        penultimate !== undefined &&
        TWO_DIGITS.test(last) &&
        TWO_DIGITS.test(penultimate) &&
        Number(last) === Number(penultimate) + 1
      ) {
        drop[tokens.length - 1] = true;
        drop[tokens.length - 2] = true;
        changes.push(
          change('reference_period_removed', `${penultimate} ${last}`, '', 'fiscal_year'),
        );
      }

      // YEAR: a whole token the table names.
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === undefined || drop[i] === true) continue;
        const bare = token.replace(PADDING, '');
        if (!ctx.tables.referenceYears.has(bare)) continue;
        drop[i] = true;
        changes.push(change('reference_period_removed', token, '', bare));
      }

      if (changes.length === 0) return noChange(value);

      const kept: string[] = [];
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === undefined || drop[i] === true) continue;
        kept.push(token);
      }
      // Nothing identifying would survive: the period WAS the number we were given, and a
      // rule that empties a field has stopped normalising and started deleting.
      if (kept.length === 0) return noChange(value);

      return withChanges(kept.join(' '), changes);
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
const IDENTIFIER_LAYOUT = ['D', 'D', 'A', 'A', 'A', 'A', 'A', 'D', 'D', 'D', 'D', 'A', 'X', 'A', 'X'] as const;
export const IDENTIFIER_LENGTH = IDENTIFIER_LAYOUT.length;

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

/**
 * Compacts to alphanumerics, upper-cases, and repairs character-class confusions at fixed
 * positions when the value is exactly the right length. Anything of another length is
 * compacted and upper-cased but never repaired: guessing at a value that is not the shape
 * it claims to be manufactures identifiers that were never issued.
 */
export function identifierRepairStep(): NormalisationStep {
  return {
    id: 'identifier_repair',
    clause: 'compacted, upper-cased, character-class confusions repaired at fixed positions',
    apply(value: string): StepResult {
      const changes: StepChange[] = [];

      const compact = value.replace(NON_ALNUM, '');
      if (compact !== value) changes.push(change('whitespace_collapsed', value, compact, null));

      const upper = compact.toUpperCase();
      if (upper !== compact) changes.push(change('case_folded', compact, upper, null));

      if (upper.length !== IDENTIFIER_LENGTH) {
        if (changes.length === 0) return noChange(value);
        return withChanges(upper, changes);
      }

      const chars = [...upper];
      for (let i = 0; i < IDENTIFIER_LENGTH; i += 1) {
        const want = IDENTIFIER_LAYOUT[i];
        const ch = chars[i];
        if (want === undefined || ch === undefined || want === 'X') continue;
        const isDigit = ch >= '0' && ch <= '9';
        const fixed = want === 'D' && !isDigit ? TO_DIGIT.get(ch) : want === 'A' && isDigit ? TO_ALPHA.get(ch) : undefined;
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
  ['reference_period_strip', referencePeriodStripStep()],
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
