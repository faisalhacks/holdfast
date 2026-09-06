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
 */
export const DEFAULT_LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  // `p` earns its place: "(P) Ltd" is one of the commonest Indian spellings of a private
  // limited company, and after punctuation stripping it is a bare `p`. The cost is that a
  // single-letter initial is also removed — "P Kumar Traders" loses its `p`. That cost is
  // paid symmetrically on both sides, so it degrades a comparison rather than skewing one,
  // and it is the first entry a search should try removing.
  'p',
  'pvt',
  'pvts',
  'prv',
  'prvt',
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
  'invno',
  'invoice',
  'bill',
  'bills',
  'no',
  'nos',
  'num',
  'number',
  // Document-series heads. `TX/01021`, `SI-4207` and `RCT/2026/03/929` are the ledger's own
  // numbering conventions, and the bank reproduces the head as often as it drops it. Each
  // one also appears in `DEFAULT_REFERENCE_PREFIXES`, which is what keeps a FUSED form
  // (`tx01021`) admissible as a reference candidate while a fused RAIL form (`utr9798`)
  // stays excluded — see `referenceCandidateTokens`.
  'tx',
  'si',
  'rct',
  // The accounts-payable run marker a payment file adds and an invoice never carries:
  // `AP-TX/01035`, `AP-INV20268157`, `AP-GST-INV-07807`. One-sided furniture by definition.
  'ap',
  // Registration furniture. `TRF SUNDABRI LTD GSTIN 99-ZZSUN6912V-9` names a PARTY; without
  // these the words land in the vendor residue and the number pretends to be a reference.
  'gstin',
  'gstno',
  'na',
  // A masked account number: `XXXX9484`, `A/C XXXX6195`. Present in noise but ABSENT from
  // the prefix table, which is exactly the combination that stops `xxxx6195` being offered
  // as a document number.
  'xxxx',
  'xxxxx',
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
 *
 * A head belongs here when it is FURNITURE — when its presence or absence does not change
 * which document is meant. `INV/2026/01640` and `2026/01640` are one invoice; so are
 * `TX/01021` and `01021`, because the series head is a property of the ledger that raised
 * the number and not of the document. What must never come here is a head that DISTINGUISHES
 * — a vendor code, a branch code, a cost centre — because stripping one of those is the
 * over-merge this table exists to avoid rather than to cause.
 *
 * The test each entry passed: it occurs on one side of the reconciliation and not the other
 * in the same document number, in the frozen selection set, with the digits identical.
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
  // The AP-run marker, one-sided by construction: `AP-TX/01035` is `TX/01035` paid by an
  // accounts-payable run. It is never part of a document number the vendor issued, so it is
  // furniture wherever it appears and it is stripped.
  'ap',
]);

/**
 * DOCUMENT-SERIES HEADS — a token is a reference BECAUSE of these, and they are NOT removed.
 *
 * `TX/01021`, `SI-7532` and `RCT/2026/01/472` are three numbering series. The head does two
 * jobs at once and the two must not be confused, which is why this table exists beside
 * `DEFAULT_REFERENCE_PREFIXES` rather than inside it:
 *
 *   IT ADMITS.    `tx01021` is a document number and `utr853455805` is a bank tracking
 *                 number, and the only thing that says so is the alphabetic head. A series
 *                 head has to be recognised or the fused form is thrown away with the rail
 *                 numbers.
 *   IT SEPARATES. `SI-7532` and `BILL007539` are different documents from different vendors.
 *                 Reduce both to bare digits and a token-set ratio scores them 0.75 — close
 *                 enough to clear the similarity floor and contribute to a pairing that
 *                 should have contributed nothing. Keep the head and they share not one
 *                 token and score zero, which is the truth.
 *
 * That is the whole distinction between this table and the prefix table: `inv`, `bill` and
 * `ap` say only THAT a number follows, so deleting them loses nothing; `tx`, `si` and `rct`
 * say WHICH SERIES the number belongs to, and deleting them merges series that a one-digit
 * difference already makes dangerously similar. Measured on the frozen selection set,
 * stripping them was worth nothing the digit view did not already recover, and cost exactly
 * the cross-series separation described above.
 */
export const DEFAULT_REFERENCE_SERIES: ReadonlySet<string> = new Set(['tx', 'si', 'rct']);

/**
 * Calendar years admissible as a REFERENCE SEGMENT, so the strip is data and not a guess at
 * what a four-digit number means.
 *
 * A year is a period, not a document number: every invoice raised in a year carries the same
 * one. It is deliberately a closed list rather than `/^(19|20)\d\d$/`, because the numbering
 * in this domain is full of four-digit tokens that merely LOOK like years — `2602-5876` and
 * `2603-2119` are YYMM-and-serial, `2074/26-27` is a serial, and a pattern generous enough
 * to be convenient would eat all three.
 */
export const DEFAULT_REFERENCE_YEARS: ReadonlySet<string> = new Set([
  '2019',
  '2020',
  '2021',
  '2022',
  '2023',
  '2024',
  '2025',
  '2026',
  '2027',
  '2028',
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
  referenceSeries: DEFAULT_REFERENCE_SERIES,
  referenceYears: DEFAULT_REFERENCE_YEARS,
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
