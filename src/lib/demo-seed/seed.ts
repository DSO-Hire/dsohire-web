/**
 * Demo-seed orchestration — turns the static catalogs (data.ts) into a rich,
 * believable, fully demo-marked dataset. Shared by scripts/seed-demo.ts (the
 * committed reseed) AND the founder-gated /admin "Reset demo data" button, so
 * "reset" and "re-run the script" are literally the same code path.
 *
 * Idempotent: wipes the demo_v1 set first, then inserts fresh. Re-running
 * yields the same shape (stable slugs/emails; deterministic PRNG).
 *
 * P0 guardrails honored here: everything fictional; EEO never seeded; the
 * visibility/consent spread is real (anonymous-discoverable is the plurality);
 * every .select() lists the columns it reads.
 */

import {
  SEED_BATCH,
  SEED_BATCH_KEY,
  type Supa,
  publicImageUrl,
  demoAvatarPath,
  insertRows,
  makeRng,
  pick,
  daysAgo,
  dateOffset,
  nameSlug,
} from "./constants";
import { METROS, type MetroKey } from "./geo";
import {
  DEMO_DSOS,
  HERO_SLUG,
  HEADSHOT_PERSONAS,
  FIRST_NAMES,
  LAST_NAMES,
  GENERATED_ARCHETYPE_MIX,
  CANDIDATE_METROS,
  CANDIDATE_ARCHETYPES,
  JOB_ARCHETYPES,
  type DemoDsoDef,
  type JobArchetype,
  type Visibility,
} from "./data";
import { cleanupLegacyDemoData, wipeDemoSeed } from "./wipe";
import {
  ensureDemoAuthUsers,
  ensureAuthUser,
  loadAuthUserMap,
  type DemoLoginSpec,
  type ProvisionedLogin,
} from "./auth";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";

/** Email for a passwordless candidate profile account. */
function candidateEmail(slug: string): string {
  return `${slug}@demo-candidate.dsohire.com`;
}

export interface SeedOptions {
  supabaseUrl: string;
  now?: Date;
  /** Run the one-time legacy junk purge (script first run). Admin reset = false. */
  cleanupLegacy?: boolean;
  log?: (msg: string) => void;
}

export interface SeedResult {
  logins: ProvisionedLogin[];
  counts: Record<string, number>;
  heroSlug: string;
  twoSidedPair: { candidate: string; employerEmail: string; candidateEmail: string };
}

/* ──────────────────────────────────────────────────────────────
 * small insert helpers (untyped clients)
 * ─────────────────────────────────────────────────────────── */

async function insertOne(supa: Supa, table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await supa.from(table).insert(row as never).select("id").single();
  if (error || !data) throw new Error(`[demo-seed] insert ${table} failed: ${error?.message ?? "no row"}`);
  return (data as { id: string }).id;
}

async function insertReturning(
  supa: Supa,
  table: string,
  rows: Record<string, unknown>[],
  cols = "id"
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supa.from(table).insert(rows as never).select(cols);
  if (error || !data) throw new Error(`[demo-seed] insert ${table} (returning) failed: ${error?.message ?? "no rows"}`);
  return data as unknown as Record<string, unknown>[];
}

/* ──────────────────────────────────────────────────────────────
 * captured runtime state
 * ─────────────────────────────────────────────────────────── */

interface DsoCtx {
  def: DemoDsoDef;
  id: string;
  stageByKind: Record<string, string>;
  locationIds: string[];
  ownerDsoUserId: string;
  recruiterDsoUserId: string | null;
  ownerAuthId: string;
}

interface CandidateCtx {
  id: string;
  slug: string;
  first: string;
  last: string;
  archetype: string;
  metro: MetroKey;
  visibility: Visibility;
  authUserId: string | null;
}

interface JobCtx {
  id: string;
  dsoId: string;
  archetype: JobArchetype;
  firstScreeningQId: string | null;
}

/* ──────────────────────────────────────────────────────────────
 * main
 * ─────────────────────────────────────────────────────────── */

