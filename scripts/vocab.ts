// HOLDFAST — W02 generator. Invented vocabulary.
//
// EVERY name in this file is fabricated. No real company, vendor, bank, GST registration
// or account number appears anywhere in the generated dataset. The stems below are
// nonsense compounds chosen to read as plausible trade names without being any.
//
// GSTIN-style identifiers use state codes 97 and 99, which are administrative codes never
// issued to an ordinary trading registration, and a PAN block that always begins `ZZ`.
// The shape is right so a normaliser has something real to chew on; the value cannot
// collide with a registration that exists.

export const BUYER_STATE = '99';
export const VENDOR_STATES = ['99', '97'] as const;

/** Invented stems. Not surnames, not places, not trading names in use. */
export const VENDOR_STEMS: readonly string[] = [
  'Kavarti', 'Ombresa', 'Nirvath', 'Zephrik', 'Talpani', 'Durvaska', 'Ekthara', 'Movindra',
  'Palcheru', 'Rathovin', 'Sundabri', 'Tejmoura', 'Ulvanti', 'Varkhede', 'Wistala', 'Yamneth',
  'Zarkolin', 'Ashvarne', 'Bhorunda', 'Chandreth', 'Dhaviska', 'Elmoreth', 'Fenvarti', 'Girnaska',
  'Hastavel', 'Ilvantha', 'Jorbheda', 'Kesmarti', 'Lohvaneth', 'Mirthala', 'Nandvira', 'Orvaskar',
  'Pratheven', 'Quivandra', 'Roshtala', 'Savrindh', 'Thalveka', 'Ujwarith', 'Vandhrolo', 'Wexmiran',
  'Xanthavi', 'Yolbresh', 'Zumretha', 'Amberkot', 'Bhelvana', 'Cindraka', 'Dorvanth', 'Estrivan',
  'Fyrandel', 'Gholapse', 'Hurvanti', 'Iskarmel', 'Jhalvenu', 'Kruthana', 'Lomvarti', 'Mestrali',
];

export const VENDOR_TRADES: readonly string[] = [
  'Techworks', 'Industrial Supplies', 'Logistics', 'Engineering', 'Chemicals', 'Packaging',
  'Facilities', 'Consultancy', 'Software', 'Instruments', 'Fabricators', 'Textiles',
  'Polymers', 'Electricals', 'Auto Components', 'Printworks', 'Agro Products', 'Metalcraft',
  'Marine Services', 'Cold Chain', 'Analytics', 'Infra Projects', 'Toolroom', 'Adhesives',
];

export const VENDOR_SUFFIXES: readonly string[] = [
  'Pvt Ltd', 'Private Limited', 'LLP', 'Enterprises', 'Industries Pvt Ltd',
  'Solutions Pvt Ltd', 'Ltd', 'and Sons',
];

/**
 * How a bank narration abbreviates a word. Real narration is not a truncation of the
 * legal name; it is a clerk's shorthand, and it differs by rail and by remitting bank.
 */
export const ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ['Private Limited', 'PVT LTD'],
  ['Industries', 'IND'],
  ['Industrial', 'INDL'],
  ['Technologies', 'TECH'],
  ['Techworks', 'TECHWRKS'],
  ['Instruments', 'INSTR'],
  ['Fabricators', 'FAB'],
  ['Engineering', 'ENGG'],
  ['Consultancy', 'CONS'],
  ['Electricals', 'ELEC'],
  ['Components', 'COMP'],
  ['Enterprises', 'ENTP'],
  ['Printworks', 'PRNT'],
  ['Metalcraft', 'METAL'],
  ['Logistics', 'LOGI'],
  ['Packaging', 'PKG'],
  ['Chemicals', 'CHEM'],
  ['Facilities', 'FAC'],
  ['Solutions', 'SOLN'],
  ['Analytics', 'ANLY'],
  ['Adhesives', 'ADHV'],
  ['Cold Chain', 'CLDCHN'],
  ['Marine Services', 'MRN SVC'],
  ['Auto Components', 'AUTO COMP'],
  ['Agro Products', 'AGRO'],
  ['Infra Projects', 'INFRA'],
  ['Supplies', 'SUP'],
  ['Software', 'SW'],
  ['Textiles', 'TEXT'],
  ['Polymers', 'POLY'],
  ['Services', 'SVCS'],
  ['Products', 'PROD'],
  ['Projects', 'PROJ'],
  ['Toolroom', 'TLRM'],
  ['Private', 'PVT'],
  ['Limited', 'LTD'],
  ['and Sons', '& SONS'],
  ['and', '&'],
];

/**
 * Invoice-numbering conventions. Vendors do not agree on one, which is half the reason
 * reference matching is hard; the other half is that the bank rewrites whichever one
 * they picked.
 */
export const REFERENCE_CONVENTIONS: readonly string[] = [
  'INV/{Y}/{N5}',
  'SI-{N4}',
  '{YY}{MM}-{N4}',
  'TX/{N5}',
  'BILL{N6}',
  '{N4}/{YY}-{YY1}',
  'GST-INV-{N5}',
  'RCT/{Y}/{MM}/{N3}',
  'INV{Y}{N4}',
  '{ST}/INV/{N5}',
];

/** Free-text fragments a clerk types into a remittance field. Pure noise. */
export const NOISE_FRAGMENTS: readonly string[] = [
  'PYMT',
  'SETTLEMENT',
  'FULL AND FINAL',
  'PART PYMT',
  'AGAINST BILL',
  'VENDOR PAYOUT',
  'AP RUN',
  'SUPPLIER SETTLE',
  'REM ADV ATTACHED',
  'NO ADVICE',
];

export const RAIL_PREFIXES: readonly string[] = ['NEFT', 'RTGS', 'IMPS', 'ACH DR', 'UPI', 'INWARD CLG'];
