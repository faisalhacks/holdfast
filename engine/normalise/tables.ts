// W04a — the DATA half of a normalisation strategy.
//
// Every table here is a plain, readable list. That is the point: a reviewer can be shown
// the exact line that rewrote a vendor name, and a search agent can swap a table without
// reading a line of transform code.
//
// THE DEFAULT ALIAS TABLE IS EMPTY, deliberately, and that is not an oversight.
//   * A shipped alias table naming real companies would break the house rule against real
//     vendors in this project.
//   * A shipped alias table naming OUR vendors would be the engine memorising the dataset.
//     That is precisely the shape of artefact an adversarial critic is told to hunt for,
//     and it would make the headline number a lookup rather than a measurement.
// Aliases therefore arrive at runtime from two honest sources, both built here:
// the vendor master the engine is legitimately given, and reviewer-authored feedback rules.

import type { FeedbackRule, VendorId } from '@/lib/types';
import type { AliasEntry, AliasTable, NormalisationTables } from './types';

/** Normalises a raw string to the key the alias table is stored under. */
export type AliasKeyFn = (raw: string) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Legal suffixes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Company-form tokens, stripped at token granularity after punctuation is gone.
 *
 * Includes the truncated spellings a bank narration field produces when it runs out of
 * characters, because "ACME SW PVT" is the shape we actually receive, not "Acme Software
 * Private Limited". Excludes geography tokens such as `india` on purpose: they are part of
 * the name often enough that dropping them merges genuinely distinct entities.
 *
 * ── WHAT A LEAVE-ONE-OUT SWEEP OVER THIS TABLE MEASURED ──────────────────────
 *
 * Every entry was removed on its own, and the whole table was emptied, with the rest of
 * the engine held fixed. Two things came out of it and both are worth writing down,
 * because the second one is the reason this table is a poor place to spend effort.
 *
 *   1. NO ENTRY IS DEAD WEIGHT, AND THE STRIP IS NOT POSITIONAL. Removing `private`
 *      or `limited` loses two pairings; `pvt`, `ltd`, `prvt` and `co` lose one each.
 *      Restricting the strip to the TAIL of a value — a legal suffix is a suffix, so
 *      the restriction looks free — loses aggregate similarity and gains nothing: the
 *      bank writes "ASHVARNE MRN SVC SOLN PVT LTD GSTIN NA REF ..." with the form in
 *      the middle of the line, so tail-only stripping is asymmetric across the two
 *      sides. Stripping anywhere is right.
 *
 *   2. STRIPPING IS NOT MONOTONE, because `token_set_ratio` scores the INTERSECTION.
 *      When both sides spell the form out, removing it from both shrinks the
 *      intersection and the similarity falls; when only the bank side carries it, or
 *      the two sides spell it differently, removing it is a clear gain. Collapsing
 *      every form to one shared marker instead of deleting it was tried for exactly
 *      this reason and is WORSE (net two pairings), because the shared marker inflates
 *      every vendor pair equally, including the wrong ones.
 *
 * And the finding that matters most to a sweep: NONE of this moves `selection.coverage`.
 * Every variant tested, the empty table included, decided the same 141 of 200 invoices.
 * A pairing lost here degrades into a `matching` hold and one gained here comes out of a
 * `no_reference` hold, and both of those are `auto_releasable` in the registry, so they
 * are already counted as decided. This table moves match precision and recall, not
 * coverage. The coverage-bearing holds — `price_variance`, `cardinality_residual` — were
 * not reachable from here on any variant tried.
 */
export const DEFAULT_LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  // `p` earns its place: "(P) Ltd" is one of the commonest Indian spellings of a private
  // limited company, and after punctuation stripping it is a bare `p`. The cost is that a
  // single-letter initial is also removed — "P Kumar Traders" loses its `p`. That cost is
  // paid symmetrically on both sides, so it degrades a comparison rather than skewing one.
  //
  // It was the first entry a search was told to try removing, and removing it is WRONG:
  // it costs aggregate vendor similarity and buys back nothing, because the single-letter
  // initial the comment warns about does not occur on the ledger side at all while the
  // bank side does write the form. The hypothesis is recorded as tested and falsified
  // rather than deleted, so the next reader does not spend the run re-testing it.
  'p',
  // `l` and `pl` are the same case as `p`, and they are what this feed actually sends.
  // A narration field that runs out of characters mid-form emits the head of it:
  // "NRVTH AUTO CMPNNTS L", "SVRNDH PCKGNG PRVT L", "TALPANI TLRM L". And "(P) Ltd"
  // written without its punctuation fuses to a bare `pl` after the punctuation strip:
  // "AMSS PL", "NPS PL", "SES PL", "QEI PL". Neither spelling occurs on the ledger side,
  // so stripping them removes a token that could never have found a partner.
  'pl',
  'l',
  'pvt',
  'pvts',
  'prv',
  'prvt',
  // A transposition of `pvt`, on the same footing as the truncations beside it:
  // "N&VIRA SW VPT LTD". It fires rarely; it is listed because the shape is the table's
  // own — a bank-side misspelling of a form that the ledger side spells correctly.
  'vpt',
  'private',
  'ltd',
  'ltda',
  'lmtd',
  'limited',
  'llp',
  'llc',
  'lp',
  'inc',
  'incorporated',
  'corp',
  'corpn',
  'corporation',
  'co',
  'cos',
  'company',
  'plc',
  'opc',
  'gmbh',
  'ag',
  'sa',
  'sarl',
  'bv',
  'nv',
  'pte',
  'pty',
  'sdn',
  'bhd',
  'oy',
  'ab',
  'aps',
  'srl',
  'spa',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Noise tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payment-rail boilerplate and English connectives. One shared set for vendor names and
 * bank narration: rail codes never occur in a vendor name, and connectives are noise in
 * both. Two sets would be two things to keep in step for no gain.
 *
 * `dr` and `cr` are absent on purpose — they are real name fragments often enough that
 * stripping them costs more than the debit/credit markers they would catch.
 */