export async function runDemoSeed(supa: Supa, opts: SeedOptions): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const counts: Record<string, number> = {};
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

  if (opts.cleanupLegacy) {
    const c = await cleanupLegacyDemoData(supa);
    log(`Legacy purge: removed ${c.dsos} DSOs, ${c.candidates} candidates`);
  }
  const w = await wipeDemoSeed(supa);
  log(`Wiped prior demo set: ${w.dsos} DSOs, ${w.candidates} candidates`);

  // ── Logins ──────────────────────────────────────────────────────────────
  const loginSpecs: DemoLoginSpec[] = [];
  for (const d of DEMO_DSOS) {
    loginSpecs.push({ local: d.owner.emailLocal, fullName: `${d.owner.firstName} ${d.owner.lastName}`, kind: "employer", tierOrRole: `${d.tier} — ${d.name}` });
    if (d.recruiter) {
      loginSpecs.push({ local: d.recruiter.emailLocal, fullName: `${d.recruiter.firstName} ${d.recruiter.lastName}`, kind: "employer", tierOrRole: `${d.tier} recruiter — ${d.name}` });
    }
  }
  loginSpecs.push({ local: "candidate.maria", fullName: "Maria Lopez", kind: "candidate", tierOrRole: "Two-sided pair (anonymous-discoverable)" });
  loginSpecs.push({ local: "candidate.jordan", fullName: "Jordan Bailey", kind: "candidate", tierOrRole: "Named / applied candidate" });

  const authMap = await loadAuthUserMap(supa);
  const logins = await ensureDemoAuthUsers(supa, authMap, loginSpecs);
  const authByLocal = new Map(logins.map((l) => [l.local, l.authUserId]));
  log(`Provisioned ${logins.length} demo logins`);

  // Every candidate needs a non-guest auth account (discovery filters guests).
  // Login candidates reuse their login account; the rest are passwordless.
  const planned = planCandidates();
  const candidateAuthBySlug = new Map<string, string>();
  for (const p of planned) {
    if (p.authLocal) {
      candidateAuthBySlug.set(p.slug, authByLocal.get(p.authLocal)!);
      continue;
    }
    const id = await ensureAuthUser(supa, authMap, candidateEmail(p.slug), null, {
      full_name: `${p.first} ${p.last}`,
      [SEED_BATCH_KEY]: SEED_BATCH,
      role_during_signup: "candidate",
    });
    candidateAuthBySlug.set(p.slug, id);
  }
  log(`Provisioned ${candidateAuthBySlug.size} candidate accounts`);

  // ── DSOs + locations + users + subscriptions ──────────────────────────────
  const dsoCtxBySlug = new Map<string, DsoCtx>();
  for (const def of DEMO_DSOS) {
    const ownerAuthId = authByLocal.get(def.owner.emailLocal)!;
    const dsoId = await insertOne(supa, "dsos", {
      name: def.name,
      legal_name: def.legalName,
      slug: def.slug,
      status: "active",
      is_demo: true,
      seed_batch: SEED_BATCH,
      description: def.description,
      mission: def.mission,
      brand_color: def.brandColor,
      culture_chips: def.cultureChips,
      patient_populations: def.patientPopulations,
      headquarters_city: METROS[def.hqMetro].city,
      headquarters_state: METROS[def.hqMetro].state,
      practice_count: def.practiceCount,
      affiliation_reveal_policy: "per_application",
      corporate_affiliation_policy: "permissive",
      // logo_url left null — DSO surfaces fall back to a brand_color initials
      // mark. (The public-images bucket rejects SVG uploads, and we don't ship
      // a raster encoder in the seed; brand_color carries the visual identity.)
      logo_url: null,
      practice_pace: def.practice.practice_pace,
      autonomy_level: def.practice.autonomy_level,
      mentorship_offered: def.practice.mentorship_offered,
      practice_feel: def.practice.practice_feel,
      ce_support: def.practice.ce_support,
      work_life_balance: def.practice.work_life_balance,
      practice_profile_completed_at: daysAgo(now, 40),
      created_at: daysAgo(now, 120),
    });
    bump("dsos");

    // The dsos_seed_pipeline_stages trigger created the canonical 7 stages.
    const { data: stageRows, error: stageErr } = await supa
      .from("dso_pipeline_stages")
      .select("id, kind")
      .eq("dso_id", dsoId);
    if (stageErr) throw new Error(`[demo-seed] read stages failed: ${stageErr.message}`);
    const stageByKind: Record<string, string> = {};
    for (const r of (stageRows ?? []) as { id: string; kind: string }[]) stageByKind[r.kind] = r.id;

    // Locations.
    const locRows = def.locations.map((l, i) => {
      const m = METROS[l.metro];
      return {
        dso_id: dsoId,
        name: l.name,
        address_line1: `${100 + i * 7} Main St`,
        city: m.city,
        state: m.state,
        postal_code: m.zip,
        latitude: m.lat,
        longitude: m.lng,
        lat: m.lat,
        lng: m.lng,
        geocoded_at: daysAgo(now, 119),
        public_dso_affiliation: true,
      };
    });
    const insertedLocs = await insertReturning(supa, "dso_locations", locRows);
    const locationIds = insertedLocs.map((r) => r.id as string);
    bump("dso_locations", locationIds.length);

    // Users: owner (+ recruiter for hero).
    const ownerDsoUserId = await insertOne(supa, "dso_users", {
      auth_user_id: ownerAuthId,
      dso_id: dsoId,
      role: "owner",
      first_name: def.owner.firstName,
      last_name: def.owner.lastName,
      title: def.owner.title,
      bio: def.owner.bio ?? null,
      base_location_id: locationIds[0],
      preferred_timezone: "America/Denver",
    });
    bump("dso_users");
    let recruiterDsoUserId: string | null = null;
    if (def.recruiter) {
      const recAuthId = authByLocal.get(def.recruiter.emailLocal)!;
      recruiterDsoUserId = await insertOne(supa, "dso_users", {
        auth_user_id: recAuthId,
        dso_id: dsoId,
        role: "recruiter",
        first_name: def.recruiter.firstName,
        last_name: def.recruiter.lastName,
        title: def.recruiter.title,
        bio: def.recruiter.bio ?? null,
        base_location_id: locationIds[0],
        preferred_timezone: "America/Denver",
      });
      bump("dso_users");
    }

    // Subscription.
    await insertOne(supa, "subscriptions", {
      dso_id: dsoId,
      tier: def.tier,
      status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_price_id: null,
      current_period_start: daysAgo(now, 20),
      current_period_end: daysAgo(now, -340),
      cancel_at_period_end: false,
      seats_used: def.recruiter ? 2 : 1,
      listings_used: def.jobCount,
    });
    bump("subscriptions");

    dsoCtxBySlug.set(def.slug, {
      def,
      id: dsoId,
      stageByKind,
      locationIds,
      ownerDsoUserId,
      recruiterDsoUserId,
      ownerAuthId,
    });
  }
  log(`Inserted ${counts.dsos} DSOs with locations, users, subscriptions`);

  // ── Candidates ────────────────────────────────────────────────────────────
  const candidates = await seedCandidates(supa, now, opts.supabaseUrl, planned, candidateAuthBySlug, bump);
  log(`Inserted ${candidates.length} candidates (+ child credentials)`);

  // ── Jobs ────────────────────────────────────────────────────────────────
  const jobsByDso = new Map<string, JobCtx[]>();
  for (const def of DEMO_DSOS) {
    const ctx = dsoCtxBySlug.get(def.slug)!;
    const jobs = await seedJobsForDso(supa, now, ctx, bump);
    jobsByDso.set(def.slug, jobs);
  }
  log(`Inserted ${counts.jobs} jobs across DSOs`);

  // ── Applications + live pipeline (hero-heavy) ─────────────────────────────
  const heroCtx = dsoCtxBySlug.get(HERO_SLUG)!;
  const heroJobs = jobsByDso.get(HERO_SLUG)!;
  const seenPairs = new Set<string>();
  await seedPipeline(supa, now, heroCtx, heroJobs, candidates, bump, seenPairs);
  // a few cross-DSO applications (so cross-DSO reveal demos)
  await seedCrossDsoApplications(supa, now, dsoCtxBySlug, jobsByDso, candidates, bump, seenPairs);
  log(`Inserted applications + pipeline (${counts.applications ?? 0} apps)`);

  // ── Sourcing (talent pool, prospect thread, outreach) ─────────────────────
  await seedSourcing(supa, now, heroCtx, candidates, bump);
  log(`Inserted sourcing rows (talent pool + prospect thread + outreach)`);

  // ── Analytics (backdated Vantage) ─────────────────────────────────────────
  await seedAnalytics(supa, now, heroCtx, heroJobs, bump);
  log(`Inserted ${counts.analytics_events ?? 0} analytics events + view/start events`);

  // ── Fit pre-warm ──────────────────────────────────────────────────────────
  const warmed = await prewarmFit(supa, heroCtx, heroJobs, candidates, log);
  bump("practice_fit_scores", warmed);
  log(`Pre-warmed ${warmed} PracticeFit/DSOFit scores`);

  const heroOwner = logins.find((l) => l.local === "bridgeway.owner")!;
  return {
    logins,
    counts,
    heroSlug: HERO_SLUG,
    twoSidedPair: {
      candidate: "Maria Lopez",
      employerEmail: heroOwner.email,
      candidateEmail: logins.find((l) => l.local === "candidate.maria")!.email,
    },
  };
}

/* ──────────────────────────────────────────────────────────────
 * Candidates
 * ─────────────────────────────────────────────────────────── */

interface VisibilityCols {
  cv_visibility: string;
  anonymous_mode: boolean;
  contact_info_visibility: string;
  resume_visibility: string;
  practice_fit_consent: string;
  is_searchable: boolean;
}

function visibilityColumns(v: Visibility): VisibilityCols {
  if (v === "private") {
    return {
      cv_visibility: "hidden",
      anonymous_mode: false,
      contact_info_visibility: "after_apply",
      resume_visibility: "hidden",
      practice_fit_consent: "off",
      is_searchable: false,
    };
  }
  if (v === "named") {
    return {
      cv_visibility: "open_to_work",
      anonymous_mode: false,
      contact_info_visibility: "always",
      resume_visibility: "verified_dso_only",
      practice_fit_consent: "full",
      is_searchable: true,
    };
  }
  // anonymous-discoverable — the recommended plurality state
  return {
    cv_visibility: "recruiters_only",
    anonymous_mode: true,
    contact_info_visibility: "after_apply",
    resume_visibility: "after_apply",
    practice_fit_consent: "full",
    is_searchable: true,
  };
}

