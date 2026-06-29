/**
 * verify-demo.ts — asserts every hero "wow-beat" exists after a seed/reset, so
 * a reset can never silently produce an empty or half-built demo.
 *
 *   export NEXT_PUBLIC_SUPABASE_URL="https://viapivvlhjqvjhoflxmp.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service_role>"
 *   npx tsx --tsconfig tsconfig.json scripts/verify-demo.ts
 *
 * Exits non-zero on any failed check.
 */

import { createClient } from "@supabase/supabase-js";
import { SEED_BATCH } from "../src/lib/demo-seed/constants";
import { HERO_SLUG as HERO } from "../src/lib/demo-seed/data";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const DAY = 86400000;
const ago = (iso: string) => (Date.now() - new Date(iso).getTime()) / DAY;

async function main(): Promise<void> {
  console.log(`\nVerifying demo wow-beats on ${SUPABASE_URL}\n`);

  // Hero DSO.
  const { data: dso } = await supa
    .from("dsos")
    .select("id, name, slug, seed_batch")
    .eq("slug", HERO)
    .maybeSingle();
  check("hero DSO exists + marked demo_v1", !!dso && (dso as { seed_batch: string }).seed_batch === SEED_BATCH, dso ? (dso as { name: string }).name : "missing");
  if (!dso) {
    finish();
    return;
  }
  const heroId = (dso as { id: string }).id;

  // Jobs (clinical + corporate).
  const { data: jobs } = await supa
    .from("jobs")
    .select("id, role_category, corporate_function, status, scope, confidential")
    .eq("dso_id", heroId);
  const jobRows = (jobs ?? []) as {
    id: string; role_category: string; corporate_function: string | null; status: string; scope: string; confidential: boolean;
  }[];
  const jobIds = jobRows.map((j) => j.id);
  check("hero has many jobs", jobRows.length >= 12, `${jobRows.length} jobs`);
  check("hero has clinical jobs", jobRows.some((j) => ["dentist", "dental_hygienist", "dental_assistant", "specialist"].includes(j.role_category)));
  check("hero has corporate jobs (DSOFit)", jobRows.some((j) => !!j.corporate_function));
  const heroCorporateActive = jobRows.filter((j) => j.scope === "corporate" && j.status === "active");
  check("hero Corporate tab is rich (≥4 active corporate roles)", heroCorporateActive.length >= 4, `${heroCorporateActive.length}`);

  // Corporate roles across the whole demo set (the public /jobs Corporate tab).
  const { data: allCorp } = await supa
    .from("jobs")
    .select("id, dso_id, corporate_function, dsos!inner(seed_batch)")
    .eq("scope", "corporate")
    .eq("status", "active")
    .eq("dsos.seed_batch", SEED_BATCH);
  const corpRows = (allCorp ?? []) as { id: string; corporate_function: string | null }[];
  const corpFns = new Set(corpRows.map((c) => c.corporate_function).filter(Boolean));
  check("Corporate tab rich across DSOs (≥10 active corporate roles)", corpRows.length >= 10, `${corpRows.length} roles`);
  check("corporate roles span ≥5 functions", corpFns.size >= 5, `${corpFns.size} functions`);

  // Employer-side privacy: confidential search + affiliation masking.
  check("≥1 confidential job (employer privacy)", jobRows.some((j) => j.confidential), `${jobRows.filter((j) => j.confidential).length}`);
  const { data: maskedLocs } = await supa
    .from("dso_locations")
    .select("id, public_dso_affiliation, anonymize_name")
    .eq("dso_id", heroId);
  const ml = (maskedLocs ?? []) as { id: string; public_dso_affiliation: boolean; anonymize_name: boolean }[];
  check("≥1 affiliation-masked location (private affiliation)", ml.some((l) => !l.public_dso_affiliation), `${ml.filter((l) => !l.public_dso_affiliation).length}`);
  check("≥1 anonymize-name location", ml.some((l) => l.anonymize_name));

  // Stages.
  const { data: stages } = await supa
    .from("dso_pipeline_stages")
    .select("id, kind")
    .eq("dso_id", heroId);
  const stageKindById = new Map<string, string>();
  for (const s of (stages ?? []) as { id: string; kind: string }[]) stageKindById.set(s.id, s.kind);

  // Applications.
  const { data: apps } = await supa
    .from("applications")
    .select("id, stage_id, created_at, stage_entered_at, hired_at, withdrawn_at")
    .in("job_id", jobIds);
  const appRows = (apps ?? []) as {
    id: string; stage_id: string; created_at: string; stage_entered_at: string; hired_at: string | null; withdrawn_at: string | null;
  }[];
  const appIds = appRows.map((a) => a.id);
  const kindOf = (a: { stage_id: string }) => stageKindById.get(a.stage_id) ?? "?";
  const stagesPresent = new Set(appRows.map(kindOf));
  for (const k of ["open", "screen", "interview", "offer", "hired"]) {
    check(`pipeline has a candidate in '${k}'`, stagesPresent.has(k));
  }
  check("pipeline has a closed (rejected/withdrawn) candidate", stagesPresent.has("rejected") || stagesPresent.has("withdrawn"));

  // SLA-breached new app (open, created > 5d).
  check(
    "SLA-breached new app (open >5d)",
    appRows.some((a) => kindOf(a) === "open" && ago(a.created_at) > 5)
  );
  // Stalled mid-pipeline (screen/interview/offer entered > 14d).
  check(
    "stalled mid-pipeline app (>14d in stage)",
    appRows.some((a) => ["screen", "interview", "offer"].includes(kindOf(a)) && ago(a.stage_entered_at) > 14)
  );
  // Hired.
  check("≥1 hired (hired_at set)", appRows.some((a) => !!a.hired_at));

  // Offers out + accepted.
  const { data: offers } = await supa
    .from("application_offer_sends")
    .select("id, application_id")
    .in("application_id", appIds);
  const offerRows = (offers ?? []) as { id: string; application_id: string }[];
  const offerIds = offerRows.map((o) => o.id);
  const { data: responses } = await supa
    .from("application_offer_responses")
    .select("offer_send_id, response, signed_name")
    .in("offer_send_id", offerIds.length ? offerIds : ["00000000-0000-0000-0000-000000000000"]);
  const respByOffer = new Map<string, { response: string; signed_name: string | null }>();
  for (const r of (responses ?? []) as { offer_send_id: string; response: string; signed_name: string | null }[]) {
    respByOffer.set(r.offer_send_id, r);
  }
  check("≥1 offer out (sent, no response)", offerRows.some((o) => !respByOffer.has(o.id)));
  check(
    "≥1 offer accepted with typed-name signature",
    [...respByOffer.values()].some((r) => r.response === "accepted" && !!r.signed_name)
  );

  // Conversations + internal notes.
  const { count: msgCount } = await supa
    .from("application_messages")
    .select("id", { count: "exact", head: true })
    .in("application_id", appIds.length ? appIds : ["00000000-0000-0000-0000-000000000000"]);
  const { count: noteCount } = await supa
    .from("application_comments")
    .select("id", { count: "exact", head: true })
    .in("application_id", appIds.length ? appIds : ["00000000-0000-0000-0000-000000000000"]);
  check("≥1 message thread", (msgCount ?? 0) > 0, `${msgCount ?? 0} messages`);
  check("≥1 internal note", (noteCount ?? 0) > 0, `${noteCount ?? 0} notes`);

  // Scorecards + interviews.
  const { count: scCount } = await supa
    .from("application_scorecards")
    .select("id", { count: "exact", head: true })
    .in("application_id", appIds.length ? appIds : ["00000000-0000-0000-0000-000000000000"]);
  check("≥1 scorecard", (scCount ?? 0) > 0, `${scCount ?? 0}`);
  const { count: ivCount } = await supa
    .from("interview_proposals")
    .select("id", { count: "exact", head: true })
    .in("application_id", appIds.length ? appIds : ["00000000-0000-0000-0000-000000000000"]);
  check("≥1 scheduled interview", (ivCount ?? 0) > 0, `${ivCount ?? 0}`);

  // High fit (genuine ≥95) on a hero job.
  const { data: topFit } = await supa
    .from("practice_fit_scores")
    .select("score, candidate_id, job_id")
    .in("job_id", jobIds)
    .order("score", { ascending: false })
    .limit(1);
  const top = (topFit ?? [])[0] as { score: number } | undefined;
  check("≥1 genuine high fit (≥95) on a hero job", !!top && top.score >= 95, top ? `top=${top.score}` : "none");
  const { count: fitCount } = await supa
    .from("practice_fit_scores")
    .select("id", { count: "exact", head: true })
    .in("job_id", jobIds);
  check("fit cache pre-warmed (many scores)", (fitCount ?? 0) >= 20, `${fitCount ?? 0} scores`);

  // Expiring credential.
  const horizon = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10);
  const { count: expCount } = await supa
    .from("candidate_licenses")
    .select("id", { count: "exact", head: true })
    .lte("expires_date", horizon);
  check("≥1 expiring/expired credential", (expCount ?? 0) > 0, `${expCount ?? 0}`);

  // Talent pool: masked + named, + prospect thread mid-convo.
  const { data: pool } = await supa
    .from("dso_talent_pool_entries")
    .select("candidate_id")
    .eq("dso_id", heroId);
  const poolIds = ((pool ?? []) as { candidate_id: string }[]).map((r) => r.candidate_id);
  check("talent pool populated", poolIds.length >= 5, `${poolIds.length} saved`);
  const { data: poolCands } = await supa
    .from("candidates")
    .select("id, anonymous_mode, cv_visibility, full_name")
    .in("id", poolIds.length ? poolIds : ["00000000-0000-0000-0000-000000000000"]);
  const pc = (poolCands ?? []) as { id: string; anonymous_mode: boolean; cv_visibility: string; full_name: string }[];
  check("talent pool has a MASKED (anonymous) candidate", pc.some((c) => c.anonymous_mode));

  // Discover spread across the whole demo candidate set.
  const { data: allCands } = await supa
    .from("candidates")
    .select("anonymous_mode, cv_visibility")
    .eq("seed_batch", SEED_BATCH);
  const ac = (allCands ?? []) as { anonymous_mode: boolean; cv_visibility: string }[];
  const anon = ac.filter((c) => c.cv_visibility === "recruiters_only" && c.anonymous_mode).length;
  const named = ac.filter((c) => c.cv_visibility === "open_to_work").length;
  const priv = ac.filter((c) => c.cv_visibility === "hidden").length;
  check("visibility spread present (anonymous plurality)", anon > 0 && named > 0 && priv > 0 && anon >= named, `anon=${anon} named=${named} private=${priv}`);
  check("~70 candidates seeded", ac.length >= 60, `${ac.length}`);

  // Prospect thread mid-conversation (double-blind).
  const { data: threads } = await supa
    .from("prospect_threads")
    .select("id, candidate_revealed, status, last_message_at")
    .eq("dso_id", heroId);
  const tr = (threads ?? []) as { id: string; candidate_revealed: boolean; status: string; last_message_at: string | null }[];
  check("≥1 double-blind prospect thread mid-convo", tr.some((t) => t.status === "active" && !t.candidate_revealed && !!t.last_message_at));

  // Two-sided pair: Maria anonymous-discoverable + in pool + high fit.
  const { data: maria } = await supa
    .from("candidates")
    .select("id, anonymous_mode, cv_visibility")
    .eq("seed_batch", SEED_BATCH)
    .eq("full_name", "Maria Lopez")
    .maybeSingle();
  const mariaRow = maria as { id: string; anonymous_mode: boolean; cv_visibility: string } | null;
  check("two-sided pair: Maria is anonymous-discoverable", !!mariaRow && mariaRow.anonymous_mode && mariaRow.cv_visibility === "recruiters_only");
  if (mariaRow) {
    const { data: mariaFit } = await supa
      .from("practice_fit_scores")
      .select("score, job_id")
      .eq("candidate_id", mariaRow.id)
      .in("job_id", jobIds)
      .order("score", { ascending: false })
      .limit(1);
    const mf = (mariaFit ?? [])[0] as { score: number } | undefined;
    check("two-sided pair: Maria has a high fit on a hero job", !!mf && mf.score >= 90, mf ? `score=${mf.score}` : "none");
  }

  // Backdated analytics (the analytics schema isn't exposed to PostgREST, so
  // count via the scoped RPC the seed uses).
  const { data: evCount } = await supa.rpc("demo_seed_count_events");
  check("backdated analytics events present", (Number(evCount) || 0) > 100, `${evCount ?? 0} events`);

  finish();
}

function finish(): void {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-demo crashed:", e);
  process.exit(1);
});
