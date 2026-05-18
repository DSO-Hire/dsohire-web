/**
 * Discrimination filter for employer-authored screening questions.
 *
 * Pre-launch safety net (Cam-locked 2026-05-18, sensitive-data sweep item 8).
 * Scans the question prompt, helper text, and answer-option labels for
 * language that asks about protected attributes under federal employment
 * discrimination law (Title VII, ADEA, ADA, GINA, etc.) plus a few state-
 * law-protected attributes that show up frequently in dental hiring.
 *
 * Philosophy:
 *   - BLOCK clear-cut protected-attribute queries with a constructive error
 *     that names the category and suggests a job-relevant alternative.
 *   - Allow legally-permissible variants. "Are you authorized to work in
 *     the US?" is fine; "Are you a US citizen?" is not. "Are you 18+?" is
 *     fine (minimum age); "How old are you?" is not.
 *   - This is a safety net, not a complete legal review. Recruiters writing
 *     borderline questions should still consult counsel.
 *
 * Companion of:
 *   - rejection-reason-action.ts — AI guardrails on REJECTION text generation
 *   - feedback_legal_shield_default_posture.md — platform-wide posture
 *   - project_sensitive_data_sweep_pending.md — item 8
 */

export interface ScreeningQuestionLike {
  prompt: string;
  helper_text?: string | null;
  options?: Array<{ id: string; label: string }> | null;
}

export type DiscriminationScanResult =
  | { ok: true }
  | {
      ok: false;
      /** Short category name, e.g. "Age", "National origin". */
      category: string;
      /** Which field in the question hit the filter. */
      fieldName: string;
      /** The exact substring that matched, lower-cased. */
      matchedPhrase: string;
      /** A short, constructive suggestion for the recruiter. */
      suggestion: string;
    };

/**
 * A category of protected-attribute language. Each category has:
 *   - patterns: array of RegExp matchers (case-insensitive, word-boundary
 *     safe). If any matches the text, the category is flagged.
 *   - allowList: array of RegExp matchers for permissible phrasings that
 *     would otherwise look like a hit. Tested FIRST — if any allow-list
 *     pattern matches, the text is considered safe regardless of the
 *     block patterns. This is how we permit legal variants like "18 or
 *     older" while blocking "what is your age."
 *   - suggestion: drop-in replacement guidance shown to the recruiter.
 */
interface Category {
  category: string;
  patterns: RegExp[];
  allowList?: RegExp[];
  suggestion: string;
}

