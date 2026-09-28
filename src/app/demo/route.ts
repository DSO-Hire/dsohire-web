/**
 * Demo Mode entry (spec docs/ClaudeCode_Demo_Mode_Tour_Spec_2026-07-16.md).
 *
 * GET /demo on the DEMO deployment signs the visitor into the shared
 * read-only demo_viewer account and lands them on the employer dashboard
 * with live Bridgeway data. Everything they can reach is SELECT-only
 * (restrictive RLS + revoked capabilities + action guards), so any number
 * of prospects can roam concurrently without trampling the environment.
 *
 * On any deployment WITHOUT the DEMO_MODE env flag (i.e. prod), this
 * route is a hard 404 — demo mode is structurally unreachable there:
 * the flag is absent AND the demo_viewer account does not exist in the
 * prod auth database.
 */

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { DEMO_FOR_COOKIE, PROD_ORIGIN, sanitizeForLabel } from "@/lib/marketing/demo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoDeployment } from "@/lib/demo/mode";
import { demoEmail, DEMO_VIEWER_LOCAL } from "@/lib/demo-seed/auth";
import { DEMO_PASSWORD } from "@/lib/demo-seed/constants";

/**
 * Report this open to PROD (demo_visits + "Bridgeway just opened the demo"
 * email for ?for= links). Capped at 1.5s and never throws: a slow or failed
 * report must not delay a prospect's first look.
 */
async function reportVisit(forLabel: string | null) {
  try {
    const h = await headers();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${PROD_ORIGIN}/api/demo-visits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.DEMO_EVENTS_SECRET
          ? { "x-demo-events-secret": process.env.DEMO_EVENTS_SECRET }
          : {}),
      },
      body: JSON.stringify({
        for: forLabel,
        referrer: h.get("referer"),
        userAgent: h.get("user-agent"),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    console.error("[demo] visit report failed", (err as Error).message);
  }
}

export async function GET(request: Request) {
  if (!isDemoDeployment()) {
    return new NextResponse(null, { status: 404 });
  }

  // Personalized outbound links: /demo?for=Bridgeway+Dental. Remembered for
  // the session so the app can say "Prepared for Bridgeway Dental" and so
  // any lead captured in-app carries who it came from.
  const forLabel = sanitizeForLabel(new URL(request.url).searchParams.get("for"));
  const jar = await cookies();
  if (forLabel) {
    jar.set(DEMO_FOR_COOKIE, forLabel, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  await reportVisit(forLabel ?? jar.get(DEMO_FOR_COOKIE)?.value ?? null);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: demoEmail(DEMO_VIEWER_LOCAL),
    password: DEMO_PASSWORD,
  });
  if (error) {
    // Viewer account missing (e.g. demo not yet reseeded with it) —
    // fall back to the marketing home rather than erroring a prospect.
    console.error("[demo] viewer sign-in failed:", error.message);
    redirect("/");
  }
  redirect("/employer/dashboard");
}