interface PlannedCandidate {
  slug: string;
  first: string;
  last: string;
  archetype: string;
  metro: MetroKey;
  visibility: Visibility;
  headshotFile: string | null;
  authLocal: string | null;
}

function planCandidates(): PlannedCandidate[] {
  const out: PlannedCandidate[] = [];
  const seenSlug = new Set<string>();
  const slugify = (f: string, l: string) => {
    const base = nameSlug(f, l);
    let s = base;
    let n = 2;
    while (seenSlug.has(s)) s = `${base}-${n++}`;
    seenSlug.add(s);
    return s;
  };

  // Headshot personas first (named/anonymous spread baked in).
  for (const p of HEADSHOT_PERSONAS) {
    const authLocal = p.first === "Maria" && p.last === "Lopez" ? "candidate.maria" : p.first === "Jordan" && p.last === "Bailey" ? "candidate.jordan" : null;
    out.push({
      slug: slugify(p.first, p.last),
      first: p.first,
      last: p.last,
      archetype: p.archetype,
      metro: p.metro,
      visibility: p.visibility,
      headshotFile: p.file,
      authLocal,
    });
  }

  // Generated candidates → ~70 total. Visibility weighted to anonymous (plurality).
  const rng = makeRng(424242);
  const target = 72;
  const visBag: Visibility[] = [
    "anonymous", "anonymous", "anonymous", "anonymous", "anonymous",
    "named", "named", "named",
    "private", "private",
  ];
  let fi = 0;
  let li = 0;
  while (out.length < target) {
    const first = FIRST_NAMES[fi % FIRST_NAMES.length];
    const last = LAST_NAMES[li % LAST_NAMES.length];
    fi += 1;
    if (fi % FIRST_NAMES.length === 0) li += 1;
    li += 1;
    const archetype = pick(rng, GENERATED_ARCHETYPE_MIX);
    const metro = pick(rng, CANDIDATE_METROS);
    const visibility = pick(rng, visBag);
    out.push({
      slug: slugify(first, last),
      first,
      last,
      archetype,
      metro,
      visibility,
      headshotFile: null,
      authLocal: null,
    });
  }
  return out;
}

async function seedCandidates(
  supa: Supa,
  now: Date,
  supabaseUrl: string,
  planned: PlannedCandidate[],
  candidateAuthBySlug: Map<string, string>,
  bump: (k: string, n?: number) => void
): Promise<CandidateCtx[]> {
  const rng = makeRng(99001);
  const ctxs: CandidateCtx[] = [];

  // child rows accumulate then bulk insert
  const workRows: Record<string, unknown>[] = [];
  const eduRows: Record<string, unknown>[] = [];
  const licenseRows: Record<string, unknown>[] = [];
  const certRows: Record<string, unknown>[] = [];
  const ceRows: Record<string, unknown>[] = [];

  let idx = 0;
  for (const p of planned) {
    const prof = CANDIDATE_ARCHETYPES[p.archetype] ?? CANDIDATE_ARCHETYPES.dentist;
    const m = METROS[p.metro];
    const vis = visibilityColumns(p.visibility);
    const years = prof.years[0] + Math.floor(rng() * (prof.years[1] - prof.years[0] + 1));
    const minSalary = prof.minSalary[0] + Math.round((rng() * (prof.minSalary[1] - prof.minSalary[0])) / 1000) * 1000;
    const authUserId = candidateAuthBySlug.get(p.slug)!;
    const avatarUrl = p.headshotFile ? publicImageUrl(supabaseUrl, demoAvatarPath(p.slug)) : null;

    const base: Record<string, unknown> = {
      seed_batch: SEED_BATCH,
      auth_user_id: authUserId,
      is_guest: false,
      first_name: p.first,
      last_name: p.last,
      // full_name is a generated column — never inserted.
      // auth path: email lives on the auth user (candidates.email stays null).
      email: null,
      headline: prof.headlineTpl,
      summary: `${prof.currentTitle} with ${years} years of experience. ${p.visibility === "anonymous" ? "Exploring quietly." : "Open to the right opportunity."}`,
      current_title: prof.currentTitle,
      years_experience: years,
      years_experience_dental: prof.track === "clinical" ? years : Math.max(0, years - 4),
      desired_roles: prof.desiredRoles,
      desired_specialty: prof.desiredSpecialty,
      desired_locations: [`${m.city}, ${m.state}`],
      desired_location_points: [{ label: `${m.city}, ${m.state}`, lat: m.lat, lng: m.lng }],
      current_location_city: m.city,
      current_location_state: m.state,
      current_location_zip: m.zip,
      license_states: prof.licenseType ? [m.state] : [],
      pms_systems: prof.pms,
      skills: prof.skills,
      languages: prof.languages,
      min_salary: minSalary,
      salary_unit: prof.salaryUnit,
      temp_or_perm: "perm",
      availability: pick(rng, ["immediate", "2_weeks", "1_month", "passive"] as const),
      dso_size_preference: prof.track === "corporate" ? "large" : "any",
      preferred_timezone: "America/Denver",
      profile_accent_color: pick(rng, ["#1F6FEB", "#2C7A7B", "#9C4221", "#2F855A", "#5A4FCF"] as const),
      privacy_choices_reviewed_at: daysAgo(now, 30 + Math.floor(rng() * 60)),
      avatar_url: avatarUrl,
      acquisition_channel: "demo",
      acquisition_source: "seed",
      created_at: daysAgo(now, 10 + Math.floor(rng() * 100)),
      ...vis,
    };

    // assessment signals
    if (prof.clinical) {
      const sig = { ...prof.clinical };
      // Natural spread so the talent pool shows a real distribution rather than
      // a wall of identical scores. The two-sided pair (Maria) is pinned to a
      // strong-but-imperfect profile so her marquee fit lands a credible ~97
      // (one culture notch off the hero's 'strong' mentorship) — genuine, not a
      // synthetic 100.
      const PACE = ["high_volume", "steady", "thorough"] as const;
      const AUTO = ["autonomy", "balance", "structure"] as const;
      const MENT = ["strong", "occasional", "independent"] as const;
      const FEEL = ["private", "midsize", "large"] as const;
      if (p.authLocal === "candidate.maria") {
        sig.mentorship_pref = "occasional";
      } else if (!p.authLocal) {
        if (rng() < 0.5) sig.work_pace = pick(rng, PACE);
        if (rng() < 0.45) sig.mentorship_pref = pick(rng, MENT);
        if (rng() < 0.45) sig.practice_feel = pick(rng, FEEL);
        if (rng() < 0.35) sig.autonomy_pref = pick(rng, AUTO);
        if (rng() < 0.3) sig.work_life_priority = 3 + Math.floor(rng() * 3);
      }
      Object.assign(base, sig, {
        assessment_completed_at: daysAgo(now, 5 + Math.floor(rng() * 40)),
        assessment_version: "v3",
        primary_fit_product: "practicefit",
      });
    }
    if (prof.corporate) {
      Object.assign(base, prof.corporate, {
        dsofit_assessment_completed_at: daysAgo(now, 5 + Math.floor(rng() * 40)),
        dsofit_skills: prof.skills,
        primary_fit_product: "dsofit",
        seniority_level: prof.corporate.seniority_level,
      });
    }

    const id = await insertOne(supa, "candidates", base);
    bump("candidates");
    ctxs.push({ id, slug: p.slug, first: p.first, last: p.last, archetype: p.archetype, metro: p.metro, visibility: p.visibility, authUserId });

    // ── child credentials for a believable subset ──
    // work history (1-2 roles) for clinical + corporate
    workRows.push({
      candidate_id: id,
      title: prof.currentTitle,
      company_name: pick(rng, ["Front Range Dental", "Cherry Creek Smiles", "Summit Family Dental", "Cascade Dental Care", "Evergreen Dental"] as const),
      is_current: true,
      is_dso: rng() > 0.5,
      start_date: dateOffset(now, -365 * Math.max(2, Math.floor(years / 2))),
      description: `${prof.currentTitle} responsibilities across ${prof.skills.slice(0, 3).join(", ")}.`,
      pms_systems_used: prof.pms,
      procedures_performed: prof.track === "clinical" ? prof.skills.slice(0, 3) : [],
    });
    if (years > 5) {
      workRows.push({
        candidate_id: id,
        title: prof.currentTitle.replace("Senior ", ""),
        company_name: pick(rng, ["Bright Dental", "Mile High Dental", "Lakeside Dental", "Pioneer Dental"] as const),
        is_current: false,
        is_dso: false,
        start_date: dateOffset(now, -365 * years),
        end_date: dateOffset(now, -365 * Math.max(2, Math.floor(years / 2)) - 30),
        description: "Earlier role.",
        pms_systems_used: prof.pms.slice(0, 1),
        procedures_performed: [],
      });
    }

    // education
    eduRows.push({
      candidate_id: id,
      school_name: pick(rng, ["University of Colorado School of Dental Medicine", "Marquette University", "Oregon Health & Science University", "University of the Pacific", "Midwestern University"] as const),
      degree: prof.licenseType === "RDH" ? "BS, Dental Hygiene" : prof.licenseType ? "DDS" : "BA, Business Administration",
      field_of_study: prof.track === "clinical" ? "Dentistry" : "Healthcare Administration",
      start_year: now.getFullYear() - years - 4,
      end_year: now.getFullYear() - years,
    });

    // licenses (clinical) — a few set to expiring/expired for credentialing beats
    if (prof.licenseType) {
      // idx 2,3 (Sarah, Michael) get an expiring/expired license; rest valid.
      let expires = dateOffset(now, 365 + Math.floor(rng() * 600));
      let status = "verified";
      if (idx === 2) { expires = dateOffset(now, 22); } // expiring imminent (<30d)
      else if (idx === 3) { expires = dateOffset(now, 51); } // expiring soon (<60d)
      else if (idx === 4) { expires = dateOffset(now, -14); status = "expired"; } // expired
      licenseRows.push({
        candidate_id: id,
        license_type: prof.licenseType,
        state: m.state,
        license_number: `${m.state}-${10000 + idx * 7}`,
        display_number: false,
        issued_date: dateOffset(now, -365 * Math.min(years, 6)),
        expires_date: expires,
        verification_status: status,
      });
    }

    // certifications
    for (const kind of prof.certKinds) {
      certRows.push({
        candidate_id: id,
        kind,
        issued_date: dateOffset(now, -400),
        expires_date: kind === "cpr_bls" ? dateOffset(now, 300) : null,
        verification_status: "unverified",
      });
    }

    // a CE certificate for some clinicians
    if (prof.track === "clinical" && rng() > 0.5) {
      ceRows.push({
        candidate_id: id,
        course_name: pick(rng, ["Clear Aligner Therapy", "Implant Restoration Update", "Medical Emergencies in the Dental Office", "Modern Endodontics"] as const),
        provider: "Spear Education",
        hours_credit: pick(rng, [2, 3, 6, 8] as const),
        category: "Clinical",
        completion_date: dateOffset(now, -120 - Math.floor(rng() * 200)),
        license_type: prof.licenseType ?? null,
      });
    }

    idx += 1;
  }

  await insertRows(supa, "candidate_work_history", workRows);
  await insertRows(supa, "candidate_education", eduRows);
  await insertRows(supa, "candidate_licenses", licenseRows);
  await insertRows(supa, "candidate_certifications", certRows);
  await insertRows(supa, "ce_certificates", ceRows);
  bump("candidate_credentials", workRows.length + eduRows.length + licenseRows.length + certRows.length + ceRows.length);

  return ctxs;
}