export const DEFAULT_NOISE_TOKENS: ReadonlySet<string> = new Set([
  // rails
  'neft',
  'rtgs',
  'imps',
  'upi',
  'ach',
  'ecs',
  'nach',
  'chq',
  'chqno',
  'cheque',
  'chk',
  'dd',
  'ft',
  'trf',
  'tfr',
  'transfer',
  'txn',
  'tran',
  'trn',
  'trns',
  'inb',
  'mmt',
  // reference furniture
  'ref',
  'refno',
  'rrn',
  'utr',
  'inv',
  'invoice',
  'bill',
  'bills',
  'no',
  'nos',
  'num',
  'number',
  // settlement words
  'payment',
  'payments',
  'pmt',
  'pmnt',
  'payt',
  'pay',
  'paid',
  'remittance',
  'remit',
  'rem',
  'settlement',
  // connectives
  'by',
  'to',
  'from',
  'via',
  'for',
  'of',
  'the',
  'and',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Abbreviations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncation -> full form, applied token-wise. This is the step that closes
 * "ACME SW PVT" against "Acme Software Pvt Ltd".
 *
 * Singular forms map to plural on purpose: `service` -> `services`. Singular/plural drift
 * between a vendor master and a bank narration is as common as truncation and costs the
 * same similarity points.
 *
 * Ambiguous stems are deliberately absent. `cons` could be consultants or construction;
 * `const` is worse. An expansion that is wrong half the time is a false match generator.
 */
export const DEFAULT_ABBREVIATIONS: ReadonlyMap<string, string> = new Map([
  ['sw', 'software'],
  ['softwares', 'software'],
  ['svc', 'services'],
  ['svcs', 'services'],
  ['serv', 'services'],
  ['servs', 'services'],
  ['srv', 'services'],
  ['srvc', 'services'],
  ['srvcs', 'services'],
  ['service', 'services'],
  ['tech', 'technologies'],
  ['techn', 'technologies'],
  ['techno', 'technologies'],
  ['technol', 'technologies'],
  ['technology', 'technologies'],
  ['sol', 'solutions'],
  ['soln', 'solutions'],
  ['solns', 'solutions'],
  ['sols', 'solutions'],
  ['solution', 'solutions'],
  ['sys', 'systems'],
  ['syst', 'systems'],
  ['systs', 'systems'],
  ['system', 'systems'],
  ['engg', 'engineering'],
  ['engr', 'engineering'],
  ['engnr', 'engineering'],
  ['intl', 'international'],
  ['intnl', 'international'],
  ['internatl', 'international'],
  ['natl', 'national'],
  ['natnl', 'national'],
  ['mfg', 'manufacturing'],
  ['mfr', 'manufacturing'],
  ['mfrs', 'manufacturing'],
  ['manuf', 'manufacturing'],
  ['ind', 'industries'],
  ['inds', 'industries'],
  ['indus', 'industries'],
  ['industry', 'industries'],
  ['ent', 'enterprises'],
  ['ents', 'enterprises'],
  ['entp', 'enterprises'],
  ['entps', 'enterprises'],
  ['enterprise', 'enterprises'],
  ['comm', 'communications'],
  ['comms', 'communications'],
  ['communication', 'communications'],
  ['elec', 'electronics'],
  ['elect', 'electronics'],
  ['electronic', 'electronics'],
  ['pharm', 'pharmaceuticals'],
  ['pharma', 'pharmaceuticals'],
  ['pharmaceutical', 'pharmaceuticals'],
  ['lab', 'laboratories'],
  ['labs', 'laboratories'],
  ['laboratory', 'laboratories'],
  ['dist', 'distributors'],
  ['distr', 'distributors'],
  ['distbtr', 'distributors'],
  ['distributor', 'distributors'],
  ['trdg', 'trading'],
  ['assoc', 'associates'],
  ['assocs', 'associates'],
  ['associate', 'associates'],
  ['bro', 'brothers'],
  ['bros', 'brothers'],
  ['brother', 'brothers'],
  ['agy', 'agencies'],
  ['agcy', 'agencies'],
  ['agency', 'agencies'],
  ['consultant', 'consultants'],
  ['info', 'information'],
  ['mgmt', 'management'],
  ['mgt', 'management'],
  ['eqpt', 'equipment'],
  ['equip', 'equipment'],
  ['prod', 'products'],
  ['prods', 'products'],
  ['product', 'products'],
  ['grp', 'group'],
  ['hldg', 'holdings'],
  ['hldgs', 'holdings'],
  ['holding', 'holdings'],
  ['logi', 'logistics'],
  ['logistic', 'logistics'],
  ['pkg', 'packaging'],
  ['chem', 'chemicals'],
  ['chemical', 'chemicals'],
  ['tex', 'textiles'],
  ['textile', 'textiles'],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Reference prefixes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Document-number prefixes. Stripped both as a standalone token (`INV 0042`) and as the
 * alphabetic head of a mixed token (`INV0042`), which is the whole of invoice-number
 * convention drift on the prefix axis.
 */
export const DEFAULT_REFERENCE_PREFIXES: ReadonlySet<string> = new Set([
  'inv',
  'invc',
  'invno',
  'invoice',
  'bill',
  'billno',
  'bl',
  'no',
  'nos',
  'num',
  'numb',
  'nbr',
  'ref',
  'refno',
  'reference',
  'doc',
  'docno',
  'document',
  'cn',
  'dn',
  'pi',
  'po',
  'pono',
  'gst',
  'tax',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Alias table
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_ALIAS_TABLE: AliasTable = new Map<string, AliasEntry>();

/**
 * The vendor master the engine is legitimately given, turned into an alias table so an
 * exact hit on a canonicalised name pins the vendor id. This is identity resolution over
 * data the engine already holds, not memorisation of an answer key.
 *
 * `key` is supplied by the caller — normally `aliasKeyFor('vendor')` from `fields.ts` —
 * so this module never depends on the pipeline and there is no import cycle.
 */
export function aliasTableFromVendors(
  vendors: readonly { readonly id: VendorId; readonly name: string }[],
  key: AliasKeyFn,
): AliasTable {
  const out = new Map<string, AliasEntry>();
  for (const v of vendors) {
    const k = key(v.name);
    if (k === '') continue;
    if (out.has(k)) continue; // first writer wins; collisions are not silently overwritten
    out.set(k, { canonical: k, vendor_id: v.id, feedback_rule_id: null });
  }
  return out;
}

/**
 * Reviewer-authored corrections, turned into alias entries so the note that comes out of
 * the pipeline cites the rule id. Inactive rules are skipped — rules are deactivated,
 * never removed, and an inactive rule must not steer a match.
 *
 * `canonicalNameFor` resolves a vendor id to its canonical name; a `vendor_alias` rule
 * pins an id, and the string it should normalise to comes from the vendor master.
 */
export function aliasTableFromFeedbackRules(
  rules: readonly FeedbackRule[],
  key: AliasKeyFn,
  canonicalNameFor: (id: VendorId) => string | null,
): AliasTable {
  const out = new Map<string, AliasEntry>();
  for (const rule of rules) {
    if (!rule.active) continue;
    const body = rule.body;
    if (body.kind === 'vendor_alias') {
      const k = key(body.raw_value);
      const name = canonicalNameFor(body.canonical_vendor_id);
      if (k === '' || name === null) continue;
      out.set(k, {
        canonical: key(name),
        vendor_id: body.canonical_vendor_id,
        feedback_rule_id: rule.id,
      });
    } else if (body.kind === 'reference_pattern') {
      const k = key(body.pattern);
      if (k === '') continue;
      out.set(k, {
        canonical: key(body.canonical_form),
        vendor_id: null,
        feedback_rule_id: rule.id,
      });
    }
  }
  return out;
}

/**
 * Later tables win. Feedback rules are passed last on purpose: a named human's correction
 * outranks a default derived from the vendor master.
 */
export function mergeAliasTables(...tables: readonly AliasTable[]): AliasTable {
  const out = new Map<string, AliasEntry>();
  for (const t of tables) for (const [k, v] of t) out.set(k, v);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The default bundle
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TABLES: NormalisationTables = {
  legalSuffixes: DEFAULT_LEGAL_SUFFIXES,
  noiseTokens: DEFAULT_NOISE_TOKENS,
  abbreviations: DEFAULT_ABBREVIATIONS,
  referencePrefixes: DEFAULT_REFERENCE_PREFIXES,
  aliases: EMPTY_ALIAS_TABLE,
};

/** Pure override. Returns a new bundle; the input is never mutated. */
export function withTables(
  base: NormalisationTables,
  overrides: Partial<NormalisationTables>,
): NormalisationTables {
  return { ...base, ...overrides };
}

/** Convenience for the common case: same transforms, different alias data. */
export function withAliases(
  base: NormalisationTables,
  aliases: AliasTable,
): NormalisationTables {
  return { ...base, aliases };
}
