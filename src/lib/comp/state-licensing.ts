/**
 * state-licensing.ts — licensing basics shown on /salary/[role]/[state].
 *
 * HARD RULE: every fact here was read live on the official state board site
 * or on DANB's state requirements page (2026-10-19). If a detail could not
 * be verified it is left out (null), never guessed. Re-verify before adding
 * a state or editing a line; boards move pages often.
 *
 * Covered: the 7 largest dental hiring states. Other states simply don't
 * render the licensing section.
 */

export const LICENSING_VERIFIED_ON = "October 19, 2026";

export type LicensingBoard = {
  name: string;
  url: string;
  /** Who this board licenses, in plain English (as the site states it). */
  licenses: string;
};

export type StateLicensing = {
  /** Board for dentists (and, in most states, everyone else). */
  dentistBoard: LicensingBoard;
  /** Separate hygiene board where one exists (California). */
  hygienistBoard?: LicensingBoard;
  /** Official page describing hygienist licensure. */
  hygienistLicenseUrl: string | null;
  /** One-sentence paraphrase of the hygienist licensure path, or null if not verified. */
  hygienistRequirement: string | null;
  /** Assistant credentials the state issues or recognizes, by official title. */
  assistantCredentials: string[];
  /** Plain-English note on how assistant credentials work in this state. */
  assistantNote: string | null;
  /** Official page backing the assistant credential facts. */
  assistantSourceUrl: string;
  /** DANB state requirements page. */
  danbUrl: string;
};

const DANB = (slug: string) => `https://www.danb.org/state-requirements/detail/${slug}-state-requirements`;

export const STATE_LICENSING: Readonly<Record<string, StateLicensing>> = {
  CA: {
    dentistBoard: { name: "Dental Board of California", url: "https://www.dbc.ca.gov", licenses: "dentists and dental assistants (RDA and RDAEF)" },
    hygienistBoard: { name: "Dental Hygiene Board of California", url: "https://www.dhbc.ca.gov", licenses: "dental hygienists (RDH and RDHAP)" },
    hygienistLicenseUrl: "https://www.dhbc.ca.gov/applicants/index.shtml",
    hygienistRequirement: null,
    assistantCredentials: ["Registered Dental Assistant (RDA)", "Registered Dental Assistant in Extended Functions (RDAEF)"],
    assistantNote: "California licenses assistants through the Dental Board of California. DANB also lists orthodontic assistant and dental sedation assistant permits.",
    assistantSourceUrl: "https://www.dbc.ca.gov",
    danbUrl: DANB("california"),
  },
  TX: {
    dentistBoard: { name: "Texas State Board of Dental Examiners (TSBDE)", url: "https://tsbde.texas.gov", licenses: "dentists, dental hygienists and dental assistants" },
    hygienistLicenseUrl: "https://tsbde.texas.gov/licensing/hygienists/hygienist-license-by-exam/",
    hygienistRequirement: "Graduate from a CODA-accredited program, pass the National Board Dental Hygiene Examination (NBDHE), and pass a regional clinical exam (the board currently accepts ADEX and CRDTS-SRTA) dated within seven years of applying.",
    assistantCredentials: ["Registered Dental Assistant (RDA)"],
    assistantNote: "Texas registers dental assistants (RDA) through the TSBDE. It does not issue a separately named expanded-function license.",
    assistantSourceUrl: "https://tsbde.texas.gov/licensing/dental-assistants/registered-dental-assistant-x-ray-certification/",
    danbUrl: DANB("texas"),
  },
  FL: {
    dentistBoard: { name: "Florida Board of Dentistry", url: "https://floridasdentistry.gov", licenses: "dentists, dental hygienists and dental radiographers" },
    hygienistLicenseUrl: "https://floridasdentistry.gov/dental-hygienist/",
    hygienistRequirement: "Graduate from a board-approved or CODA-accredited program, then pass the NBDHE, the ADEX dental hygiene exam and the Florida Laws and Rules exam.",
    assistantCredentials: [],
    assistantNote: "Florida has no individual dental assistant license. The Board approves expanded duties programs, which issue certificates of completion.",
    assistantSourceUrl: "https://floridasdentistry.gov/expanded-duties-programs/",
    danbUrl: DANB("florida"),
  },
  NY: {
    dentistBoard: { name: "New York State Education Department, Office of the Professions (State Board for Dentistry)", url: "https://www.op.nysed.gov/professions/dentistry", licenses: "dentists, dental hygienists and registered dental assistants" },
    hygienistLicenseUrl: "https://www.op.nysed.gov/professions/dental-hygienists/license-requirements",
    hygienistRequirement: "Complete a New York-registered or ADA-accredited dental hygiene program plus required child abuse and infection control training, then pass the NBDHE and a clinical exam.",
    assistantCredentials: ["Registered Dental Assistant (RDA)"],
    assistantNote: "New York requires a license to use the Registered Dental Assistant title.",
    assistantSourceUrl: "https://www.op.nysed.gov/professions/registered-dental-assistants/license-requirements",
    danbUrl: DANB("new-york"),
  },
  PA: {
    dentistBoard: { name: "Pennsylvania State Board of Dentistry", url: "https://www.pa.gov/agencies/dos/department-and-offices/bpoa/boards-commissions/dentistry", licenses: "dentists, dental hygienists, public health dental hygiene practitioners and EFDAs" },
    hygienistLicenseUrl: "https://www.pa.gov/agencies/dos/department-and-offices/bpoa/boards-commissions/dentistry/dental-hygienist-licensure-snapshot",
    hygienistRequirement: "Complete an accredited dental hygiene program (at least an associate degree), then pass the NBDHE and a board-accepted clinical exam such as ADEX, CDCA, CRDTS or WREB.",
    assistantCredentials: ["Expanded Function Dental Assistant (EFDA)"],
    assistantNote: "Pennsylvania certifies EFDAs after a board-approved program and a written exam.",
    assistantSourceUrl: "https://www.pa.gov/agencies/dos/department-and-offices/bpoa/boards-commissions/dentistry/dental-assistant-licensure-snapshot",
    danbUrl: DANB("pennsylvania"),
  },
  IL: {
    dentistBoard: { name: "Illinois Department of Financial and Professional Regulation (IDFPR), Board of Dentistry", url: "https://idfpr.illinois.gov/profs/dentist.html", licenses: "dentists and registered dental hygienists" },
    hygienistLicenseUrl: "https://idfpr.illinois.gov/profs/dentist.html",
    hygienistRequirement: null,
    assistantCredentials: ["Dental Assistant Qualified in Expanded Functions", "Expanded Functions Dental Assistant"],
    assistantNote: "Illinois does not license dental assistants through IDFPR. DANB lists the expanded-function qualifications Illinois recognizes.",
    assistantSourceUrl: DANB("illinois"),
    danbUrl: DANB("illinois"),
  },
  OH: {
    dentistBoard: { name: "Ohio State Dental Board", url: "https://dental.ohio.gov", licenses: "dentists, dental hygienists and dental auxiliaries" },
    hygienistLicenseUrl: "https://dental.ohio.gov/licensing-and-renewal/002-dental-hygienist",
    hygienistRequirement: "Graduate from a CODA-accredited dental hygiene program and submit NBDHE scores plus regional clinical board scores from an approved testing agency such as ADEX.",
    assistantCredentials: ["Expanded Function Dental Auxiliary (EFDA)", "Dental Assistant Radiographer", "Coronal Polishing"],
    assistantNote: "Ohio's expanded-function credential is titled Expanded Function Dental Auxiliary (EFDA).",
    assistantSourceUrl: "https://dental.ohio.gov/licensing-and-renewal/005-expanded-function-dental-auxiliary",
    danbUrl: DANB("ohio"),
  },
};