/* ──────────────────────────────────────────────────────────────
 * Jobs
 * ─────────────────────────────────────────────────────────── */

function jobPalette(def: DemoDsoDef): JobArchetype[] {
  const clinical = JOB_ARCHETYPES.filter((a) => a.scope !== "corporate" || a.role_category === "office_manager");
  if (def.jobPalette === "clinical_heavy") {
    return JOB_ARCHETYPES.filter((a) => ["associate_dentist", "associate_dentist_new_grad", "hygienist", "dental_assistant"].includes(a.key));
  }
  if (def.jobPalette === "enterprise") {
    return JOB_ARCHETYPES; // full spread incl. corporate
  }
  // balanced (hero + growth + riverstone): clinical + the two corporate roles
  return [...clinical, ...JOB_ARCHETYPES.filter((a) => a.scope === "corporate" && a.role_category !== "office_manager")];
}

async function seedJobsForDso(
  supa: Supa,
  now: Date,
  ctx: DsoCtx,
  bump: (k: string, n?: number) => void
): Promise<JobCtx[]> {
  const def = ctx.def;
  const palette = jobPalette(def);
  const rng = makeRng(def.slug.length * 7919 + def.practiceCount);
  const out: JobCtx[] = [];

  for (let i = 0; i < def.jobCount; i++) {
    const arch = palette[i % palette.length];
    // status spread: mostly active, with a couple draft/paused/filled
    const status = i === 0 ? "active" : i % 9 === 4 ? "draft" : i % 9 === 7 ? "paused" : i % 11 === 10 ? "filled" : "active";
    const postedDaysAgo = 3 + Math.floor(rng() * 75);
    const jobId = await insertOne(supa, "jobs", {
      dso_id: ctx.id,
      title: arch.title,
      slug: `${def.slug}-${arch.key}-${i + 1}`,
      description: arch.description,
      requirements: arch.requirements,
      role_category: arch.role_category,
      employment_type: arch.employment_type,
      scope: arch.scope,
      visibility: "public",
      status,
      specialty: arch.specialty,
      benefits: arch.benefits,
      min_years_experience: arch.minYears,
      schedule_days: arch.scheduleDays,
      schedule_evenings: arch.evenings,
      schedule_weekends: arch.weekends,
      corporate_function: arch.corporate_function ?? null,
      authority_level: arch.authority_level ?? null,
      work_mode: arch.work_mode ?? null,
      travel_expectation: arch.travel_expectation ?? null,
      direct_reports_band: arch.direct_reports_band ?? null,
      indirect_reports_band: arch.indirect_reports_band ?? null,
      industry_experience: arch.industry_experience ?? null,
      domain_preference: arch.domain_preference ?? null,
      openings: 1,
      created_by: ctx.ownerDsoUserId,
      posted_at: status === "draft" ? null : daysAgo(now, postedDaysAgo),
      created_at: daysAgo(now, postedDaysAgo + 1),
      ...arch.comp,
    });
    bump("jobs");

    // locations: tie to 1-2 of the DSO's locations
    const locId = ctx.locationIds[i % ctx.locationIds.length];
    await insertRows(supa, "job_locations", [{ job_id: jobId, location_id: locId }]);

    // skills
    await insertRows(supa, "job_skills", arch.skills.map((s) => ({ job_id: jobId, skill: s })));

    // screening questions
    const sqRows = arch.screening.map((q, qi) => ({
      job_id: jobId,
      prompt: q.prompt,
      kind: q.kind,
      required: q.required,
      knockout: q.knockout ?? false,
      options: q.options ?? null,
      knockout_correct_answer: q.knockout_correct_answer ?? null,
      sort_order: qi * 10,
    }));
    const insertedSq = await insertReturning(supa, "job_screening_questions", sqRows);
    const firstScreeningQId = (insertedSq[0]?.id as string) ?? null;

    // verification requirements
    if (arch.verifications.length > 0) {
      await insertRows(
        supa,
        "job_verification_requirements",
        arch.verifications.map((v) => ({ job_id: jobId, verification_type: v, required: true }))
      );
    }

    out.push({ id: jobId, dsoId: ctx.id, archetype: arch, firstScreeningQId });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────
 * Pipeline (applications + processes) — hero-heavy
 * ─────────────────────────────────────────────────────────── */

interface PlannedApp {
  candidate: CandidateCtx;
  job: JobCtx;
  stageKind: string;
  createdDaysAgo: number;
  stageDaysAgo: number;
  hired?: boolean;
  rejected?: boolean;
  withdrawn?: boolean;
  disposition?: string;
  offerOut?: boolean;
  offerAccepted?: boolean;
  scorecard?: boolean;
  interview?: boolean;
  messages?: boolean;
}

function candidatesByArchetype(cands: CandidateCtx[], archetype: string): CandidateCtx[] {
  // map job role_category → candidate archetype
  return cands.filter((c) => c.archetype === archetype);
}

async function seedPipeline(
  supa: Supa,
  now: Date,
  hero: DsoCtx,
  heroJobs: JobCtx[],
  cands: CandidateCtx[],
  bump: (k: string, n?: number) => void,
  seenPairs: Set<string>
): Promise<void> {
  const actorDsoUserId = hero.recruiterDsoUserId ?? hero.ownerDsoUserId;
  const actorAuthId = hero.ownerAuthId;

  // helper to find a hero job by archetype key
  const jobOf = (key: string) => heroJobs.find((j) => j.archetype.key === key) ?? heroJobs[0];
  const dentistJob = jobOf("associate_dentist");
  const hygieneJob = jobOf("hygienist");
  const assistantJob = jobOf("dental_assistant");
  const omJob = jobOf("office_manager");
  const rcmJob = jobOf("rcm_specialist");

  // pools
  const dentists = candidatesByArchetype(cands, "dentist");
  const hygienists = candidatesByArchetype(cands, "hygienist");
  const assistants = candidatesByArchetype(cands, "assistant");
  const oms = candidatesByArchetype(cands, "office_manager");
  const rcms = candidatesByArchetype(cands, "rcm");

  const jordan = cands.find((c) => c.first === "Jordan" && c.last === "Bailey")!;
  const sarah = cands.find((c) => c.first === "Sarah" && c.last === "Chen");
  const michael = cands.find((c) => c.first === "Michael" && c.last === "Patel");

  const plan: PlannedApp[] = [];
  const used = new Set<string>();
  const take = (pool: CandidateCtx[]): CandidateCtx | null => {
    for (const c of pool) if (!used.has(c.id)) { used.add(c.id); return c; }
    return null;
  };

  // Jordan — named, applied, mid-interview with scorecard + messages.
  used.add(jordan.id);
  plan.push({ candidate: jordan, job: dentistJob, stageKind: "interview", createdDaysAgo: 12, stageDaysAgo: 4, scorecard: true, interview: true, messages: true });

  // SLA-breached NEW apps (open, created > 5d ago) — at least 2.
  for (let i = 0; i < 2; i++) {
    const c = take(dentists) ?? take(hygienists);
    if (c) plan.push({ candidate: c, job: i === 0 ? dentistJob : hygieneJob, stageKind: "open", createdDaysAgo: 7 + i * 2, stageDaysAgo: 7 + i * 2 });
  }
  // fresh open apps
  for (let i = 0; i < 3; i++) {
    const c = take(hygienists) ?? take(assistants) ?? take(dentists);
    if (c) plan.push({ candidate: c, job: pickJob([hygieneJob, assistantJob, dentistJob], i), stageKind: "open", createdDaysAgo: i, stageDaysAgo: i });
  }
  // STALLED mid-pipeline (screen, entered > 14d ago) — at least 2.
  for (let i = 0; i < 2; i++) {
    const c = take(assistants) ?? take(hygienists) ?? take(dentists);
    if (c) plan.push({ candidate: c, job: pickJob([assistantJob, hygieneJob], i), stageKind: "screen", createdDaysAgo: 24 + i * 3, stageDaysAgo: 16 + i * 2, messages: i === 0 });
  }
  // healthy screen
  {
    const c = take(oms) ?? take(rcms);
    if (c) plan.push({ candidate: c, job: omJob, stageKind: "screen", createdDaysAgo: 6, stageDaysAgo: 3, scorecard: true });
  }
  // interview stage with interview booking
  for (let i = 0; i < 2; i++) {
    const c = take(dentists) ?? take(hygienists);
    if (c) plan.push({ candidate: c, job: pickJob([dentistJob, hygieneJob], i), stageKind: "interview", createdDaysAgo: 18 + i * 2, stageDaysAgo: 5 + i, interview: true, scorecard: i === 0, messages: true });
  }
  // OFFERS OUT (offer stage, sent, awaiting response) — 2.
  for (let i = 0; i < 2; i++) {
    const c = take(dentists) ?? take(rcms) ?? take(oms);
    if (c) plan.push({ candidate: c, job: pickJob([dentistJob, rcmJob], i), stageKind: "offer", createdDaysAgo: 22 + i * 2, stageDaysAgo: 3 + i, offerOut: true, messages: true });
  }
  // HIRED (offer accepted, typed-name signature) — 2.
  for (let i = 0; i < 2; i++) {
    const c = take(hygienists) ?? take(assistants) ?? take(dentists);
    if (c) plan.push({ candidate: c, job: pickJob([hygieneJob, assistantJob], i), stageKind: "hired", createdDaysAgo: 40 + i * 5, stageDaysAgo: 6 + i, hired: true, offerAccepted: true, scorecard: true });
  }
  // REJECTED with dispositions — 4.
  const dispositions = ["experience_insufficient", "compensation_misaligned", "location_commute", "stronger_candidate"];
  for (let i = 0; i < 4; i++) {
    const c = take(assistants) ?? take(hygienists) ?? take(dentists) ?? take(oms);
    if (c) plan.push({ candidate: c, job: pickJob([assistantJob, hygieneJob, dentistJob], i), stageKind: "rejected", createdDaysAgo: 30 + i * 4, stageDaysAgo: 10 + i * 2, rejected: true, disposition: dispositions[i] });
  }
  // WITHDRAWN — 1.
  {
    const c = take(dentists) ?? take(hygienists);
    if (c) plan.push({ candidate: c, job: dentistJob, stageKind: "withdrawn", createdDaysAgo: 20, stageDaysAgo: 8, withdrawn: true, disposition: "accepted_other" });
  }

  await materializeApps(supa, now, hero, plan, actorDsoUserId, actorAuthId, bump, seenPairs);

  // Stash maria/sarah/michael references for sourcing/credential beats via app
  // on hero (Sarah expiring license applicant so credentialing roll-up shows).
  const credApps: PlannedApp[] = [];
  if (sarah) credApps.push({ candidate: sarah, job: hygieneJob, stageKind: "screen", createdDaysAgo: 9, stageDaysAgo: 4, messages: true });
  if (michael) credApps.push({ candidate: michael, job: dentistJob, stageKind: "interview", createdDaysAgo: 14, stageDaysAgo: 3, interview: true });
  if (credApps.length) await materializeApps(supa, now, hero, credApps, actorDsoUserId, actorAuthId, bump, seenPairs);
}

function pickJob(jobs: JobCtx[], i: number): JobCtx {
  return jobs[i % jobs.length];
}

async function materializeApps(
  supa: Supa,
  now: Date,
  ctx: DsoCtx,
  plan: PlannedApp[],
  actorDsoUserId: string,
  actorAuthId: string,
  bump: (k: string, n?: number) => void,
  seenPairs: Set<string>
): Promise<void> {
  const STAGE_ORDER = ["open", "screen", "interview", "offer", "hired"];

  for (const a of plan) {
    // applications has a unique (job_id, candidate_id) — never seed a pair twice.
    const pairKey = `${a.job.id}:${a.candidate.id}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const stageId = ctx.stageByKind[a.stageKind];
    const appId = await insertOne(supa, "applications", {
      job_id: a.job.id,
      candidate_id: a.candidate.id,
      stage_id: stageId,
      created_at: daysAgo(now, a.createdDaysAgo),
      stage_entered_at: daysAgo(now, a.stageDaysAgo),
      affiliation_revealed: false,
      knockout_failed_questions: [],
      source: "demo",
      first_response_at: a.stageKind === "open" ? null : daysAgo(now, a.createdDaysAgo - 1),
      hired_at: a.hired ? daysAgo(now, a.stageDaysAgo) : null,
      withdrawn_at: a.withdrawn ? daysAgo(now, a.stageDaysAgo) : null,
      assigned_to_dso_user_id: actorDsoUserId,
    });
    bump("applications");

    // Replace the auto-seeded status event with a curated backdated chain.
    // actor_id references auth.users (not dso_users), so pass the actor auth id.
    await supa.from("application_status_events").delete().eq("application_id", appId);
    const events = buildStatusChain(now, a, STAGE_ORDER, actorAuthId);
    await insertRows(supa, "application_status_events", events.map((e) => ({ ...e, application_id: appId })));

    // a screening answer (the first question is the yes/no licensure knockout)
    if (a.job.firstScreeningQId) {
      await insertRows(supa, "application_question_answers", [
        { application_id: appId, question_id: a.job.firstScreeningQId, answer_text: "Yes — licensed in-state." },
      ]);
    }

    // messages thread + an internal note. application_messages CHECKs:
    //   kind ∈ {text,system,rich_card}; 'text' requires sender_user_id NOT NULL
    //   + event_kind NULL; sender_role ∈ {candidate, employer}.
    if (a.messages) {
      const msgs: Record<string, unknown>[] = [
        {
          application_id: appId,
          kind: "text",
          sender_role: "employer",
          sender_user_id: actorAuthId,
          sender_dso_user_id: actorDsoUserId,
          body: `Hi ${a.candidate.first}, thanks for applying to ${ctx.def.name}! We'd love to learn more — do you have time this week for a quick call?`,
          created_at: daysAgo(now, Math.max(1, a.stageDaysAgo + 1)),
          read_at: daysAgo(now, a.stageDaysAgo),
        },
      ];
      if (a.candidate.authUserId) {
        msgs.push({
          application_id: appId,
          kind: "text",
          sender_role: "candidate",
          sender_user_id: a.candidate.authUserId,
          body: `Hi! Yes — I'm definitely interested. I'm free Thursday afternoon or Friday morning.`,
          created_at: daysAgo(now, Math.max(0, a.stageDaysAgo)),
        });
      }
      await insertRows(supa, "application_messages", msgs);
      bump("application_messages", msgs.length);
      await insertRows(supa, "application_comments", [
        {
          application_id: appId,
          author_user_id: actorAuthId,
          author_dso_user_id: actorDsoUserId,
          body: `Strong ${a.candidate.archetype} background — fits the ${ctx.def.cultureChips[0]?.toLowerCase()} culture. Worth fast-tracking.`,
          mentioned_user_ids: [],
          created_at: daysAgo(now, a.stageDaysAgo),
        },
      ]);
      bump("application_comments");
    }

    // scorecard (submitted)
    if (a.scorecard) {
      await insertRows(supa, "application_scorecards", [
        {
          application_id: appId,
          reviewer_user_id: actorAuthId,
          reviewer_dso_user_id: actorDsoUserId,
          rubric_id: "default",
          status: "submitted",
          attribute_scores: { clinical_skill: { score: 4 }, communication: { score: 5 }, culture_fit: { score: 4 } },
          overall_recommendation: "yes",
          overall_note: "Clear communicator, strong clinical fundamentals. Recommend advancing.",
          submitted_at: daysAgo(now, Math.max(1, a.stageDaysAgo - 1)),
          created_at: daysAgo(now, a.stageDaysAgo),
        },
      ]);
      bump("application_scorecards");
    }

    // interview proposal + booking
    if (a.interview) {
      const propId = await insertOne(supa, "interview_proposals", {
        application_id: appId,
        proposed_by: actorDsoUserId,
        status: "booked",
        interview_kind: "video",
        duration_minutes: 45,
        location_text: "Google Meet (link to follow)",
        message_to_candidate: "Looking forward to chatting!",
        created_at: daysAgo(now, a.stageDaysAgo + 1),
      });
      const optRows = await insertReturning(supa, "interview_proposal_options", [
        { proposal_id: propId, start_at: daysAgo(now, -2), sort_order: 0 },
        { proposal_id: propId, start_at: daysAgo(now, -3), sort_order: 1 },
      ]);
      await insertRows(supa, "interview_bookings", [
        {
          proposal_id: propId,
          selected_option_id: optRows[0].id,
          candidate_confirmed_at: daysAgo(now, a.stageDaysAgo),
          candidate_notes: "Thanks — see you then!",
        },
      ]);
      bump("interviews");
    }

    // offers
    if (a.offerOut || a.offerAccepted) {
      const baseAmt = a.candidate.archetype === "dentist" ? 195000 : a.candidate.archetype === "hygienist" ? 110000 : 70000;
      const offerId = await insertOne(supa, "application_offer_sends", {
        application_id: appId,
        recipient_email: candidateEmail(a.candidate.slug),
        sent_by_user_id: actorAuthId,
        subject: `Your offer from ${ctx.def.name}`,
        body_html: `<p>Dear ${a.candidate.first},</p><p>We're thrilled to offer you the ${a.job.archetype.title} role at ${ctx.def.name}.</p>`,
        merge_values: { candidate_first_name: a.candidate.first, role: a.job.archetype.title },
        base_amount: baseAmt,
        base_period: "annual",
        approval_status: "not_required",
        sent_at: daysAgo(now, a.stageDaysAgo),
      });
      bump("offers_sent");
      if (a.offerAccepted) {
        await insertRows(supa, "application_offer_responses", [
          {
            application_id: appId,
            offer_send_id: offerId,
            response: "accepted",
            signed_name: `${a.candidate.first} ${a.candidate.last}`,
            responded_at: daysAgo(now, Math.max(0, a.stageDaysAgo - 1)),
          },
        ]);
        bump("offers_accepted");
      }
    }
  }
}