const CATEGORIES: Category[] = [
  {
    category: "Age",
    // "How old", "what is your age", "year of birth", "date of birth",
    // "DOB", "what year were you born". Excludes 18+/21+ minimum-age phrasings
    // via allow-list.
    patterns: [
      /\bhow\s+old\b/i,
      /\b(your|the\s+candidate'?s|applicant'?s)\s+age\b/i,
      /\bage\s*(of|range|bracket|group)\b/i,
      /\bdate\s+of\s+birth\b/i,
      /\bd\.?o\.?b\.?\b/i,
      /\byear\s+(you|of)\s+(were\s+)?born\b/i,
      /\bwhat\s+year\s+were\s+you\s+born\b/i,
      // Age-bracket phrasings — require explicit age context to avoid
      // false-positives on dental KPIs like "over 40 implants per year"
      // or "under 50 patients per day."
      /\b(over|under)\s+(40|50|60)\s+(years?\s+old|years?\s+of\s+age)\b/i,
      /\bgeneration\s+(z|y|x|millennial|boomer)\b/i,
    ],
    allowList: [
      // Minimum-age phrasings — legal because they don't ask FOR the age,
      // they ask WHETHER the candidate clears a legal threshold.
      /\b(at\s+least|18\s*\+|21\s*\+|18\s+or\s+older|21\s+or\s+older|legal\s+age)\b/i,
      /\bare\s+you\s+(at\s+least\s+)?(18|19|20|21)\b/i,
    ],
    suggestion:
      "Ask about years of experience in the role or specific certifications instead. Age itself is protected.",
  },
  {
    category: "Sex / gender",
    patterns: [
      /\b(your|applicant'?s|candidate'?s)\s+(gender|sex)\b/i,
      /\bwhat\s+(is\s+)?your\s+(gender|sex)\b/i,
      /\bare\s+you\s+(male|female|a\s+man|a\s+woman|non[-\s]?binary)\b/i,
      /\b(male|female)\s+only\b/i,
      /\bpregnan(t|cy)\b/i,
      /\bplanning\s+to\s+(have|start)\s+(a\s+)?(family|children|kids|baby)\b/i,
      /\bgender\s+identity\b/i,
      /\b(your|preferred)\s+pronouns?\b/i,
    ],
    suggestion:
      "Gender, sex, and pronouns are protected — candidates can disclose them voluntarily on their profile, but you shouldn't screen on them. Ask about role-relevant skills instead.",
  },
  {
    category: "Sexual orientation",
    patterns: [
      /\bsexual\s+orientation\b/i,
      /\bare\s+you\s+(gay|straight|lesbian|bisexual|queer|lgbtq?\+?)\b/i,
      /\b(homo|hetero)sexual\b/i,
    ],
    suggestion:
      "Sexual orientation is protected under federal civil rights law (Bostock v. Clayton County). Don't ask in screening — ask about job-relevant skills instead.",
  },
  {
    category: "Race / ethnicity",
    patterns: [
      /\b(your|applicant'?s|candidate'?s)\s+(race|ethnicity)\b/i,
      /\bwhat\s+(is\s+)?your\s+(race|ethnicity)\b/i,
      /\bare\s+you\s+(white|black|asian|hispanic|latino|latina|latinx|african|caucasian)\b/i,
      /\bracial\s+background\b/i,
      /\bethnic\s+background\b/i,
    ],
    suggestion:
      "Race and ethnicity are protected under Title VII. Don't screen on them. If language ability is job-relevant, ask 'Do you speak [language] at a professional level?' directly.",
  },
  {
    category: "National origin",
    // "Where are you from", "country of origin", "your nationality",
    // "are you a US citizen" — but "are you authorized to work in the US"
    // is fine (allow-listed).
    patterns: [
      /\bwhere\s+(are|were)\s+you\s+(from|born)\b/i,
      /\bcountry\s+of\s+(origin|birth)\b/i,
      /\b(your|the)\s+nationality\b/i,
      /\bnative\s+(country|land)\b/i,
      /\bplace\s+of\s+birth\b/i,
      /\bare\s+you\s+a\s+(us|u\.s\.|american)\s+citizen\b/i,
      /\bcitizenship\s+status\b/i,
      /\bfirst\s+language\b/i,
      /\bmother\s+tongue\b/i,
      /\bnative\s+(language|speaker|tongue)\b/i,
      /\bprimary\s+language\b/i,
    ],
    allowList: [
      // Work authorization is legal and standard. Distinguish from
      // citizenship: authorized != citizen.
      /\b(authorized|eligible|legally\s+able)\s+to\s+work\b/i,
      /\bwork\s+authorization\b/i,
      /\bvisa\s+sponsorship\b/i,
    ],
    suggestion:
      "National origin and citizenship are protected. Use 'Are you legally authorized to work in the US?' or 'Will you require visa sponsorship?' — both legal under federal law.",
  },
  {
    category: "Religion",
    patterns: [
      /\b(your|applicant'?s|candidate'?s)\s+religion\b/i,
      /\bwhat\s+(is\s+)?your\s+religion\b/i,
      /\breligious\s+(affiliation|background|beliefs?|denomination|practices?)\b/i,
      /\bare\s+you\s+(christian|catholic|protestant|muslim|jewish|hindu|buddhist|sikh|atheist|agnostic)\b/i,
      /\bobserv(e|ing)\s+(the\s+)?(sabbath|shabbat|ramadan)\b/i,
      /\bchurch\s+attend(ance|ing)\b/i,
    ],
    suggestion:
      "Religion is protected under Title VII. If schedule needs are the concern, ask 'Are you available for the Saturday rotation?' or 'Can you work the schedule listed in the job posting?' directly.",
  },
  {
    category: "Marital / family status",
    patterns: [
      /\bare\s+you\s+(married|single|divorced|widowed|engaged)\b/i,
      /\bmarital\s+status\b/i,
      /\b(your|the\s+candidate'?s|applicant'?s)\s+(spouse|husband|wife|partner)\b/i,
      /\bdo\s+you\s+have\s+(kids|children|a\s+family|dependents)\b/i,
      /\b(number|how\s+many)\s+of\s+(kids|children|dependents)\b/i,
      /\bchildcare\s+(arrangements?|coverage)\b/i,
      /\bplans?\s+to\s+(marry|have\s+kids|have\s+children|start\s+a\s+family)\b/i,
    ],
    suggestion:
      "Marital and family status are protected in most states. If you're trying to gauge schedule reliability, ask about availability directly: 'Are you able to commit to the schedule listed in this posting?'",
  },
  {
    category: "Disability / medical",
    patterns: [
      /\bare\s+you\s+disabled\b/i,
      /\bdo\s+you\s+have\s+(a\s+)?disabilit(y|ies)\b/i,
      /\bdisability\s+status\b/i,
      /\b(your|the\s+candidate'?s|applicant'?s)\s+(medical\s+conditions?|health\s+conditions?|disabilit(y|ies))\b/i,
      /\bchronic\s+(illness|condition)\b/i,
      /\bmental\s+(illness|health\s+history)\b/i,
      /\bever\s+been\s+(treated|diagnosed)\s+for\b/i,
      /\bdo\s+you\s+take\s+(medication|medicines)\b/i,
      /\bworkers?\s+comp(ensation)?\s+claims?\b/i,
    ],
    allowList: [
      // ADA-permissible: ability to perform essential job functions with
      // or without reasonable accommodation.
      /\bperform\s+the\s+essential\s+(job\s+)?functions?\b/i,
      /\bwith\s+or\s+without\s+(reasonable\s+)?accommodation\b/i,
      // Physical-requirement check tied to job duties is legal pre-offer
      // ("Can you stand for 6 hours?", "Can you lift 25 lb?")
      /\b(can|are\s+you\s+able\s+to)\s+(stand|lift|carry|sit|operate)\b/i,
    ],
    suggestion:
      "Disability and medical questions are restricted by ADA pre-offer. Ask about ability to perform specific job duties: 'Can you stand for 6 hours per day with breaks?' or use 'with or without reasonable accommodation' phrasing.",
  },
  {
    category: "Veteran / military status",
    patterns: [
      /\bare\s+you\s+a\s+veteran\b/i,
      /\bveteran\s+status\b/i,
      /\bmilitary\s+(service\s+record|discharge|discharge\s+type|background)\b/i,
      /\btype\s+of\s+discharge\b/i,
    ],
    suggestion:
      "Veteran status is protected under USERRA. You may not ask about discharge type or military history. Voluntary self-identification on a candidate profile is fine; screening is not.",
  },
  {
    category: "Genetic information",
    patterns: [
      /\bfamily\s+(medical\s+history|health\s+history)\b/i,
      /\bgenetic\s+(test(s|ing)?|information|condition|disorder|markers?)\b/i,
      /\bher(e|i)dit(ar|y)\s+(disease|condition)\b/i,
    ],
    suggestion:
      "GINA prohibits collecting genetic information including family medical history. Don't ask in screening; defer any health-related screening to post-offer medical exams when legally permitted.",
  },
  {
    category: "Arrest record",
    // Convictions can be asked (with restrictions); arrest records cannot.
    patterns: [
      /\b(have\s+you\s+ever\s+been|were\s+you\s+ever)\s+arrested\b/i,
      /\barrest\s+(record|history)\b/i,
    ],
    suggestion:
      "Arrest records (as opposed to convictions) cannot legally be the basis for hiring decisions in most jurisdictions. If criminal background is relevant, defer to a post-offer background check (handled by Checkr in Phase 5G.e).",
  },
];