export type RoleLicensing = {
  board: LicensingBoard;
  /** Official page the requirement/credential facts come from. */
  detailUrl: string | null;
  requirement: string | null;
  credentials: string[];
  note: string | null;
  danbUrl: string | null;
  faq: { q: string; a: string };
};

/**
 * Licensing facts relevant to one salary role in one state, or null when
 * the state (or role) isn't covered. Only hygienists, assistants and
 * dentists have verified entries.
 */
export function licensingForRole(roleSlug: string, stateCode: string, stateName: string): RoleLicensing | null {
  const L = STATE_LICENSING[stateCode];
  if (!L) return null;
  if (roleSlug === "hygienists") {
    const board = L.hygienistBoard ?? L.dentistBoard;
    return {
      board,
      detailUrl: L.hygienistLicenseUrl,
      requirement: L.hygienistRequirement,
      credentials: [],
      note: null,
      danbUrl: null,
      faq: {
        q: `Who licenses dental hygienists in ${stateName}?`,
        a: `The ${board.name}.${L.hygienistRequirement ? ` In short: ${L.hygienistRequirement.charAt(0).toLowerCase()}${L.hygienistRequirement.slice(1)}` : ""} Confirm current requirements on the board's website before you apply.`,
      },
    };
  }
  if (roleSlug === "dental-assistants") {
    const creds = L.assistantCredentials;
    return {
      board: L.dentistBoard,
      detailUrl: L.assistantSourceUrl,
      requirement: null,
      credentials: creds,
      note: L.assistantNote,
      danbUrl: L.danbUrl,
      faq: {
        q: `What credentials do dental assistants need in ${stateName}?`,
        a: `${L.assistantNote ?? ""}${creds.length ? ` Credentials to know: ${creds.join("; ")}.` : ""} Requirements depend on which duties you perform, so check the ${L.dentistBoard.name} and DANB's ${stateName} page for specifics.`.trim(),
      },
    };
  }
  if (roleSlug === "dentists") {
    return {
      board: L.dentistBoard,
      detailUrl: L.dentistBoard.url,
      requirement: null,
      credentials: [],
      note: null,
      danbUrl: null,
      faq: {
        q: `Who licenses dentists in ${stateName}?`,
        a: `The ${L.dentistBoard.name}. Confirm current requirements on the board's website before you apply.`,
      },
    };
  }
  return null;
}
