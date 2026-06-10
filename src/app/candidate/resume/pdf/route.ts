/**
 * GET /candidate/resume/pdf — #87b
 *
 * Server-generates the signed-in candidate's résumé as a real PDF and streams
 * it as a download. Runs on the Node runtime (@react-pdf/renderer needs Node
 * APIs). Real selectable text → ATS-safe.
 */

import { getResumeData } from "@/lib/resume/resume-data";
import { renderResumePdfBuffer } from "@/components/resume/resume-pdf-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getResumeData();
  if (!data) {
    return new Response("No résumé found", { status: 404 });
  }

  const buffer = await renderResumePdfBuffer(data);

  const safeName =
    (data.name || "resume").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") ||
    "resume";

  // Wrap in a plain Uint8Array — a Node Buffer isn't typed as a web BodyInit
  // under current @types/node, but a Uint8Array is a valid BufferSource.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}_resume.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