function buildStatusChain(
  now: Date,
  a: PlannedApp,
  order: string[],
  actorAuthId: string
): Record<string, unknown>[] {
  const labels: Record<string, string> = { open: "New", screen: "Screening", interview: "Interview", offer: "Offer", hired: "Hired", rejected: "Rejected", withdrawn: "Withdrawn" };
  const events: Record<string, unknown>[] = [];
  // Build the path open→…→target.
  let path: string[];
  if (a.stageKind === "rejected" || a.stageKind === "withdrawn") {
    path = ["open", "screen", a.stageKind];
  } else {
    const ti = order.indexOf(a.stageKind);
    path = order.slice(0, ti + 1);
  }
  const span = Math.max(1, a.createdDaysAgo - a.stageDaysAgo);
  let prevKind: string | null = null;
  path.forEach((kind, i) => {
    const frac = path.length > 1 ? i / (path.length - 1) : 0;
    const at = a.createdDaysAgo - Math.round(span * frac);
    events.push({
      actor_type: i === 0 ? "system" : "employer",
      actor_id: i === 0 ? null : actorAuthId,
      from_stage_kind: prevKind,
      from_stage_label: prevKind ? labels[prevKind] : null,
      to_stage_kind: kind,
      to_stage_label: labels[kind],
      disposition_code: (kind === "rejected" || kind === "withdrawn") ? (a.disposition ?? null) : null,
      note: kind === "rejected" ? "Thanks for your interest — moving forward with other candidates." : null,
      created_at: daysAgo(now, Math.max(a.stageDaysAgo, at)),
    });
    prevKind = kind;
  });
  return events;
}

