/**
 * GET /candidate/resume/pdf — #87b
 *
 * Server-generates the signed-in candidate's résumé as a real PDF and streams
 * it as a download. Runs on the Node runtime (@react-pdf/renderer needs Node
 * APIs). Real selectable text → ATS-safe.
 */

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getResumeData } from "@/lib/resume/resume-data";
import { ResumePdfDocument } from "@/components/resume/resume-pdf-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getResumeData();
  if (!data) {
    return new Response("No résumé found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    createElement(ResumePdfDocument, { data })
  );

  const safeName =
    (data.name || "resume").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") ||
    "resume";

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}_resume.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
