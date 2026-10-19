/**
 * POST /demo/engaged (demo deployment only): the browser reports that a
 * real person is using the demo (trusted input after a few visible
 * seconds; see components/employer/demo-engagement.tsx). Only then is the
 * open counted and the "just opened the demo" email sent. Counting the raw
 * GET /demo instead fired on email security scanners and link previews,
 * which load every link in a message without anyone reading it.
 */
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { isDemoDeployment } from "@/lib/demo/mode";
import { BOT_UA, reportDemoVisit } from "@/lib/demo/report-visit";
import { DEMO_FOR_COOKIE, sanitizeForLabel } from "@/lib/marketing/demo";

const ENGAGED_COOKIE = "dh_demo_engaged";

export async function POST(request: Request) {
  if (!isDemoDeployment()) return new NextResponse(null, { status: 404 });
  const h = await headers();
  const origin = h.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const ua = h.get("user-agent");
  if (!ua || BOT_UA.test(ua)) return NextResponse.json({ ok: true, counted: false });

  const jar = await cookies();
  /* once per browser session */
  if (jar.get(ENGAGED_COOKIE)) return NextResponse.json({ ok: true, counted: false });
  jar.set(ENGAGED_COOKIE, "1", { path: "/", httpOnly: true, sameSite: "lax", secure: true });

  const label = sanitizeForLabel(jar.get(DEMO_FOR_COOKIE)?.value ?? null);
  await reportDemoVisit(label, h.get("referer"), ua);
  return NextResponse.json({ ok: true, counted: true });
}