/* ──────────────────────────────────────────────────────────────
 * Cross-DSO applications (so a candidate appears across DSOs)
 * ─────────────────────────────────────────────────────────── */

async function seedCrossDsoApplications(
  supa: Supa,
  now: Date,
  dsoCtxBySlug: Map<string, DsoCtx>,
  jobsByDso: Map<string, JobCtx[]>,
  cands: CandidateCtx[],
  bump: (k: string, n?: number) => void,
  seenPairs: Set<string>
): Promise<void> {
  const targets = ["lakeshore-dental-group", "riverstone-dental-partners"];
  const jordan = cands.find((c) => c.first === "Jordan" && c.last === "Bailey");
  for (const slug of targets) {
    const ctx = dsoCtxBySlug.get(slug);
    const jobs = jobsByDso.get(slug);
    if (!ctx || !jobs) continue;
    const dentistJob = jobs.find((j) => j.archetype.role_category === "dentist") ?? jobs[0];
    const pool = cands.filter((c) => c.archetype === "dentist");
    const picks = [jordan, pool[0], pool[1]].filter(Boolean) as CandidateCtx[];
    const plan: PlannedApp[] = picks.slice(0, 2).map((c, i) => ({
      candidate: c,
      job: dentistJob,
      stageKind: i === 0 ? "screen" : "open",
      createdDaysAgo: 8 + i * 3,
      stageDaysAgo: 3 + i,
    }));
    await materializeApps(supa, now, ctx, plan, ctx.ownerDsoUserId, ctx.ownerAuthId, bump, seenPairs);
  }
}

