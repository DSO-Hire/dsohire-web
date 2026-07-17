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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoDeployment } from "@/lib/demo/mode";
import { demoEmail, DEMO_VIEWER_LOCAL } from "@/lib/demo-seed/auth";
import { DEMO_PASSWORD } from "@/lib/demo-seed/constants";

export async function GET() {
  if (!isDemoDeployment()) {
    return new NextResponse(null, { status: 404 });
  }

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