/**
 * Scan a single screening question for protected-attribute language.
 *
 * Returns the first hit found — we stop at the first match so the
 * recruiter sees one actionable error at a time, not a wall of issues.
 * If they fix that one and resubmit and hit another, fine; that's the
 * exact same UX as the rest of our server-side validation.
 */
export function scanScreeningQuestionForBias(
  question: ScreeningQuestionLike
): DiscriminationScanResult {
  const fields: Array<{ name: string; text: string }> = [
    { name: "the question prompt", text: question.prompt ?? "" },
    { name: "the helper text", text: question.helper_text ?? "" },
  ];
  for (const opt of question.options ?? []) {
    fields.push({
      name: `answer option "${opt.label}"`,
      text: opt.label ?? "",
    });
  }

  for (const field of fields) {
    const text = field.text;
    if (!text || text.length < 3) continue;
    for (const category of CATEGORIES) {
      if (category.allowList?.some((re) => re.test(text))) {
        // Permissible variant — skip this category entirely for this field.
        continue;
      }
      for (const pattern of category.patterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            ok: false,
            category: category.category,
            fieldName: field.name,
            matchedPhrase: match[0].toLowerCase(),
            suggestion: category.suggestion,
          };
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Convenience: format a scan failure as a user-facing error string.
 * Caller can return this directly in a server-action error response.
 */
export function formatBiasError(
  questionNumber: number,
  result: Extract<DiscriminationScanResult, { ok: false }>
): string {
  return `Question ${questionNumber}: ${result.fieldName} contains language that may be unlawful to screen on (${result.category} — "${result.matchedPhrase}"). ${result.suggestion}`;
}