/* ──────────────────────────────────────────────────────────────
 * Sourcing — talent pool + double-blind prospect thread + outreach
 * ─────────────────────────────────────────────────────────── */

async function seedSourcing(
  supa: Supa,
  now: Date,
  hero: DsoCtx,
  cands: CandidateCtx[],
  bump: (k: string, n?: number) => void
): Promise<void> {
  const addedBy = hero.recruiterDsoUserId ?? hero.ownerDsoUserId;
  const maria = cands.find((c) => c.first === "Maria" && c.last === "Lopez")!;
  // talent pool: Maria + several discoverable candidates
  const poolPicks = [maria, ...cands.filter((c) => c.visibility !== "private" && c.id !== maria.id).slice(0, 7)];
  const stages = ["sourced", "contacted", "responded", "nurturing", "sourced", "contacted", "sourced", "nurturing"];
  const poolRows = poolPicks.map((c, i) => ({
    dso_id: hero.id,
    candidate_id: c.id,
    added_by: addedBy,
    notes: i === 0 ? "Top target — exact fit for the Cherry Creek associate opening." : "Promising — keep warm.",
    tags: i === 0 ? ["priority", "associate-dentist"] : ["watch"],
    pipeline_stage: stages[i % stages.length],
    last_activity_at: daysAgo(now, i + 1),
    created_at: daysAgo(now, 10 + i),
  }));
  await insertRows(supa, "dso_talent_pool_entries", poolRows);
  bump("talent_pool", poolRows.length);

  // prospect activities
  const actRows = poolPicks.slice(0, 4).flatMap((c, i) => [
    { dso_id: hero.id, candidate_id: c.id, kind: "saved", actor_dso_user_id: addedBy, metadata: {}, created_at: daysAgo(now, 10 + i) },
    { dso_id: hero.id, candidate_id: c.id, kind: "outreach_sent", actor_dso_user_id: addedBy, metadata: {}, created_at: daysAgo(now, 8 + i) },
  ]);
  await insertRows(supa, "dso_prospect_activities", actRows);
  bump("prospect_activities", actRows.length);

  // double-blind prospect thread, mid-conversation, NOT revealed (Maria)
  const threadId = await insertOne(supa, "prospect_threads", {
    dso_id: hero.id,
    candidate_id: maria.id,
    created_by: addedBy,
    status: "active",
    candidate_revealed: false,
    last_message_at: daysAgo(now, 1),
    created_at: daysAgo(now, 6),
  });
  await insertRows(supa, "prospect_messages", [
    {
      thread_id: threadId,
      sender_role: "dso",
      sender_dso_user_id: addedBy,
      body: "Hi! We came across your (anonymized) profile and think you'd be a strong fit for an associate role on Colorado's Front Range. Open to a confidential chat?",
      created_at: daysAgo(now, 6),
      read_at: daysAgo(now, 5),
    },
    {
      thread_id: threadId,
      sender_role: "candidate",
      sender_user_id: maria.authUserId,
      body: "Thanks for reaching out — I'm exploring quietly, so I appreciate the discretion. What's the comp structure and which areas of the metro?",
      created_at: daysAgo(now, 5),
      read_at: daysAgo(now, 4),
    },
    {
      thread_id: threadId,
      sender_role: "dso",
      sender_dso_user_id: addedBy,
      body: "Totally understand. It's a guarantee + collections model, est. $175–260k, with offices in Cherry Creek and Boulder. Happy to share more when you're ready.",
      created_at: daysAgo(now, 1),
    },
  ]);
  bump("prospect_messages", 3);

  // outreach messages (email-style, with opens/replies)
  const outreachRows = poolPicks.slice(1, 5).map((c, i) => ({
    dso_id: hero.id,
    candidate_id: c.id,
    sent_by: addedBy,
    subject: "An associate opportunity with Bridgeway Dental Partners",
    body: `Hi there — your background caught our eye. We're hiring across the Front Range and would love to connect.`,
    sent_at: daysAgo(now, 7 - i),
    opened_at: i < 3 ? daysAgo(now, 6 - i) : null,
    replied_at: i < 2 ? daysAgo(now, 5 - i) : null,
  }));
  await insertRows(supa, "dso_outreach_messages", outreachRows);
  bump("outreach_messages", outreachRows.length);
}

