/**
 * POST /api/leads: lead capture for the DEMO deployment.
 *
 * The marketing site calls captureLead as a server action. The live demo
 * (demo.dsohire.com) is a separate deployment with its own database, so its
 * in-app asks ("Want to do this for real?") POST here instead, and the lead
 * lands in PROD's marketing_leads next to every other hand-raise.
 *
 * CORS is pinned to the demo origin; everything else about the request is
 * validated by captureLead (contact format, honeypot, flood guard).
 */

import { NextResponse } from "next/server";
import { captureLead } from "@/lib/marketing/lead-actions";
import { LEAD_KINDS, type LeadInput } from "@/lib/marketing/leads";
import { DEMO_ORIGIN } from "@/lib/marketing/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cors(origin: string | null): Record<string, string> {
  return origin === DEMO_ORIGIN
    ? {
        "Access-Control-Allow-Origin": DEMO_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get("origin")) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  if (origin !== DEMO_ORIGIN) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403, headers });
  }
  let body: Partial<LeadInput>;
  try {
    body = (await request.json()) as Partial<LeadInput>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers });
  }
  if (!body.kind || !LEAD_KINDS.includes(body.kind)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers });
  }
  const res = await captureLead({
    kind: body.kind,
    contact: String(body.contact ?? ""),
    audience: body.audience === "candidate" ? "candidate" : "dso",
    context: body.context && typeof body.context === "object" ? body.context : undefined,
    sourcePath: typeof body.sourcePath === "string" ? `demo:${body.sourcePath}` : "demo",
    website: typeof body.website === "string" ? body.website : undefined,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 422, headers });
}
