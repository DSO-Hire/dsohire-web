/**
 * Public-facing list of job attachments on /jobs/[id] (E1.10).
 *
 * Render rules:
 *   - Public viewer (no candidate session): shows only non-gated rows.
 *     RLS does the filtering server-side; this component renders what
 *     the server gave it.
 *   - Candidate who's applied to the job: sees all rows including the
 *     hide_until_applied ones. RLS again gives them everything.
 *   - If at least one gated row exists in the DB but the viewer can't
 *     see it (signal not exposed via row count alone — out of scope
 *     for v1), we don't tease it. Apply first, then see.
 *
 * Signed URLs are issued with a 1-hour TTL via loadJobAttachmentsWithUrls.
 */

import { Paperclip, Download, EyeOff, FileText, Image as ImageIcon, FileSpreadsheet } from "lucide-react";
import type { JobAttachmentWithUrl } from "@/lib/jobs/attachments";

interface JobAttachmentsPublicProps {
  attachments: JobAttachmentWithUrl[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel") {
    return FileSpreadsheet;
  }
  return FileText;
}

function mimeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime === "application/msword") return "DOC";
  if (mime.includes("spreadsheetml")) return "XLSX";
  if (mime === "application/vnd.ms-excel") return "XLS";
  if (mime.startsWith("image/")) return mime.split("/")[1].toUpperCase();
  return mime;
}

export function JobAttachmentsPublic({ attachments }: JobAttachmentsPublicProps) {
  if (attachments.length === 0) return null;

  return (
    <section className="mt-10 pt-8 border-t border-[var(--rule)]">
      <div className="flex items-center gap-2 mb-4">
        <Paperclip className="h-5 w-5 text-heritage-deep" aria-hidden />
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink">
          Attachments
        </h2>
      </div>
      <p className="text-[13px] text-slate-body mb-5 max-w-[560px] leading-relaxed">
        Documents the practice shared to help you evaluate this role.
      </p>
      <ul className="space-y-2">
        {attachments.map((att) => {
          const Icon = iconFor(att.mime_type);
          const isImage = att.mime_type.startsWith("image/");
          const href = att.signed_url ?? "#";
          return (
            <li
              key={att.id}
              className="flex items-center gap-3 border border-[var(--rule)] bg-card px-4 py-3 hover:bg-cream/30 transition-colors"
            >
              <Icon className="h-5 w-5 text-heritage-deep shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {att.display_name}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[12px] text-slate-body">
                  <span>{mimeLabel(att.mime_type)}</span>
                  <span aria-hidden>&middot;</span>
                  <span>{formatSize(att.file_size_bytes)}</span>
                  {att.hide_until_applied && (
                    <>
                      <span aria-hidden>&middot;</span>
                      <span className="inline-flex items-center gap-1 text-warning">
                        <EyeOff className="h-3 w-3" />
                        Shared with applicants
                      </span>
                    </>
                  )}
                </div>
              </div>
              {att.signed_url ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={!isImage ? att.display_name : undefined}
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isImage ? "View" : "Download"}
                </a>
              ) : (
                <span className="text-[12px] text-meta-foreground italic shrink-0">
                  Unavailable
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