/* ──────────────────────────────────────────────────────────────
 * Analytics — backdated Vantage events
 * ─────────────────────────────────────────────────────────── */

async function seedAnalytics(
  supa: Supa,
  now: Date,
  hero: DsoCtx,
  heroJobs: JobCtx[],
  bump: (k: string, n?: number) => void
): Promise<void> {
  const rng = makeRng(20260629);
  const paths = ["/", "/companies", `/${hero.def.slug}`, "/jobs", "/pricing", "/for-dsos", "/sign-in"];
  const channels = ["Direct", "Organic Search", "Referral", "Organic Social", "Email"];
  const eventRows: Record<string, unknown>[] = [];
  const DAYS = 30;
  for (let d = DAYS; d >= 0; d--) {
    const dailyVisitors = 18 + Math.floor(rng() * 26);
    for (let v = 0; v < dailyVisitors; v++) {
      const visitorId = 100000 + d * 1000 + v;
      const sessionId = 900000 + d * 1000 + v;
      const channel = pick(rng, channels);
      const pageviews = 1 + Math.floor(rng() * 4);
      for (let p = 0; p < pageviews; p++) {
        eventRows.push({
          occurred_at: daysAgo(now, d, Math.floor(rng() * 22)),
          event_type: 1,
          event_name: "pageview",
          visitor_id: visitorId,
          session_id: sessionId,
          path: pick(rng, paths),
          referrer_host: channel === "Organic Search" ? "google.com" : channel === "Referral" ? "dentaltown.com" : null,
          channel,
          browser: pick(rng, ["Chrome", "Safari", "Edge", "Firefox"]),
          os: pick(rng, ["macOS", "Windows", "iOS", "Android"]),
          device: pick(rng, ["desktop", "mobile", "desktop"]),
          country: "US",
          region: pick(rng, ["CO", "AZ", "OR", "WI", "TX"]),
          props: { [SEED_BATCH_KEY]: SEED_BATCH },
        });
      }
      // occasional goals
      if (rng() > 0.85) {
        eventRows.push({
          occurred_at: daysAgo(now, d, Math.floor(rng() * 22)),
          event_type: 2,
          event_name: pick(rng, ["signup_employer", "signup_candidate", "checkout_complete"]),
          visitor_id: visitorId,
          session_id: sessionId,
          path: "/sign-up",
          channel,
          browser: "Chrome",
          os: "macOS",
          device: "desktop",
          country: "US",
          region: "CO",
          props: { [SEED_BATCH_KEY]: SEED_BATCH, tier: pick(rng, ["solo", "growth", "scale"]) },
        });
      }
    }
  }
  // analytics schema isn't exposed to PostgREST — insert through the scoped
  // SECURITY DEFINER RPC, chunked to keep the jsonb payload sane.
  const A_CHUNK = 500;
  for (let i = 0; i < eventRows.length; i += A_CHUNK) {
    const slice = eventRows.slice(i, i + A_CHUNK);
    const { error } = await supa.rpc("demo_seed_insert_events", { p_events: slice });
    if (error) throw new Error(`[demo-seed] insert analytics.events failed: ${error.message}`);
  }
  bump("analytics_events", eventRows.length);

  // job_view_events for hero jobs
  const viewRows: Record<string, unknown>[] = [];
  for (const j of heroJobs) {
    const views = 8 + Math.floor(rng() * 30);
    for (let i = 0; i < views; i++) {
      viewRows.push({
        job_id: j.id,
        viewed_at: daysAgo(now, Math.floor(rng() * 30), Math.floor(rng() * 22)),
        session_id: `demo-sess-${Math.floor(rng() * 1e6)}`,
        source: pick(rng, ["companies", "indeed", "linkedin", "direct"]),
        referer_host: pick(rng, ["google.com", "dentaltown.com", "linkedin.com"]),
        is_authenticated: rng() > 0.7,
      });
    }
  }
  await insertRows(supa, "job_view_events", viewRows);
  bump("job_view_events", viewRows.length);

  // application_starts (funnel)
  const startRows: Record<string, unknown>[] = [];
  for (const j of heroJobs.slice(0, 6)) {
    const starts = 2 + Math.floor(rng() * 6);
    for (let i = 0; i < starts; i++) {
      startRows.push({ job_id: j.id, session_id: `demo-start-${Math.floor(rng() * 1e6)}`, started_at: daysAgo(now, Math.floor(rng() * 25)) });
    }
  }
  await insertRows(supa, "application_starts", startRows);
  bump("application_starts", startRows.length);
}

/* ──────────────────────────────────────────────────────────────
 * Fit pre-warm — compute + cache scores so they render instantly
 * ─────────────────────────────────────────────────────────── */

async function prewarmFit(
  supa: Supa,
  hero: DsoCtx,
  heroJobs: JobCtx[],
  cands: CandidateCtx[],
  log: (m: string) => void
): Promise<number> {
  // Cast: getPracticeFit accepts an injected client; the service-role client is
  // shape-compatible and bypasses RLS for the candidate-private reads.
  const client = supa as unknown as Parameters<typeof getPracticeFit>[2];
  let warmed = 0;

  // Map candidate archetype → the hero job role_category it best matches.
  const jobForArch = (arch: string): JobCtx | undefined => {
    const map: Record<string, string> = {
      dentist: "dentist",
      hygienist: "dental_hygienist",
      assistant: "dental_assistant",
      office_manager: "office_manager",
      treatment_coordinator: "treatment_coordinator",
      front_office: "front_office",
      endodontist: "specialist",
      pediatric_dentist: "specialist",
      rcm: "other",
      regional_manager: "regional_manager",
      finance: "other",
    };
    const rc = map[arch];
    return heroJobs.find((j) => j.archetype.role_category === rc && (arch !== "rcm" || j.archetype.corporate_function === "revenue-cycle-management") && (arch !== "regional_manager" || j.archetype.role_category === "regional_manager"));
  };

  for (const c of cands) {
    const job = jobForArch(c.archetype);
    if (!job) continue;
    try {
      const res = await getPracticeFit(c.id, job.id, client);
      if (res) warmed += 1;
    } catch (e) {
      log(`prewarm ${c.slug} failed: ${(e as Error).message}`);
    }
  }
  return warmed;
}
